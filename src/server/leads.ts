"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { teardownSubdomain } from "@/lib/deploy";
import crypto from "crypto";

type Result = { ok: boolean; error?: string };
type ConvertResult = Result & { projectId?: string };
const OK: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

// The background job is triggered by the server calling its OWN run route. This
// must go over LOCAL HTTP (loopback), NOT the public HTTPS host — a self-call to
// https://rowancopy.com fails TLS validation when the server's certificate is for
// a different hostname (ERR_TLS_CERT_ALTNAME_INVALID), which would leave demos
// stuck on "Queued" forever. APP_URL / NEXTAUTH_URL are left for browser-facing
// links; only this internal self-call uses INTERNAL_BASE_URL.
const internalBaseUrl = process.env.INTERNAL_BASE_URL || "http://127.0.0.1:3000";

/** Fire-and-forget trigger of the background demo processor over loopback HTTP. */
function triggerDemoRun(demoId: string): void {
  const url = `${internalBaseUrl}/api/demos/${demoId}/run`;
  void fetch(url, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INBOUND_WEBHOOK_SECRET || "" },
  }).catch((err) => {
    console.error(
      `[leadgen] failed to trigger ${url} for demo ${demoId} — it will stay Queued until retried:`,
      err,
    );
  });
}

const demoSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required.").max(160),
  city: z.string().trim().min(1, "City is required.").max(120),
  industry: z.string().trim().min(1, "Industry is required.").max(120),
  email: z.string().trim().email("Enter a valid email."),
  currentWebsite: z.string().trim().max(300).optional(),
});

export async function createDemo(_prev: Result, formData: FormData): Promise<Result> {
  const me = await requireRoleAction("ADMIN", "EMPLOYEE");
  const parsed = demoSchema.safeParse({
    businessName: formData.get("businessName"),
    city: formData.get("city"),
    industry: formData.get("industry"),
    email: formData.get("email"),
    currentWebsite: formData.get("currentWebsite") || undefined,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message || "Please check the fields.");
  }
  const d = parsed.data;

  const demo = await prisma.demo.create({
    data: {
      businessName: d.businessName,
      city: d.city,
      industry: d.industry,
      email: d.email.toLowerCase(),
      currentWebsite: d.currentWebsite || null,
      status: "Queued",
      createdById: me.id,
    },
  });

  await audit({
    actorId: me.id,
    action: "create",
    entityType: "Demo",
    entityId: demo.id,
    summary: `Queued lead demo for ${d.businessName} (${d.city})`,
  });

  // Kick off background processing WITHOUT blocking the response (research +
  // deploy can take 30-90s). Goes over loopback HTTP; the route is gated by
  // INBOUND_WEBHOOK_SECRET. A trigger failure is logged, never thrown.
  triggerDemoRun(demo.id);

  revalidatePath("/admin/leads");
  revalidatePath("/staff/leads");
  return OK;
}

export async function deleteDemo(id: string): Promise<Result> {
  const me = await requireRoleAction("ADMIN", "EMPLOYEE");
  const demo = await prisma.demo.findUnique({ where: { id } });
  if (!demo) return fail("Demo not found.");

  // Tear down the live subdomain so dead demos don't pile up (best-effort).
  if (demo.subdomainLabel) {
    try {
      await teardownSubdomain(demo.subdomainLabel);
    } catch (err) {
      console.error(`[deleteDemo] teardown failed for ${demo.subdomainLabel}:`, err);
    }
  }

  await prisma.demo.delete({ where: { id } });
  await audit({
    actorId: me.id,
    action: "delete",
    entityType: "Demo",
    entityId: id,
    summary: `Deleted lead demo for ${demo.businessName} (tore down ${demo.subdomainLabel ?? "—"})`,
  });

  revalidatePath("/admin/leads");
  revalidatePath("/staff/leads");
  return OK;
}

// Convert a demo into a Client + Project, mirroring the Inquiry -> Project flow.
export async function convertDemo(id: string): Promise<ConvertResult> {
  const me = await requireRoleAction("ADMIN", "EMPLOYEE");
  const demo = await prisma.demo.findUnique({ where: { id } });
  if (!demo) return fail("Demo not found.");
  if (demo.convertedProjectId) return fail("This demo is already converted.");

  const email = demo.email.toLowerCase();
  let client = await prisma.user.findUnique({ where: { email } });
  if (!client) {
    const tempPassword = crypto.randomBytes(6).toString("base64url");
    client = await prisma.user.create({
      data: {
        name: demo.businessName,
        email,
        role: "CLIENT",
        passwordHash: await hashPassword(tempPassword),
      },
    });
  }

  const scopeLines = [
    `Lead-generated sample site for ${demo.businessName} (${demo.city}).`,
    demo.liveUrl ? `Live sample: ${demo.liveUrl}` : null,
    demo.researchSummary ? `\nResearch notes:\n${demo.researchSummary}` : null,
  ].filter(Boolean);

  const project = await prisma.project.create({
    data: {
      title: `${demo.businessName} — Sample Site`,
      type: "Sample Site",
      scope: scopeLines.join("\n"),
      status: "In Progress",
      clientId: client.id,
      assigneeId: me.role === "EMPLOYEE" ? me.id : null,
    },
  });

  await prisma.demo.update({
    where: { id },
    data: { convertedProjectId: project.id },
  });

  await audit({
    actorId: me.id,
    action: "create",
    entityType: "Project",
    entityId: project.id,
    summary: `Converted lead demo ${demo.businessName} into a project`,
  });

  revalidatePath("/admin/leads");
  revalidatePath("/staff/leads");
  return { ok: true, projectId: project.id };
}
