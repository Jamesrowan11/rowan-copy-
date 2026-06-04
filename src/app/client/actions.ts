"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { SERVICE_TYPES } from "@/lib/constants";

type Result = { ok: boolean; error?: string };
const appUrl = process.env.APP_URL || "http://localhost:3000";

// Submit a new project / quote request from the client portal.
export async function submitClientInquiry(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const me = await requireRoleAction("CLIENT");
  const serviceType = String(formData.get("serviceType") || "");
  const message = String(formData.get("message") || "").trim();
  const budget = String(formData.get("budget") || "").trim();
  if (!message) return { ok: false, error: "Tell us a little about what you need." };

  const inquiry = await prisma.inquiry.create({
    data: {
      name: me.name,
      email: me.email,
      phone: me.phone,
      serviceType: (SERVICE_TYPES as readonly string[]).includes(serviceType) ? serviceType : "Other",
      budget: budget || null,
      message,
      status: "New",
      source: "client-portal",
      clientId: me.id,
    },
  });
  await audit({
    actorId: me.id,
    action: "create",
    entityType: "Inquiry",
    entityId: inquiry.id,
    summary: `Client ${me.name} submitted a new request (${serviceType})`,
  });
  revalidatePath("/client");
  return { ok: true };
}

// "Request an update" for monthly-plan clients.
export async function requestMonthlyUpdate(): Promise<Result> {
  const me = await requireRoleAction("CLIENT");
  const plan = await prisma.monthlyPlan.findUnique({ where: { clientId: me.id } });
  if (!plan || !plan.active) {
    return { ok: false, error: "You don't have an active monthly plan." };
  }
  await prisma.inquiry.create({
    data: {
      name: me.name,
      email: me.email,
      phone: me.phone,
      serviceType: "Website hosting + upkeep",
      message: "Monthly plan: requesting a content update.",
      status: "New",
      source: "monthly-plan",
      clientId: me.id,
    },
  });
  revalidatePath("/client");
  return { ok: true };
}

// Client fills in the structured brief for their own project.
export async function saveClientBrief(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const me = await requireRoleAction("CLIENT");
  const projectId = String(formData.get("projectId") || "");
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.clientId !== me.id) return { ok: false, error: "Not found." };

  const data = {
    audience: String(formData.get("audience") || "") || null,
    goal: String(formData.get("goal") || "") || null,
    tone: String(formData.get("tone") || "") || null,
    avoid: String(formData.get("avoid") || "") || null,
    competitors: String(formData.get("competitors") || "") || null,
    mustInclude: String(formData.get("mustInclude") || "") || null,
    links: String(formData.get("links") || "") || null,
    submittedAt: new Date(),
  };
  await prisma.brief.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
  });
  revalidatePath(`/client/projects/${projectId}`);
  return { ok: true };
}

// Approve a delivered draft.
export async function approveDraft(projectId: string): Promise<Result> {
  const me = await requireRoleAction("CLIENT");
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { assignee: true },
  });
  if (!project || project.clientId !== me.id) return { ok: false, error: "Not found." };
  if (!["Draft Delivered", "Revisions"].includes(project.status)) {
    return { ok: false, error: "There's no draft to approve right now." };
  }
  await prisma.project.update({ where: { id: projectId }, data: { status: "Approved" } });
  await audit({
    actorId: me.id,
    action: "update",
    entityType: "Project",
    entityId: projectId,
    summary: `Client approved "${project.title}"`,
  });
  // Notify the team.
  const staffEmails = [project.assignee?.email].filter(Boolean) as string[];
  if (staffEmails.length) {
    await sendEmail({
      to: staffEmails,
      subject: `Approved: ${project.title}`,
      text: `${me.name} approved the draft for "${project.title}". You're clear to close it out.\n\n${appUrl}/staff/projects/${projectId}`,
      senderUserId: me.id,
    });
  }
  revalidatePath(`/client/projects/${projectId}`);
  revalidatePath("/client");
  return { ok: true };
}

// Request changes on a delivered draft.
export async function requestRevision(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const me = await requireRoleAction("CLIENT");
  const projectId = String(formData.get("projectId") || "");
  const message = String(formData.get("message") || "").trim();
  if (!message) return { ok: false, error: "Tell us what you'd like changed." };
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { assignee: true },
  });
  if (!project || project.clientId !== me.id) return { ok: false, error: "Not found." };
  if (!["Draft Delivered", "Revisions"].includes(project.status)) {
    return { ok: false, error: "There's no draft to revise right now." };
  }

  const used = project.revisionRoundsUsed + 1;
  await prisma.project.update({
    where: { id: projectId },
    data: { status: "Revisions", revisionRoundsUsed: used },
  });
  // Record the client's request so the team sees it (internal note).
  await prisma.projectNote.create({
    data: {
      projectId,
      authorId: me.id,
      body: `[Revision request from client]\n${message}`,
    },
  });
  if (project.assignee) {
    await sendEmail({
      to: [project.assignee.email],
      subject: `Revision requested: ${project.title}`,
      text: `${me.name} requested changes on "${project.title}":\n\n${message}\n\n${appUrl}/staff/projects/${projectId}`,
      senderUserId: me.id,
    });
  }

  const remaining = project.revisionRoundsIncluded - used;
  revalidatePath(`/client/projects/${projectId}`);
  revalidatePath("/client");
  return {
    ok: true,
    error: remaining < 0
      ? "Heads up: you've used all included revision rounds. Extra rounds may be billed."
      : undefined,
  };
}
