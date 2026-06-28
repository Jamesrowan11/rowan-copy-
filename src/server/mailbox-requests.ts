"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/authz";
import { encryptSecret } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { pleskCreateMailbox } from "@/lib/plesk-mail";

type Result = { ok: boolean; error?: string; info?: string };
const OK: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

const MAIL_DOMAIN = process.env.DEMO_DOMAIN || "rowancopy.com";
// Local part: lowercase letters/digits, with . _ - allowed in the middle.
const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._-]{0,38}[a-z0-9])?$/;

function pleskMsg(err: unknown): string {
  const e = (err || {}) as { stderr?: string; message?: string };
  const s = String(e.stderr || e.message || "").trim();
  const first = s.split("\n").find((l) => l.trim()) || "";
  if (/ENOENT|not found|command not found/i.test(s)) {
    return "the server isn't set up for portal provisioning yet (plesk CLI/sudo rule missing).";
  }
  return first.slice(0, 200) || "the command failed.";
}

// ---------------------------------------------------------------------------
// Client: request an email account
// ---------------------------------------------------------------------------

export async function requestMailbox(_prev: Result, formData: FormData): Promise<Result> {
  const client = await requireRoleAction("CLIENT");
  const desiredLocal = String(formData.get("desiredLocal") || "").trim().toLowerCase();
  const note = String(formData.get("note") || "").trim() || null;
  if (!LOCAL_RE.test(desiredLocal)) {
    return fail("Enter the part before @ using lowercase letters, numbers, dots, or hyphens.");
  }

  // One open request at a time keeps the admin queue clean.
  const open = await prisma.mailboxRequest.findFirst({
    where: { requesterId: client.id, status: "Pending" },
  });
  if (open) return fail("You already have a pending request. We'll be in touch soon.");

  const address = `${desiredLocal}@${MAIL_DOMAIN}`;
  const existing = await prisma.mailbox.findUnique({ where: { address } });
  if (existing) return fail("That address is already taken — try another.");

  await prisma.mailboxRequest.create({
    data: { requesterId: client.id, desiredLocal, domain: MAIL_DOMAIN, note },
  });
  await audit({
    actorId: client.id,
    action: "create",
    entityType: "MailboxRequest",
    summary: `Requested email account ${address}`,
  });
  revalidatePath("/client/email");
  revalidatePath("/admin/mailbox-requests");
  return { ok: true, info: "Request sent. An admin will review it shortly." };
}

/** A client may withdraw their own pending request. */
export async function cancelMailboxRequest(id: string): Promise<Result> {
  const client = await requireRoleAction("CLIENT");
  const req = await prisma.mailboxRequest.findUnique({ where: { id } });
  if (!req || req.requesterId !== client.id) return fail("Request not found.");
  if (req.status !== "Pending") return fail("Only pending requests can be cancelled.");
  await prisma.mailboxRequest.delete({ where: { id } });
  revalidatePath("/client/email");
  revalidatePath("/admin/mailbox-requests");
  return OK;
}

// ---------------------------------------------------------------------------
// Admin: approve (provision + assign) or deny
// ---------------------------------------------------------------------------

export async function approveMailboxRequest(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const id = String(formData.get("id") || "");
  const password = String(formData.get("password") || "");
  // Admin may tweak the local part before approving (e.g. fix a typo).
  const localOverride = String(formData.get("desiredLocal") || "").trim().toLowerCase();

  const req = await prisma.mailboxRequest.findUnique({
    where: { id },
    include: { requester: true },
  });
  if (!req) return fail("Request not found.");
  if (req.status !== "Pending") return fail("This request has already been decided.");
  if (password.length < 8) return fail("Set an initial password (8+ characters).");

  const local = localOverride || req.desiredLocal;
  if (!LOCAL_RE.test(local)) return fail("The address before @ isn't valid.");
  const address = `${local}@${req.domain}`;

  const existing = await prisma.mailbox.findUnique({ where: { address } });
  if (existing) return fail("A mailbox with that address already exists.");

  // Provision on the server FIRST so a failure never leaves an orphaned record.
  try {
    await pleskCreateMailbox(address, password);
  } catch (err) {
    return fail(`Couldn't create the mailbox on the server: ${pleskMsg(err)}`);
  }

  const mailbox = await prisma.mailbox.create({
    data: {
      address,
      displayName: req.requester.name,
      ownerId: req.requesterId,
      shared: false,
      imapHost: req.domain,
      imapPort: 993,
      imapSecure: true,
      smtpHost: req.domain,
      smtpPort: 587,
      smtpSecure: false,
      username: address,
      passwordEnc: encryptSecret(password),
    },
  });

  await prisma.mailboxRequest.update({
    where: { id },
    data: {
      status: "Approved",
      desiredLocal: local,
      mailboxId: mailbox.id,
      decidedById: admin.id,
      decidedAt: new Date(),
      decisionNote: String(formData.get("decisionNote") || "").trim() || null,
    },
  });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "MailboxRequest",
    entityId: id,
    summary: `Approved & provisioned ${address} for ${req.requester.name}`,
  });
  revalidatePath("/admin/mailbox-requests");
  revalidatePath("/admin/mailboxes");
  revalidatePath("/client/email");
  return { ok: true, info: `Created ${address} and assigned it to ${req.requester.name}.` };
}

export async function denyMailboxRequest(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const id = String(formData.get("id") || "");
  const req = await prisma.mailboxRequest.findUnique({ where: { id } });
  if (!req) return fail("Request not found.");
  if (req.status !== "Pending") return fail("This request has already been decided.");

  await prisma.mailboxRequest.update({
    where: { id },
    data: {
      status: "Denied",
      decidedById: admin.id,
      decidedAt: new Date(),
      decisionNote: String(formData.get("decisionNote") || "").trim() || null,
    },
  });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "MailboxRequest",
    entityId: id,
    summary: `Denied email request ${req.desiredLocal}@${req.domain}`,
  });
  revalidatePath("/admin/mailbox-requests");
  revalidatePath("/client/email");
  return OK;
}
