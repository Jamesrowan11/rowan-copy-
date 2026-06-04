"use server";

import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/authz";
import { sendEmail, validateEmails } from "@/lib/email";
import { MAX_EMAIL_RECIPIENTS } from "@/lib/constants";

type Result = { ok: boolean; error?: string; sentCount?: number };

/**
 * Compose and send an email to portal users (by id) and/or typed addresses.
 * Used by ADMIN and EMPLOYEE. The company signature is appended automatically
 * and the send is logged with the sender's id. Capped at MAX_EMAIL_RECIPIENTS.
 */
export async function composeEmail(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const sender = await requireRoleAction("ADMIN", "EMPLOYEE");

  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!subject) return { ok: false, error: "Add a subject." };
  if (!body) return { ok: false, error: "Write a message." };

  const userIds = formData.getAll("userIds").map(String).filter(Boolean);
  const typedRaw = String(formData.get("typed") || "");

  const recipientSet = new Set<string>();

  if (userIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, active: true },
      select: { email: true },
    });
    users.forEach((u) => recipientSet.add(u.email.toLowerCase()));
  }

  if (typedRaw.trim()) {
    const { valid, invalid } = validateEmails(typedRaw);
    if (invalid.length) {
      return { ok: false, error: `Invalid email(s): ${invalid.join(", ")}` };
    }
    valid.forEach((e) => recipientSet.add(e.toLowerCase()));
  }

  const recipients = Array.from(recipientSet);
  if (recipients.length === 0) {
    return { ok: false, error: "Choose at least one recipient." };
  }
  if (recipients.length > MAX_EMAIL_RECIPIENTS) {
    return {
      ok: false,
      error: `Too many recipients (${recipients.length}). Max ${MAX_EMAIL_RECIPIENTS}.`,
    };
  }

  await sendEmail({
    to: recipients,
    subject,
    text: body,
    senderUserId: sender.id,
  });

  return { ok: true, sentCount: recipients.length };
}
