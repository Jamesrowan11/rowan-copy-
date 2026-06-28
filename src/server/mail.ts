"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction, type SessionUser } from "@/lib/authz";
import { encryptSecret } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { pleskCreateMailbox, pleskSetPassword, pleskRemoveMailbox } from "@/lib/plesk-mail";
import {
  getMailboxForUser,
  sendFromMailbox,
  setSeen,
  deleteMessage,
  testMailboxConnection,
} from "@/lib/mail";
import { validateEmails } from "@/lib/email";
import type { Mailbox } from "@prisma/client";

type Result = { ok: boolean; error?: string; info?: string };
const OK: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

// Extract a short, safe message from a failed `plesk bin` call (surfaces Plesk's
// own stderr like "mailbox already exists" — never env or the raw error object).
function pleskMsg(err: unknown): string {
  const e = (err || {}) as { stderr?: string; message?: string };
  const s = String(e.stderr || e.message || "").trim();
  const first = s.split("\n").find((l) => l.trim()) || "";
  // A missing `plesk`/`sudo` binary means provisioning isn't set up on this host.
  if (/ENOENT|not found|command not found/i.test(s)) {
    return "the server isn't set up for portal provisioning yet (plesk CLI/sudo rule missing).";
  }
  return first.slice(0, 200) || "the command failed.";
}

function canManage(mb: Mailbox, user: SessionUser): boolean {
  return user.role === "ADMIN" || mb.ownerId === user.id;
}

// ---------------------------------------------------------------------------
// Mailbox configuration
// ---------------------------------------------------------------------------

export async function createMailbox(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const address = String(formData.get("address") || "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") || "").trim();
  const ownerId = String(formData.get("ownerId") || "");
  const shared = formData.get("shared") === "on";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return fail("Enter a valid email address.");
  if (!displayName) return fail("Add a display name.");

  const existing = await prisma.mailbox.findUnique({ where: { address } });
  if (existing) return fail("A mailbox with that address already exists.");

  let owner: string | null = null;
  if (!shared) {
    if (!ownerId) return fail("Choose an owner, or mark the mailbox shared.");
    const user = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!user || user.role === "CLIENT") return fail("Invalid owner.");
    owner = ownerId;
  }

  const host = String(formData.get("host") || address.split("@")[1]).trim();

  // Optionally PROVISION the real mailbox on the Plesk mail server (no more
  // hopping into Plesk Admin). We create it on the server FIRST — if that fails,
  // we return without writing a DB row, so there's never an orphaned connection.
  const provision = formData.get("provision") === "on";
  let passwordEnc: string | undefined;
  if (provision) {
    const password = String(formData.get("password") || "");
    if (password.length < 8) {
      return fail("Set a password (8+ characters) to create the mailbox on the server.");
    }
    try {
      await pleskCreateMailbox(address, password);
    } catch (err) {
      return fail(`Couldn't create the mailbox on the server: ${pleskMsg(err)}`);
    }
    // Store it encrypted so the mailbox is immediately usable in webmail.
    passwordEnc = encryptSecret(password);
  }

  await prisma.mailbox.create({
    data: {
      address,
      displayName,
      ownerId: owner,
      shared,
      imapHost: String(formData.get("imapHost") || host).trim(),
      imapPort: parseInt(String(formData.get("imapPort") || "993"), 10) || 993,
      imapSecure: formData.get("imapSecure") !== "off",
      smtpHost: String(formData.get("smtpHost") || host).trim(),
      smtpPort: parseInt(String(formData.get("smtpPort") || "587"), 10) || 587,
      smtpSecure: formData.get("smtpSecure") === "on",
      username: String(formData.get("username") || address).trim(),
      ...(passwordEnc ? { passwordEnc } : {}),
    },
  });
  await audit({
    actorId: admin.id,
    action: "create",
    entityType: "Mailbox",
    summary: `${provision ? "Provisioned" : "Registered"} mailbox ${address}${shared ? " (shared)" : ""}`,
  });
  revalidatePath("/admin/mailboxes");
  return OK;
}

/**
 * Reset the ACTUAL mailbox password on the Plesk mail server (admin only) and
 * update the stored connection password so webmail keeps working — all from the
 * portal. If the server call fails, the stored password is left unchanged.
 */
export async function resetMailboxPasswordOnServer(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const id = String(formData.get("id") || "");
  const password = String(formData.get("password") || "");
  if (password.length < 8) return fail("New password must be at least 8 characters.");
  const mb = await prisma.mailbox.findUnique({ where: { id } });
  if (!mb) return fail("Mailbox not found.");

  try {
    await pleskSetPassword(mb.address, password);
  } catch (err) {
    return fail(`Couldn't reset the password on the server: ${pleskMsg(err)}`);
  }
  await prisma.mailbox.update({ where: { id }, data: { passwordEnc: encryptSecret(password) } });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "Mailbox",
    entityId: id,
    summary: `Reset server password for mailbox ${mb.address}`,
  });
  revalidatePath("/admin/mailboxes");
  revalidatePath("/staff/mail/settings");
  return OK;
}

/**
 * Delete the mailbox on the Plesk mail server AND remove it from the portal
 * (admin only). If the server removal fails, the portal record is kept so the
 * connection isn't silently lost.
 */
export async function deleteMailboxOnServer(id: string): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const mb = await prisma.mailbox.findUnique({ where: { id } });
  if (!mb) return fail("Mailbox not found.");
  try {
    await pleskRemoveMailbox(mb.address);
  } catch (err) {
    return fail(`Couldn't delete the mailbox on the server: ${pleskMsg(err)}`);
  }
  await prisma.mailbox.delete({ where: { id } });
  await audit({
    actorId: admin.id,
    action: "delete",
    entityType: "Mailbox",
    entityId: id,
    summary: `Deleted mailbox ${mb.address} from the server and portal`,
  });
  revalidatePath("/admin/mailboxes");
  return OK;
}

export async function updateMailboxSettings(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const user = await requireRoleAction("ADMIN", "EMPLOYEE", "CLIENT");
  const id = String(formData.get("id") || "");
  const mb = await prisma.mailbox.findUnique({ where: { id } });
  if (!mb) return fail("Mailbox not found.");
  if (!canManage(mb, user)) return fail("You can't edit this mailbox.");

  // Owners may update display name + signature; admins may also change hosts.
  const data: Record<string, unknown> = {
    displayName: String(formData.get("displayName") || mb.displayName).trim(),
    signatureText: String(formData.get("signatureText") || "") || null,
    signatureHtml: String(formData.get("signatureHtml") || "") || null,
  };
  if (user.role === "ADMIN") {
    if (formData.get("imapHost")) data.imapHost = String(formData.get("imapHost")).trim();
    if (formData.get("imapPort")) data.imapPort = parseInt(String(formData.get("imapPort")), 10);
    if (formData.has("imapSecure")) data.imapSecure = formData.get("imapSecure") !== "off";
    if (formData.get("smtpHost")) data.smtpHost = String(formData.get("smtpHost")).trim();
    if (formData.get("smtpPort")) data.smtpPort = parseInt(String(formData.get("smtpPort")), 10);
    if (formData.has("smtpSecure")) data.smtpSecure = formData.get("smtpSecure") === "on";
    if (formData.get("username")) data.username = String(formData.get("username")).trim();
  }
  await prisma.mailbox.update({ where: { id }, data });
  revalidatePath("/admin/mailboxes");
  revalidatePath("/staff/mail/settings");
  revalidatePath("/client/mail/settings");
  return OK;
}

export async function setMailboxPassword(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const user = await requireRoleAction("ADMIN", "EMPLOYEE", "CLIENT");
  const id = String(formData.get("id") || "");
  const password = String(formData.get("password") || "");
  if (!password) return fail("Enter the mailbox password.");
  const mb = await prisma.mailbox.findUnique({ where: { id } });
  if (!mb) return fail("Mailbox not found.");
  if (!canManage(mb, user)) return fail("You can't edit this mailbox.");

  await prisma.mailbox.update({
    where: { id },
    data: { passwordEnc: encryptSecret(password) },
  });
  await audit({
    actorId: user.id,
    action: "update",
    entityType: "Mailbox",
    entityId: id,
    summary: `Updated password for mailbox ${mb.address}`,
  });
  revalidatePath("/admin/mailboxes");
  revalidatePath("/staff/mail/settings");
  revalidatePath("/client/mail/settings");
  return OK;
}

export async function deleteMailbox(id: string): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const mb = await prisma.mailbox.findUnique({ where: { id } });
  if (!mb) return fail("Mailbox not found.");
  await prisma.mailbox.delete({ where: { id } });
  await audit({
    actorId: admin.id,
    action: "delete",
    entityType: "Mailbox",
    entityId: id,
    summary: `Deleted mailbox ${mb.address}`,
  });
  revalidatePath("/admin/mailboxes");
  return OK;
}

export async function testMailbox(id: string): Promise<Result> {
  const user = await requireRoleAction("ADMIN", "EMPLOYEE", "CLIENT");
  const mb = await getMailboxForUser(id, user);
  if (!mb) return fail("Mailbox not found.");
  if (!mb.passwordEnc) return fail("Set the mailbox password first.");
  const res = await testMailboxConnection(mb);
  if (res.imap && res.smtp) return { ok: true, info: "IMAP and SMTP both connected." };
  return fail(res.error || "Connection failed.");
}

// ---------------------------------------------------------------------------
// Mail client actions
// ---------------------------------------------------------------------------

export async function sendMail(_prev: Result, formData: FormData): Promise<Result> {
  const user = await requireRoleAction("ADMIN", "EMPLOYEE", "CLIENT");
  const mailboxId = String(formData.get("mailboxId") || "");
  const mb = await getMailboxForUser(mailboxId, user);
  if (!mb) return fail("Mailbox not found.");
  if (!mb.passwordEnc) return fail("This mailbox isn't connected yet.");

  const toRaw = String(formData.get("to") || "");
  const ccRaw = String(formData.get("cc") || "");
  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!subject) return fail("Add a subject.");
  if (!body) return fail("Write a message.");

  const to = validateEmails(toRaw);
  if (to.invalid.length) return fail(`Invalid recipient(s): ${to.invalid.join(", ")}`);
  if (to.valid.length === 0) return fail("Add at least one recipient.");
  const cc = validateEmails(ccRaw);
  if (cc.invalid.length) return fail(`Invalid CC: ${cc.invalid.join(", ")}`);

  try {
    await sendFromMailbox(mb, {
      to: to.valid,
      cc: cc.valid,
      subject,
      text: body,
      inReplyTo: String(formData.get("inReplyTo") || "") || null,
      references: String(formData.get("references") || "") || null,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Send failed.");
  }
  revalidatePath("/staff/mail");
  revalidatePath("/admin/mail");
  return OK;
}

export async function markMessageRead(
  mailboxId: string,
  folder: string,
  uid: number,
  seen: boolean,
): Promise<Result> {
  const user = await requireRoleAction("ADMIN", "EMPLOYEE", "CLIENT");
  const mb = await getMailboxForUser(mailboxId, user);
  if (!mb) return fail("Mailbox not found.");
  try {
    await setSeen(mb, folder, uid, seen);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed.");
  }
  return OK;
}

export async function deleteMailMessage(
  mailboxId: string,
  folder: string,
  uid: number,
): Promise<Result> {
  const user = await requireRoleAction("ADMIN", "EMPLOYEE", "CLIENT");
  const mb = await getMailboxForUser(mailboxId, user);
  if (!mb) return fail("Mailbox not found.");
  try {
    await deleteMessage(mb, folder, uid);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed.");
  }
  return OK;
}
