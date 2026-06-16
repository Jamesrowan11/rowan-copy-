import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { SessionUser } from "@/lib/authz";
import type { Mailbox } from "@prisma/client";

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

function isStaff(user: SessionUser) {
  return user.role === "ADMIN" || user.role === "EMPLOYEE";
}

/** Mailboxes a user may use: their own + any shared mailbox (staff only). */
export async function mailboxesForUser(user: SessionUser): Promise<Mailbox[]> {
  if (!isStaff(user)) return [];
  return prisma.mailbox.findMany({
    where: {
      active: true,
      OR: [{ ownerId: user.id }, { shared: true }],
    },
    orderBy: [{ shared: "asc" }, { address: "asc" }],
  });
}

/** A single mailbox the user may access, or null (server-enforced — IDOR-safe). */
export async function getMailboxForUser(
  mailboxId: string,
  user: SessionUser,
): Promise<Mailbox | null> {
  if (!isStaff(user)) return null;
  const mb = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!mb || !mb.active) return null;
  if (mb.ownerId === user.id) return mb;
  if (mb.shared) return mb;
  // Admins may access any mailbox (e.g. to manage/troubleshoot).
  if (user.role === "ADMIN") return mb;
  return null;
}

export function mailboxIsConfigured(mb: Mailbox): boolean {
  return !!mb.passwordEnc;
}

// ---------------------------------------------------------------------------
// IMAP
// ---------------------------------------------------------------------------

function imapClient(mb: Mailbox): ImapFlow {
  if (!mb.passwordEnc) throw new Error("This mailbox has no password set yet.");
  return new ImapFlow({
    host: mb.imapHost,
    port: mb.imapPort,
    secure: mb.imapSecure,
    auth: { user: mb.username, pass: decryptSecret(mb.passwordEnc) },
    logger: false,
    // Don't let a slow/bad server hang the request forever.
    socketTimeout: 20000,
  });
}

async function withImap<T>(mb: Mailbox, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const client = imapClient(mb);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

export type MailFolder = {
  path: string;
  name: string;
  specialUse?: string;
};

export async function listFolders(mb: Mailbox): Promise<MailFolder[]> {
  return withImap(mb, async (c) => {
    const list = await c.list();
    return list.map((b) => ({
      path: b.path,
      name: b.name,
      specialUse: b.specialUse,
    }));
  });
}

export type MessageSummary = {
  uid: number;
  subject: string;
  from: string;
  fromName: string;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  hasAttachments: boolean;
};

export async function listMessages(
  mb: Mailbox,
  folder: string,
  page = 0,
  pageSize = 25,
): Promise<{ messages: MessageSummary[]; total: number }> {
  return withImap(mb, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const status = c.mailbox;
      const total = typeof status === "object" ? status.exists : 0;
      if (!total) return { messages: [], total: 0 };

      const end = total - page * pageSize;
      const start = Math.max(1, end - pageSize + 1);
      if (end < 1) return { messages: [], total };

      const out: MessageSummary[] = [];
      for await (const m of c.fetch(
        `${start}:${end}`,
        { uid: true, envelope: true, flags: true, bodyStructure: true },
      )) {
        const from = m.envelope?.from?.[0];
        out.push({
          uid: m.uid,
          subject: m.envelope?.subject || "(no subject)",
          from: from?.address || "",
          fromName: from?.name || from?.address || "",
          date: m.envelope?.date ? new Date(m.envelope.date).toISOString() : null,
          seen: m.flags?.has("\\Seen") ?? false,
          flagged: m.flags?.has("\\Flagged") ?? false,
          hasAttachments: hasAttachmentParts(m.bodyStructure),
        });
      }
      out.reverse(); // newest first
      return { messages: out, total };
    } finally {
      lock.release();
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasAttachmentParts(struct: any): boolean {
  if (!struct) return false;
  if (struct.disposition === "attachment") return true;
  if (Array.isArray(struct.childNodes)) {
    return struct.childNodes.some(hasAttachmentParts);
  }
  return false;
}

export type FullMessage = {
  uid: number;
  subject: string;
  from: string;
  fromName: string;
  to: string;
  cc: string;
  date: string | null;
  text: string;
  html: string | null;
  messageId: string | null;
  references: string | null;
  attachments: { filename: string; contentType: string; size: number; index: number }[];
};

export async function getMessage(
  mb: Mailbox,
  folder: string,
  uid: number,
  markSeen = true,
): Promise<FullMessage | null> {
  return withImap(mb, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const msg = await c.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) return null;
      const parsed = await simpleParser(msg.source);
      if (markSeen) {
        await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => {});
      }
      const fromAddr = parsed.from?.value?.[0];
      return {
        uid,
        subject: parsed.subject || "(no subject)",
        from: fromAddr?.address || "",
        fromName: fromAddr?.name || fromAddr?.address || "",
        to: addrText(parsed.to),
        cc: addrText(parsed.cc),
        date: parsed.date ? parsed.date.toISOString() : null,
        text: parsed.text || "",
        html: typeof parsed.html === "string" ? parsed.html : null,
        messageId: parsed.messageId || null,
        references: Array.isArray(parsed.references)
          ? parsed.references.join(" ")
          : parsed.references || null,
        attachments: parsed.attachments.map((a, i) => ({
          filename: a.filename || `attachment-${i + 1}`,
          contentType: a.contentType || "application/octet-stream",
          size: a.size || a.content?.length || 0,
          index: i,
        })),
      };
    } finally {
      lock.release();
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addrText(a: any): string {
  if (!a) return "";
  if (Array.isArray(a)) return a.map((x) => x.text).join(", ");
  return a.text || "";
}

export async function getAttachment(
  mb: Mailbox,
  folder: string,
  uid: number,
  index: number,
): Promise<{ filename: string; contentType: string; content: Buffer } | null> {
  return withImap(mb, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const msg = await c.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) return null;
      const parsed = await simpleParser(msg.source);
      const att = parsed.attachments[index];
      if (!att) return null;
      return {
        filename: att.filename || `attachment-${index + 1}`,
        contentType: att.contentType || "application/octet-stream",
        content: att.content as Buffer,
      };
    } finally {
      lock.release();
    }
  });
}

export async function setSeen(mb: Mailbox, folder: string, uid: number, seen: boolean) {
  return withImap(mb, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      if (seen) await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      else await c.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  });
}

export async function deleteMessage(mb: Mailbox, folder: string, uid: number) {
  return withImap(mb, async (c) => {
    const trash = await findSpecialFolder(c, "\\Trash");
    const lock = await c.getMailboxLock(folder);
    try {
      if (trash && trash !== folder) {
        await c.messageMove(String(uid), trash, { uid: true });
      } else {
        // Already in Trash (or no Trash folder) — delete permanently.
        await c.messageDelete(String(uid), { uid: true });
      }
    } finally {
      lock.release();
    }
  });
}

async function findSpecialFolder(c: ImapFlow, use: string): Promise<string | null> {
  const list = await c.list();
  const m = list.find((b) => b.specialUse === use);
  return m ? m.path : null;
}

// ---------------------------------------------------------------------------
// Unread counts (for nav badges) — best-effort, never throws.
// ---------------------------------------------------------------------------

export async function unreadCount(mb: Mailbox): Promise<number> {
  if (!mailboxIsConfigured(mb)) return 0;
  try {
    return await withImap(mb, async (c) => {
      const lock = await c.getMailboxLock("INBOX");
      try {
        const res = await c.search({ seen: false }, { uid: true });
        return Array.isArray(res) ? res.length : 0;
      } finally {
        lock.release();
      }
    });
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// SMTP send
// ---------------------------------------------------------------------------

function smtpTransport(mb: Mailbox) {
  if (!mb.passwordEnc) throw new Error("This mailbox has no password set yet.");
  return nodemailer.createTransport({
    host: mb.smtpHost,
    port: mb.smtpPort,
    secure: mb.smtpSecure || mb.smtpPort === 465,
    auth: { user: mb.username, pass: decryptSecret(mb.passwordEnc) },
  });
}

export type SendOptions = {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string | null;
  appendSignature?: boolean;
};

export async function sendFromMailbox(mb: Mailbox, opts: SendOptions) {
  let text = opts.text;
  if (opts.appendSignature !== false && mb.signatureText) {
    text = `${text.trimEnd()}\n\n-- \n${mb.signatureText}`;
  }
  const html =
    mb.signatureHtml && opts.appendSignature !== false
      ? `${textToHtml(opts.text)}<br/>${mb.signatureHtml}`
      : textToHtml(text);

  const mailOptions = {
    from: `${mb.displayName} <${mb.address}>`,
    to: opts.to,
    cc: opts.cc,
    subject: opts.subject,
    text,
    html,
    inReplyTo: opts.inReplyTo || undefined,
    references: opts.references || undefined,
  };

  const transport = smtpTransport(mb);
  const info = await transport.sendMail(mailOptions);

  // Best-effort: append a copy to the Sent folder so it shows in the mailbox.
  try {
    const MailComposer = (await import("nodemailer/lib/mail-composer")).default;
    const raw = await new MailComposer(mailOptions).compile().build();
    await withImap(mb, async (c) => {
      const sent = await findSpecialFolder(c, "\\Sent");
      if (sent) await c.append(sent, raw, ["\\Seen"]);
    });
  } catch {
    /* ignore — the send already succeeded even if the Sent copy didn't */
  }

  return { messageId: info.messageId };
}

function textToHtml(text: string): string {
  return text
    .split("\n")
    .map((l) =>
      l.trim() === ""
        ? "<br/>"
        : `<p style="margin:0 0 12px">${l
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</p>`,
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Connection test (used after saving credentials)
// ---------------------------------------------------------------------------

export async function testMailboxConnection(
  mb: Mailbox,
): Promise<{ imap: boolean; smtp: boolean; error?: string }> {
  const result = { imap: false, smtp: false, error: undefined as string | undefined };
  try {
    await withImap(mb, async (c) => {
      await c.getMailboxLock("INBOX").then((l) => l.release());
    });
    result.imap = true;
  } catch (e) {
    result.error = `IMAP: ${e instanceof Error ? e.message : "failed"}`;
  }
  try {
    await smtpTransport(mb).verify();
    result.smtp = true;
  } catch (e) {
    result.error = (result.error ? result.error + " · " : "") +
      `SMTP: ${e instanceof Error ? e.message : "failed"}`;
  }
  return result;
}
