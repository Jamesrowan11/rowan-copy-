"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/password";
import { saveUpload } from "@/lib/uploads";
import { sendEmail } from "@/lib/email";
import { setSignature } from "@/lib/signature";
import {
  PROJECT_STATUSES,
  SERVICE_TYPES,
  ROLES,
  TEMPLATE_CATEGORIES,
} from "@/lib/constants";
import crypto from "crypto";

type Result = { ok: boolean; error?: string };
const OK: Result = { ok: true };
const appUrl = process.env.APP_URL || "http://localhost:3000";

function fail(error: string): Result {
  return { ok: false, error };
}

// --------------------------------------------------------------------------
// Inquiries
// --------------------------------------------------------------------------

export async function deleteInquiry(id: string): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const inquiry = await prisma.inquiry.findUnique({ where: { id } });
  if (!inquiry) return fail("Inquiry not found.");
  await prisma.inquiry.delete({ where: { id } });
  await audit({
    actorId: admin.id,
    action: "delete",
    entityType: "Inquiry",
    entityId: id,
    summary: `Deleted inquiry from ${inquiry.name}`,
  });
  revalidatePath("/admin/inquiries");
  return OK;
}

export async function setInquiryStatus(id: string, status: string): Promise<Result> {
  await requireRoleAction("ADMIN");
  await prisma.inquiry.update({ where: { id }, data: { status } });
  revalidatePath("/admin/inquiries");
  return OK;
}

// Convert an inquiry into a client + project (creating the client account if needed).
export async function convertInquiry(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const inquiryId = String(formData.get("inquiryId") || "");
  const inquiry = await prisma.inquiry.findUnique({ where: { id: inquiryId } });
  if (!inquiry) return fail("Inquiry not found.");

  const email = inquiry.email.toLowerCase();
  let client = await prisma.user.findUnique({ where: { email } });
  let tempPassword: string | null = null;
  if (!client) {
    tempPassword = crypto.randomBytes(6).toString("base64url");
    client = await prisma.user.create({
      data: {
        name: inquiry.name,
        email,
        phone: inquiry.phone,
        role: "CLIENT",
        passwordHash: await hashPassword(tempPassword),
      },
    });
  }

  const project = await prisma.project.create({
    data: {
      title: `${inquiry.business || inquiry.name} — ${inquiry.serviceType}`,
      type: (SERVICE_TYPES as readonly string[]).includes(inquiry.serviceType)
        ? inquiry.serviceType
        : "Other",
      scope: inquiry.message,
      status: "Inquiry",
      clientId: client.id,
    },
  });

  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: { status: "Converted", convertedProjectId: project.id, clientId: client.id },
  });

  await audit({
    actorId: admin.id,
    action: "create",
    entityType: "Project",
    entityId: project.id,
    summary: `Converted inquiry from ${inquiry.name} into a project`,
  });

  revalidatePath("/admin/inquiries");
  revalidatePath("/admin/projects");
  return OK;
}

// --------------------------------------------------------------------------
// Projects
// --------------------------------------------------------------------------

const projectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  clientId: z.string().min(1),
  assigneeId: z.string().optional(),
  type: z.string().min(1),
  scope: z.string().trim().min(1).max(8000),
  dueDate: z.string().optional(),
  quotedPrice: z.string().optional(),
  revisionRoundsIncluded: z.string().optional(),
});

export async function createProject(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const parsed = projectSchema.safeParse({
    title: formData.get("title"),
    clientId: formData.get("clientId"),
    assigneeId: formData.get("assigneeId") || undefined,
    type: formData.get("type"),
    scope: formData.get("scope"),
    dueDate: formData.get("dueDate") || undefined,
    quotedPrice: formData.get("quotedPrice") || undefined,
    revisionRoundsIncluded: formData.get("revisionRoundsIncluded") || undefined,
  });
  if (!parsed.success) return fail("Please fill in the required fields.");
  const d = parsed.data;

  // Validate the assignee is an active staff member (employee or admin).
  let assigneeId: string | null = null;
  if (d.assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: d.assigneeId } });
    if (!assignee || !assignee.active || assignee.role === "CLIENT") {
      return fail("Invalid assignee.");
    }
    assigneeId = assignee.id;
  }
  const client = await prisma.user.findUnique({ where: { id: d.clientId } });
  if (!client || client.role !== "CLIENT") return fail("Invalid client.");

  const project = await prisma.project.create({
    data: {
      title: d.title,
      clientId: d.clientId,
      assigneeId,
      type: (SERVICE_TYPES as readonly string[]).includes(d.type) ? d.type : "Other",
      scope: d.scope,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      quotedPrice: d.quotedPrice ? Number(d.quotedPrice) : null,
      revisionRoundsIncluded: d.revisionRoundsIncluded
        ? Math.max(0, parseInt(d.revisionRoundsIncluded, 10) || 0)
        : 1,
    },
  });

  await audit({
    actorId: admin.id,
    action: "create",
    entityType: "Project",
    entityId: project.id,
    summary: `Created project "${project.title}"`,
  });
  revalidatePath("/admin/projects");
  return OK;
}

export async function updateProjectDetails(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const id = String(formData.get("id") || "");
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return fail("Project not found.");

  const assigneeIdRaw = String(formData.get("assigneeId") || "");
  let assigneeId: string | null = null;
  if (assigneeIdRaw) {
    const a = await prisma.user.findUnique({ where: { id: assigneeIdRaw } });
    if (!a || !a.active || a.role === "CLIENT") return fail("Invalid assignee.");
    assigneeId = a.id;
  }

  await prisma.project.update({
    where: { id },
    data: {
      title: String(formData.get("title") || project.title),
      scope: String(formData.get("scope") || project.scope),
      type: String(formData.get("type") || project.type),
      assigneeId,
      dueDate: formData.get("dueDate")
        ? new Date(String(formData.get("dueDate")))
        : null,
      quotedPrice: formData.get("quotedPrice")
        ? Number(formData.get("quotedPrice"))
        : null,
      revisionRoundsIncluded: Math.max(
        0,
        parseInt(String(formData.get("revisionRoundsIncluded") || "1"), 10) || 0,
      ),
    },
  });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "Project",
    entityId: id,
    summary: `Updated project "${project.title}"`,
  });
  revalidatePath(`/admin/projects/${id}`);
  return OK;
}

export async function updateProjectStatus(id: string, status: string): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  if (!(PROJECT_STATUSES as readonly string[]).includes(status)) {
    return fail("Invalid status.");
  }
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return fail("Project not found.");
  await prisma.project.update({ where: { id }, data: { status } });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "Project",
    entityId: id,
    summary: `Status → ${status} for "${project.title}"`,
  });
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath("/admin/projects");
  return OK;
}

export async function cancelProject(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const id = String(formData.get("id") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) return fail("Please give a reason for cancelling.");
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return fail("Project not found.");
  await prisma.project.update({
    where: { id },
    data: { status: "Cancelled", cancelledReason: reason, cancelledAt: new Date() },
  });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "Project",
    entityId: id,
    summary: `Cancelled "${project.title}": ${reason}`,
  });
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath("/admin/projects");
  return OK;
}

export async function reinstateProject(id: string): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return fail("Project not found.");
  await prisma.project.update({
    where: { id },
    data: { status: "In Progress", cancelledReason: null, cancelledAt: null },
  });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "Project",
    entityId: id,
    summary: `Reinstated "${project.title}"`,
  });
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath("/admin/projects");
  return OK;
}

// --------------------------------------------------------------------------
// Project notes (internal)
// --------------------------------------------------------------------------

export async function addProjectNote(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const staff = await requireRoleAction("ADMIN", "EMPLOYEE");
  const projectId = String(formData.get("projectId") || "");
  const body = String(formData.get("body") || "").trim();
  if (!body) return fail("Note can't be empty.");
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return fail("Project not found.");
  // Employees can only add notes to their assigned projects.
  if (staff.role === "EMPLOYEE" && project.assigneeId !== staff.id) {
    return fail("You can only add notes to your own projects.");
  }
  await prisma.projectNote.create({
    data: { projectId, authorId: staff.id, body },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/staff/projects/${projectId}`);
  return OK;
}

export async function deleteProjectNote(noteId: string): Promise<Result> {
  await requireRoleAction("ADMIN");
  const note = await prisma.projectNote.findUnique({ where: { id: noteId } });
  if (!note) return fail("Note not found.");
  await prisma.projectNote.delete({ where: { id: noteId } });
  revalidatePath(`/admin/projects/${note.projectId}`);
  return OK;
}

// --------------------------------------------------------------------------
// Brief & brand voice
// --------------------------------------------------------------------------

export async function saveBrief(_prev: Result, formData: FormData): Promise<Result> {
  const staff = await requireRoleAction("ADMIN", "EMPLOYEE");
  const projectId = String(formData.get("projectId") || "");
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return fail("Project not found.");
  if (staff.role === "EMPLOYEE" && project.assigneeId !== staff.id) {
    return fail("Not your project.");
  }
  const data = {
    audience: String(formData.get("audience") || "") || null,
    goal: String(formData.get("goal") || "") || null,
    tone: String(formData.get("tone") || "") || null,
    avoid: String(formData.get("avoid") || "") || null,
    competitors: String(formData.get("competitors") || "") || null,
    mustInclude: String(formData.get("mustInclude") || "") || null,
    links: String(formData.get("links") || "") || null,
  };
  await prisma.brief.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/staff/projects/${projectId}`);
  return OK;
}

export async function saveBrandVoice(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  await requireRoleAction("ADMIN");
  const clientId = String(formData.get("clientId") || "");
  const client = await prisma.user.findUnique({ where: { id: clientId } });
  if (!client || client.role !== "CLIENT") return fail("Invalid client.");
  const data = {
    tone: String(formData.get("tone") || "") || null,
    bannedCliches: String(formData.get("bannedCliches") || "") || null,
    keyTerms: String(formData.get("keyTerms") || "") || null,
    notes: String(formData.get("notes") || "") || null,
  };
  await prisma.brandVoiceProfile.upsert({
    where: { clientId },
    create: { clientId, ...data },
    update: data,
  });
  revalidatePath(`/admin/users/${clientId}`);
  return OK;
}

// --------------------------------------------------------------------------
// Documents / deliverables
// --------------------------------------------------------------------------

export async function uploadDocument(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const staff = await requireRoleAction("ADMIN", "EMPLOYEE");
  const clientId = String(formData.get("clientId") || "");
  const projectId = String(formData.get("projectId") || "") || null;
  const kind = String(formData.get("kind") || "deliverable");
  const notify = formData.get("notify") === "on";
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return fail("Choose a file to upload.");

  const client = await prisma.user.findUnique({ where: { id: clientId } });
  if (!client) return fail("Client not found.");

  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return fail("Project not found.");
    if (staff.role === "EMPLOYEE" && project.assigneeId !== staff.id) {
      return fail("Not your project.");
    }
  }

  let saved;
  try {
    saved = await saveUpload(file);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Upload failed.");
  }

  await prisma.document.create({
    data: {
      clientId,
      projectId,
      uploaderId: staff.id,
      kind,
      originalName: saved.originalName,
      storedName: saved.storedName,
      mimeType: saved.mimeType,
      size: saved.size,
    },
  });

  await audit({
    actorId: staff.id,
    action: "create",
    entityType: "Document",
    summary: `Uploaded "${saved.originalName}" for ${client.name}`,
  });

  if (notify) {
    await sendEmail({
      to: [client.email],
      subject: "A new document is ready in your Rowan Copy portal",
      text: `Hi ${client.name},\n\nWe just shared a new ${kind} with you: "${saved.originalName}". You can view and download it in your portal.\n\n${appUrl}/client\n\nThanks!`,
      senderUserId: staff.id,
    });
  }

  if (projectId) revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/users/${clientId}`);
  return OK;
}

export async function deleteDocument(id: string): Promise<Result> {
  await requireRoleAction("ADMIN");
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return fail("Document not found.");
  await prisma.document.delete({ where: { id } });
  if (doc.projectId) revalidatePath(`/admin/projects/${doc.projectId}`);
  revalidatePath(`/admin/users/${doc.clientId}`);
  return OK;
}

// --------------------------------------------------------------------------
// Payments
// --------------------------------------------------------------------------

export async function addPayment(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const clientId = String(formData.get("clientId") || "");
  const projectId = String(formData.get("projectId") || "") || null;
  const description = String(formData.get("description") || "").trim();
  const stripeUrl = String(formData.get("stripeUrl") || "").trim();
  const amountRaw = String(formData.get("amount") || "").trim();
  const notify = formData.get("notify") === "on";

  if (!description) return fail("Add a description.");
  if (!/^https?:\/\//.test(stripeUrl)) return fail("Enter a valid payment URL.");
  const client = await prisma.user.findUnique({ where: { id: clientId } });
  if (!client) return fail("Client not found.");

  await prisma.payment.create({
    data: {
      clientId,
      projectId,
      description,
      stripeUrl,
      amount: amountRaw ? Number(amountRaw) : null,
      status: "Sent",
    },
  });

  await audit({
    actorId: admin.id,
    action: "create",
    entityType: "Payment",
    summary: `Sent payment link to ${client.name}: ${description}`,
  });

  if (notify) {
    await sendEmail({
      to: [client.email],
      subject: "A payment link from Rowan Copy",
      text: `Hi ${client.name},\n\nHere's a secure payment link for: ${description}.\n\n${stripeUrl}\n\nYou can also see it anytime in your portal: ${appUrl}/client\n\nThanks!`,
      senderUserId: admin.id,
    });
  }

  if (projectId) revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/users/${clientId}`);
  return OK;
}

export async function markPaymentPaid(id: string): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) return fail("Payment not found.");
  await prisma.payment.update({
    where: { id },
    data: { status: "Paid", paidAt: new Date() },
  });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "Payment",
    entityId: id,
    summary: `Marked payment paid: ${payment.description}`,
  });
  if (payment.projectId) revalidatePath(`/admin/projects/${payment.projectId}`);
  revalidatePath(`/admin/users/${payment.clientId}`);
  return OK;
}

export async function deletePayment(id: string): Promise<Result> {
  await requireRoleAction("ADMIN");
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) return fail("Payment not found.");
  await prisma.payment.delete({ where: { id } });
  if (payment.projectId) revalidatePath(`/admin/projects/${payment.projectId}`);
  revalidatePath(`/admin/users/${payment.clientId}`);
  return OK;
}

// --------------------------------------------------------------------------
// Users / team
// --------------------------------------------------------------------------

const userSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(40).optional(),
  role: z.enum(ROLES),
  password: z.string().min(8).optional(),
});

export async function createUser(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    role: formData.get("role"),
    password: formData.get("password") || undefined,
  });
  if (!parsed.success) {
    return fail("Check the fields — password must be at least 8 characters.");
  }
  const d = parsed.data;
  const email = d.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return fail("A user with that email already exists.");
  if (!d.password) return fail("Set an initial password (8+ characters).");

  const user = await prisma.user.create({
    data: {
      name: d.name,
      email,
      phone: d.phone || null,
      role: d.role,
      passwordHash: await hashPassword(d.password),
    },
  });
  await audit({
    actorId: admin.id,
    action: "create",
    entityType: "User",
    entityId: user.id,
    summary: `Created ${d.role} ${d.name} (${email})`,
  });
  revalidatePath("/admin/users");
  return OK;
}

export async function updateUser(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const id = String(formData.get("id") || "");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return fail("User not found.");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  if (!name || !email) return fail("Name and email are required.");
  const clash = await prisma.user.findFirst({
    where: { email, NOT: { id } },
  });
  if (clash) return fail("Another user already uses that email.");
  await prisma.user.update({
    where: { id },
    data: { name, email, phone: phone || null },
  });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "User",
    entityId: id,
    summary: `Edited ${name}`,
  });
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  return OK;
}

export async function setUserPassword(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const id = String(formData.get("id") || "");
  const password = String(formData.get("password") || "");
  if (password.length < 8) return fail("Password must be at least 8 characters.");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return fail("User not found.");
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password) },
  });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "User",
    entityId: id,
    summary: `Reset password for ${user.name}`,
  });
  return OK;
}

export async function toggleUserActive(id: string): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return fail("User not found.");
  if (user.id === admin.id) return fail("You can't deactivate your own account.");
  await prisma.user.update({ where: { id }, data: { active: !user.active } });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "User",
    entityId: id,
    summary: `${user.active ? "Deactivated" : "Activated"} ${user.name}`,
  });
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  return OK;
}

export async function deleteUser(id: string): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const user = await prisma.user.findUnique({
    where: { id },
    include: { projectsAsClient: true, projectsAsAssignee: true },
  });
  if (!user) return fail("User not found.");
  if (user.id === admin.id) return fail("You can't delete your own account.");
  if (user.projectsAsClient.length || user.projectsAsAssignee.length) {
    return fail("This user has projects. Deactivate instead to keep records.");
  }
  await prisma.user.delete({ where: { id } });
  await audit({
    actorId: admin.id,
    action: "delete",
    entityType: "User",
    entityId: id,
    summary: `Deleted ${user.name}`,
  });
  revalidatePath("/admin/users");
  return OK;
}

// --------------------------------------------------------------------------
// Internal notes about people
// --------------------------------------------------------------------------

export async function addClientNote(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const staff = await requireRoleAction("ADMIN", "EMPLOYEE");
  const clientUserId = String(formData.get("clientUserId") || "");
  const body = String(formData.get("body") || "").trim();
  if (!body) return fail("Note can't be empty.");
  const client = await prisma.user.findUnique({ where: { id: clientUserId } });
  if (!client || client.role !== "CLIENT") return fail("Invalid client.");
  // An employee may only add a client note if assigned to one of the client's projects.
  if (staff.role === "EMPLOYEE") {
    const assigned = await prisma.project.findFirst({
      where: { clientId: clientUserId, assigneeId: staff.id },
    });
    if (!assigned) return fail("You can only note clients on your projects.");
  }
  await prisma.clientNote.create({
    data: { clientUserId, authorId: staff.id, body },
  });
  revalidatePath(`/admin/users/${clientUserId}`);
  return OK;
}

export async function deleteClientNote(id: string): Promise<Result> {
  // Only admins can delete client notes (employees can add, not delete).
  await requireRoleAction("ADMIN");
  const note = await prisma.clientNote.findUnique({ where: { id } });
  if (!note) return fail("Note not found.");
  await prisma.clientNote.delete({ where: { id } });
  revalidatePath(`/admin/users/${note.clientUserId}`);
  return OK;
}

export async function addEmployeeNote(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const employeeUserId = String(formData.get("employeeUserId") || "");
  const body = String(formData.get("body") || "").trim();
  if (!body) return fail("Note can't be empty.");
  await prisma.employeeNote.create({
    data: { employeeUserId, authorId: admin.id, body },
  });
  revalidatePath(`/admin/users/${employeeUserId}`);
  return OK;
}

export async function deleteEmployeeNote(id: string): Promise<Result> {
  await requireRoleAction("ADMIN");
  const note = await prisma.employeeNote.findUnique({ where: { id } });
  if (!note) return fail("Note not found.");
  await prisma.employeeNote.delete({ where: { id } });
  revalidatePath(`/admin/users/${note.employeeUserId}`);
  return OK;
}

// --------------------------------------------------------------------------
// Monthly plan
// --------------------------------------------------------------------------

export async function saveMonthlyPlan(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const clientId = String(formData.get("clientId") || "");
  const active = formData.get("active") === "on";
  const renewalRaw = String(formData.get("renewalDate") || "");
  const client = await prisma.user.findUnique({ where: { id: clientId } });
  if (!client || client.role !== "CLIENT") return fail("Invalid client.");
  await prisma.monthlyPlan.upsert({
    where: { clientId },
    create: {
      clientId,
      active,
      renewalDate: renewalRaw ? new Date(renewalRaw) : null,
    },
    update: { active, renewalDate: renewalRaw ? new Date(renewalRaw) : null },
  });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "MonthlyPlan",
    summary: `${active ? "Activated" : "Updated"} monthly plan for ${client.name}`,
  });
  revalidatePath("/admin/plans");
  revalidatePath(`/admin/users/${clientId}`);
  return OK;
}

// --------------------------------------------------------------------------
// Announcements
// --------------------------------------------------------------------------

export async function createAnnouncement(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!title || !body) return fail("Title and body are required.");
  await prisma.announcement.create({
    data: { authorId: admin.id, title, body },
  });
  revalidatePath("/admin/announcements");
  return OK;
}

export async function deleteAnnouncement(id: string): Promise<Result> {
  await requireRoleAction("ADMIN");
  await prisma.announcement.delete({ where: { id } });
  revalidatePath("/admin/announcements");
  return OK;
}

// --------------------------------------------------------------------------
// Templates
// --------------------------------------------------------------------------

export async function saveTemplate(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const staff = await requireRoleAction("ADMIN", "EMPLOYEE");
  const id = String(formData.get("id") || "");
  const category = String(formData.get("category") || "other");
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!title || !body) return fail("Title and body are required.");
  const cat = (TEMPLATE_CATEGORIES as readonly string[]).includes(category)
    ? category
    : "other";
  if (id) {
    await prisma.template.update({
      where: { id },
      data: { category: cat, title, body },
    });
  } else {
    await prisma.template.create({
      data: { authorId: staff.id, category: cat, title, body },
    });
  }
  revalidatePath("/admin/templates");
  revalidatePath("/staff/templates");
  return OK;
}

export async function deleteTemplate(id: string): Promise<Result> {
  await requireRoleAction("ADMIN");
  await prisma.template.delete({ where: { id } });
  revalidatePath("/admin/templates");
  return OK;
}

// --------------------------------------------------------------------------
// Reviews / testimonials
// --------------------------------------------------------------------------

export async function requestReview(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const projectId = String(formData.get("projectId") || "");
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!project) return fail("Project not found.");
  const token = crypto.randomBytes(16).toString("hex");
  await prisma.review.create({
    data: {
      clientId: project.clientId,
      projectId: project.id,
      authorName: project.client.name,
      status: "Requested",
      token,
    },
  });
  await sendEmail({
    to: [project.client.email],
    subject: "How did we do? A quick favor from Rowan Copy",
    text: `Hi ${project.client.name},\n\nNow that "${project.title}" is wrapped up, would you mind leaving a short review? It takes a minute and helps a lot.\n\n${appUrl}/review/${token}\n\nThank you!`,
    senderUserId: admin.id,
  });
  revalidatePath("/admin/reviews");
  return OK;
}

export async function toggleReviewFeatured(id: string): Promise<Result> {
  await requireRoleAction("ADMIN");
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) return fail("Review not found.");
  await prisma.review.update({
    where: { id },
    data: {
      featured: !review.featured,
      status: !review.featured ? "Featured" : "Submitted",
    },
  });
  revalidatePath("/admin/reviews");
  return OK;
}

export async function deleteReview(id: string): Promise<Result> {
  await requireRoleAction("ADMIN");
  await prisma.review.delete({ where: { id } });
  revalidatePath("/admin/reviews");
  return OK;
}

// --------------------------------------------------------------------------
// Signature & settings
// --------------------------------------------------------------------------

export async function updateSignature(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const text = String(formData.get("text") || "").trim();
  const html = String(formData.get("html") || "").trim();
  if (!text) return fail("Signature text can't be empty.");
  await setSignature(text, html || undefined);
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "Signature",
    summary: "Updated company email signature",
  });
  revalidatePath("/admin/settings");
  return OK;
}

// --------------------------------------------------------------------------
// Unmatched inbound
// --------------------------------------------------------------------------

export async function deleteInboundEmail(id: string): Promise<Result> {
  await requireRoleAction("ADMIN");
  await prisma.inboundEmail.delete({ where: { id } });
  revalidatePath("/admin/unmatched");
  return OK;
}

// --------------------------------------------------------------------------
// Profile (self only)
// --------------------------------------------------------------------------

export async function updateMyProfile(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const me = await requireRoleAction("ADMIN", "EMPLOYEE", "CLIENT");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  if (!name || !email) return fail("Name and email are required.");
  const clash = await prisma.user.findFirst({
    where: { email, NOT: { id: me.id } },
  });
  if (clash) return fail("That email is already in use.");
  // Scoped strictly to the session user's own id.
  await prisma.user.update({
    where: { id: me.id },
    data: { name, email, phone: phone || null },
  });
  revalidatePath("/admin/profile");
  return OK;
}

export async function changeMyPassword(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const me = await requireRoleAction("ADMIN", "EMPLOYEE", "CLIENT");
  const current = String(formData.get("current") || "");
  const next = String(formData.get("next") || "");
  if (next.length < 8) return fail("New password must be at least 8 characters.");
  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user) return fail("User not found.");
  const ok = await verifyPassword(current, user.passwordHash);
  if (!ok) return fail("Your current password is incorrect.");
  await prisma.user.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(next) },
  });
  return OK;
}
