"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserAction } from "@/lib/authz";
import { sendEmail } from "@/lib/email";
import type { Role } from "@/lib/constants";

type Result = { ok: boolean; error?: string; threadId?: string };
const appUrl = process.env.APP_URL || "http://localhost:3000";

async function allAdminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

function pathFor(role: Role): string {
  if (role === "ADMIN") return "/admin/messages";
  if (role === "EMPLOYEE") return "/staff/messages";
  return "/client/messages";
}

/**
 * Start a new thread. Recipient rules are enforced server-side:
 *  - CLIENT: may only message Rowan Copy (all admins are added; no recipient list).
 *  - EMPLOYEE: may message any active client, employee, or admin.
 *  - ADMIN: may message anyone.
 * Every thread automatically includes all active admins, which is how admins
 * "see all conversations" while access stays uniformly participants-only.
 */
export async function startThread(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const me = await requireUserAction();
  const subject = String(formData.get("subject") || "").trim() || "(No subject)";
  const body = String(formData.get("body") || "").trim();
  if (!body) return { ok: false, error: "Write a message first." };

  const adminIds = await allAdminIds();
  const participantIds = new Set<string>([me.id, ...adminIds]);

  if (me.role === "CLIENT") {
    // Clients only ever talk to Rowan Copy (admins) — no recipient picker.
  } else {
    const rawRecipients = formData.getAll("recipientIds").map(String).filter(Boolean);
    if (rawRecipients.length === 0) {
      return { ok: false, error: "Choose at least one recipient." };
    }
    const recipients = await prisma.user.findMany({
      where: { id: { in: rawRecipients }, active: true },
    });
    if (recipients.length === 0) return { ok: false, error: "No valid recipients." };
    for (const r of recipients) participantIds.add(r.id);
  }

  const thread = await prisma.thread.create({
    data: {
      subject,
      participants: {
        create: Array.from(participantIds).map((userId) => ({
          userId,
          lastReadAt: userId === me.id ? new Date() : null,
        })),
      },
      messages: { create: { senderId: me.id, body } },
    },
    include: { participants: true },
  });

  await notifyOthers(thread.id, me.id, me.name, subject);

  revalidatePath(pathFor(me.role));
  return { ok: true, threadId: thread.id };
}

export async function postMessage(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const me = await requireUserAction();
  const threadId = String(formData.get("threadId") || "");
  const body = String(formData.get("body") || "").trim();
  if (!body) return { ok: false, error: "Message can't be empty." };

  // Server-side access: must be a participant to post.
  const part = await prisma.threadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: me.id } },
  });
  if (!part) return { ok: false, error: "Not found." };

  await prisma.message.create({ data: { threadId, senderId: me.id, body } });
  await prisma.thread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });
  await prisma.threadParticipant.updateMany({
    where: { threadId, userId: me.id },
    data: { lastReadAt: new Date() },
  });

  const thread = await prisma.thread.findUnique({ where: { id: threadId } });
  await notifyOthers(threadId, me.id, me.name, thread?.subject || "your conversation");

  revalidatePath(`${pathFor(me.role)}/${threadId}`);
  revalidatePath(pathFor(me.role));
  return { ok: true, threadId };
}

async function notifyOthers(
  threadId: string,
  senderId: string,
  senderName: string,
  subject: string,
) {
  const parts = await prisma.threadParticipant.findMany({
    where: { threadId, NOT: { userId: senderId } },
    include: { user: true },
  });
  const recipients = parts.map((p) => p.user).filter((u) => u.active);
  if (recipients.length === 0) return;
  // One notification email per recipient so links/paths are role-appropriate.
  for (const r of recipients) {
    const base = r.role === "CLIENT" ? "/client" : r.role === "ADMIN" ? "/admin" : "/staff";
    await sendEmail({
      to: [r.email],
      subject: `New message from ${senderName}: ${subject}`,
      text: `Hi ${r.name},\n\nYou have a new message in your Rowan Copy portal regarding "${subject}".\n\nRead and reply here: ${appUrl}${base}/messages/${threadId}`,
      senderUserId: senderId,
    });
  }
}

export async function markRead(threadId: string): Promise<void> {
  const me = await requireUserAction();
  await prisma.threadParticipant.updateMany({
    where: { threadId, userId: me.id },
    data: { lastReadAt: new Date() },
  });
}
