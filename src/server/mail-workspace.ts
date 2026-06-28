"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/authz";
import { encryptSecret } from "@/lib/crypto";
import { hashPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { pleskCreateMailbox, pleskRemoveMailbox } from "@/lib/plesk-mail";

type Result = { ok: boolean; error?: string; info?: string };
const OK: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/i;
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

// Build the connection defaults for a new mailbox on a given domain.
function mailboxData(address: string, domain: string, ownerId: string, password: string, displayName: string) {
  return {
    address,
    displayName,
    ownerId,
    shared: false,
    imapHost: domain,
    imapPort: 993,
    imapSecure: true,
    smtpHost: domain,
    smtpPort: 587,
    smtpSecure: false,
    username: address,
    passwordEnc: encryptSecret(password),
  };
}

// ---------------------------------------------------------------------------
// Admin: the switch
// ---------------------------------------------------------------------------

/** Turn a customer's mailbox-management on/off and set the domain they manage. */
export async function setMailAdmin(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const id = String(formData.get("id") || "");
  const enabled = formData.get("mailAdmin") === "on";
  const mailDomain = String(formData.get("mailDomain") || "").trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return fail("User not found.");
  if (user.role !== "CLIENT") return fail("Mailbox management is for client accounts.");
  if (enabled && !HOSTNAME_RE.test(mailDomain)) {
    return fail("Enter the customer's domain (e.g. acme.com) to enable mailbox management.");
  }

  await prisma.user.update({
    where: { id },
    data: { mailAdmin: enabled, mailDomain: enabled ? mailDomain : null },
  });
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "User",
    entityId: id,
    summary: enabled
      ? `Enabled mailbox management for ${user.name} on ${mailDomain}`
      : `Disabled mailbox management for ${user.name}`,
  });
  revalidatePath(`/admin/users/${id}`);
  return { ok: true, info: enabled ? `Mailbox management enabled on ${mailDomain}.` : "Mailbox management disabled." };
}

// ---------------------------------------------------------------------------
// Customer (workspace owner): manage mail on their own domain
// ---------------------------------------------------------------------------

/** The signed-in customer must have the switch on; returns their record + domain. */
async function requireMailAdmin() {
  const u = await requireRoleAction("CLIENT");
  const me = await prisma.user.findUnique({ where: { id: u.id } });
  if (!me || !me.mailAdmin || !me.mailDomain) {
    throw new Error("Mailbox management isn't enabled for your account.");
  }
  return me;
}

/** Create the OWNER's own mailbox on their domain (assigned to themselves). */
export async function createOwnMailbox(_prev: Result, formData: FormData): Promise<Result> {
  let me;
  try {
    me = await requireMailAdmin();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Not allowed.");
  }
  const local = String(formData.get("local") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!LOCAL_RE.test(local)) return fail("Enter a valid address (before the @).");
  if (password.length < 8) return fail("Password must be at least 8 characters.");

  const address = `${local}@${me.mailDomain}`;
  if (await prisma.mailbox.findUnique({ where: { address } })) {
    return fail("That address is already in use.");
  }
  try {
    await pleskCreateMailbox(address, password);
  } catch (err) {
    return fail(`Couldn't create the mailbox: ${pleskMsg(err)}`);
  }
  await prisma.mailbox.create({ data: mailboxData(address, me.mailDomain!, me.id, password, me.name) });
  await audit({ actorId: me.id, action: "create", entityType: "Mailbox", summary: `Created own mailbox ${address}` });
  revalidatePath("/client/team-email");
  return { ok: true, info: `Created ${address}.` };
}

/** Create a teammate: a portal login (CLIENT) + a mailbox on the owner's domain. */
export async function addTeammate(_prev: Result, formData: FormData): Promise<Result> {
  let me;
  try {
    me = await requireMailAdmin();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Not allowed.");
  }
  const name = String(formData.get("name") || "").trim();
  const local = String(formData.get("local") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!name) return fail("Enter the teammate's name.");
  if (!LOCAL_RE.test(local)) return fail("Enter a valid address (before the @).");
  if (password.length < 8) return fail("Password must be at least 8 characters.");

  const address = `${local}@${me.mailDomain}`;
  if (await prisma.user.findUnique({ where: { email: address } })) {
    return fail("Someone with that address already has a login.");
  }
  if (await prisma.mailbox.findUnique({ where: { address } })) {
    return fail("That address is already in use.");
  }

  // Provision on the server FIRST so a failure never leaves an orphaned account.
  try {
    await pleskCreateMailbox(address, password);
  } catch (err) {
    return fail(`Couldn't create the mailbox: ${pleskMsg(err)}`);
  }

  const teammate = await prisma.user.create({
    data: {
      name,
      email: address,
      role: "CLIENT",
      passwordHash: await hashPassword(password),
      mailWorkspaceOwnerId: me.id,
    },
  });
  await prisma.mailbox.create({ data: mailboxData(address, me.mailDomain!, teammate.id, password, name) });
  await audit({
    actorId: me.id,
    action: "create",
    entityType: "User",
    entityId: teammate.id,
    summary: `Added teammate ${name} (${address})`,
  });
  revalidatePath("/client/team-email");
  return { ok: true, info: `Added ${name}. They can sign in with ${address} and the password you set.` };
}

/** Remove a teammate: deprovision their mailbox and delete their login. */
export async function removeTeammate(teammateId: string): Promise<Result> {
  let me;
  try {
    me = await requireMailAdmin();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Not allowed.");
  }
  const teammate = await prisma.user.findUnique({
    where: { id: teammateId },
    include: { mailboxes: true },
  });
  if (!teammate || teammate.mailWorkspaceOwnerId !== me.id) return fail("Teammate not found.");

  // Remove each of their mailboxes from the server first.
  for (const mb of teammate.mailboxes) {
    try {
      await pleskRemoveMailbox(mb.address);
    } catch (err) {
      return fail(`Couldn't remove the mailbox on the server: ${pleskMsg(err)}`);
    }
  }
  // Deleting the user cascades their Mailbox rows (onDelete: Cascade).
  await prisma.user.delete({ where: { id: teammate.id } });
  await audit({
    actorId: me.id,
    action: "delete",
    entityType: "User",
    entityId: teammate.id,
    summary: `Removed teammate ${teammate.name} (${teammate.email})`,
  });
  revalidatePath("/client/team-email");
  return OK;
}
