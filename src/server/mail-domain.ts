"use server";

import { revalidatePath } from "next/cache";
import { requireRoleAction } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { pleskCreateMailDomain, pleskListDomains, isValidDomain } from "@/lib/plesk-mail-domain";

type Result = { ok: boolean; error?: string; info?: string };
const fail = (error: string): Result => ({ ok: false, error });

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
 * Add a customer's domain to Plesk for mail (add-on under the main subscription).
 * Idempotent: if the domain already exists on the server, it's a no-op success.
 * Admin only, audited.
 */
export async function setupDomainMail(domain: string): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const d = String(domain || "").trim().toLowerCase();
  if (!isValidDomain(d)) return fail("Enter a valid domain name.");

  // Don't try to re-create a domain that's already on the server.
  const existing = await pleskListDomains();
  if (existing.includes(d)) {
    return { ok: true, info: `${d} is already on the server.` };
  }

  try {
    await pleskCreateMailDomain(d);
  } catch (err) {
    return fail(`Couldn't set up the domain: ${pleskMsg(err)}`);
  }
  await audit({
    actorId: admin.id,
    action: "create",
    entityType: "Domain",
    summary: `Set up mail domain ${d} (add-on)`,
  });
  revalidatePath("/admin/mail-domains");
  return { ok: true, info: `${d} added to the server. Now point its MX record here (or move its DNS to Plesk).` };
}
