"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/authz";
import { audit } from "@/lib/audit";
import {
  pleskCreateSubdomain,
  pleskRemoveSubdomain,
  pleskRemoveAlias,
  isValidLabel,
} from "@/lib/plesk-domains";

type Result = { ok: boolean; error?: string; info?: string };
const OK: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

// Extract a short, safe message from a failed `plesk bin` call (Plesk's own
// stderr like "subdomain already exists" — never env or the raw error object).
function pleskMsg(err: unknown): string {
  const e = (err || {}) as { stderr?: string; message?: string };
  const s = String(e.stderr || e.message || "").trim();
  const first = s.split("\n").find((l) => l.trim()) || "";
  if (/ENOENT|not found|command not found/i.test(s)) {
    return "the server isn't set up for portal provisioning yet (plesk CLI/sudo rule missing).";
  }
  return first.slice(0, 200) || "the command failed.";
}

/**
 * Create a standalone subdomain on the server (not tied to a demo). Seeds a
 * placeholder page so it resolves cleanly over HTTPS via wildcard DNS + Plesk
 * auto-SSL. Admin only, audited.
 */
export async function addSubdomain(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const label = String(formData.get("label") || "").trim().toLowerCase();
  if (!isValidLabel(label)) {
    return fail("Subdomain must be lowercase letters, numbers, and hyphens (max 63).");
  }
  // Guard: don't collide with a demo's preview subdomain.
  const demo = await prisma.demo.findFirst({ where: { subdomainLabel: label } });
  if (demo) return fail(`A demo (${demo.businessName}) already uses that subdomain.`);

  let liveUrl: string;
  try {
    liveUrl = await pleskCreateSubdomain(label);
  } catch (err) {
    return fail(`Couldn't create the subdomain: ${pleskMsg(err)}`);
  }
  await audit({
    actorId: admin.id,
    action: "create",
    entityType: "Subdomain",
    summary: `Created subdomain ${liveUrl}`,
  });
  revalidatePath("/admin/domains");
  return { ok: true, info: `Created ${liveUrl}` };
}

/**
 * Remove a standalone subdomain from the server. REFUSES to remove a subdomain
 * that backs a demo — those are managed from the demo's own "Delete & tear
 * down" so the portal's demo state can't be silently broken. Admin only.
 */
export async function removeSubdomain(label: string): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const clean = String(label || "").trim().toLowerCase();
  if (!isValidLabel(clean)) return fail("Invalid subdomain.");

  const demo = await prisma.demo.findFirst({ where: { subdomainLabel: clean } });
  if (demo) {
    return fail(
      `That subdomain belongs to a demo (${demo.businessName}). Remove it from the Lead generator's "Delete & tear down" instead.`,
    );
  }
  try {
    await pleskRemoveSubdomain(clean);
  } catch (err) {
    return fail(`Couldn't remove the subdomain: ${pleskMsg(err)}`);
  }
  await audit({
    actorId: admin.id,
    action: "delete",
    entityType: "Subdomain",
    summary: `Removed subdomain ${clean}.${process.env.DEMO_DOMAIN || "rowancopy.com"}`,
  });
  revalidatePath("/admin/domains");
  return OK;
}

/**
 * Detach a custom domain from a demo: removes the Plesk site alias and resets
 * the demo's custom-domain fields. The demo's preview subdomain is untouched.
 * If the alias removal fails, the demo record is left as-is. Admin only.
 */
export async function detachCustomDomain(demoId: string): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const demo = await prisma.demo.findUnique({ where: { id: demoId } });
  if (!demo) return fail("Demo not found.");
  if (!demo.customDomain) return fail("This demo has no custom domain.");

  try {
    await pleskRemoveAlias(demo.customDomain);
  } catch (err) {
    return fail(`Couldn't remove the domain alias on the server: ${pleskMsg(err)}`);
  }
  await prisma.demo.update({
    where: { id: demo.id },
    data: { customDomain: null, customDomainStatus: "None", lastDnsCheck: null },
  });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "Demo",
    entityId: demo.id,
    summary: `Detached custom domain ${demo.customDomain}`,
  });
  revalidatePath("/admin/domains");
  revalidatePath("/admin/leads");
  return OK;
}
