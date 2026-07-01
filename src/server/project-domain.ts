"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/authz";
import { audit } from "@/lib/audit";

type Result = { ok: boolean; error?: string; info?: string };
const OK: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/i;

/**
 * Set (or clear) the custom domain a Project is being pointed at. Admin + staff.
 * The setup guide + live status render from this on the project pages.
 */
export async function setProjectDomain(_prev: Result, formData: FormData): Promise<Result> {
  const user = await requireRoleAction("ADMIN", "EMPLOYEE");
  const id = String(formData.get("projectId") || "");
  const domain = String(formData.get("customDomain") || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return fail("Project not found.");
  if (domain && !HOSTNAME_RE.test(domain)) return fail("Enter a valid domain, e.g. acme.com.");

  await prisma.project.update({
    where: { id },
    data: {
      customDomain: domain || null,
      customDomainStatus: domain ? (project.customDomainStatus === "Live" ? "Live" : "Pending") : "None",
    },
  });
  await audit({
    actorId: user.id,
    action: "update",
    entityType: "Project",
    entityId: id,
    summary: domain ? `Set custom domain ${domain}` : "Cleared custom domain",
  });
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath(`/client/projects/${id}`);
  return domain ? { ok: true, info: "Saved — the setup guide is below." } : OK;
}

/** Mark the domain live once it's connected (admin/staff). */
export async function markProjectDomainLive(id: string): Promise<Result> {
  const user = await requireRoleAction("ADMIN", "EMPLOYEE");
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !project.customDomain) return fail("No custom domain set.");
  await prisma.project.update({ where: { id }, data: { customDomainStatus: "Live" } });
  await audit({
    actorId: user.id,
    action: "update",
    entityType: "Project",
    entityId: id,
    summary: `Marked custom domain ${project.customDomain} live`,
  });
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath(`/client/projects/${id}`);
  return OK;
}
