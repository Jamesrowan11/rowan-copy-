import { prisma } from "@/lib/prisma";
import {
  getSignature,
  appendSignatureText,
  appendSignatureHtml,
} from "@/lib/signature";

export type SendEmailInput = {
  to: string[]; // recipient email addresses
  subject: string;
  /** Plain-text body (signature appended automatically). */
  text: string;
  /** Optional HTML body. If omitted, generated from text. */
  html?: string;
  /** User id of the sender (for the EmailLog). */
  senderUserId?: string | null;
  /** Set false to skip appending the company signature. */
  appendSignature?: boolean;
};

const EMAIL_FROM = process.env.EMAIL_FROM || "Rowan Copy <info@rowancopy.com>";

export type EmailMode = "smtp" | "resend" | "console";

/** Which transport sendEmail() will use, based on the environment. */
export function emailMode(): EmailMode {
  if (process.env.SMTP_HOST) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return "console";
}

// Reuse a single SMTP transporter across calls.
let cachedTransport: import("nodemailer").Transporter | null = null;

async function getSmtpTransport() {
  if (cachedTransport) return cachedTransport;
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT) || 587;
  // Port 465 is implicit TLS; 587/25 upgrade via STARTTLS. SMTP_SECURE overrides.
  const secure =
    process.env.SMTP_SECURE != null
      ? process.env.SMTP_SECURE === "true"
      : port === 465;
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return cachedTransport;
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

/**
 * Pluggable email send. Transport is chosen by environment, in priority order:
 *   1. SMTP (Plesk mail server) when SMTP_HOST is set
 *   2. Resend when RESEND_API_KEY is set
 *   3. Console log otherwise (so the app runs end-to-end with no mail config)
 * Every send is recorded in EmailLog with the sender, recipients, subject, body,
 * status and timestamp.
 */
export async function sendEmail(input: SendEmailInput) {
  const { to, subject, senderUserId } = input;
  const appendSig = input.appendSignature !== false;

  let text = input.text;
  let html = input.html || textToHtml(input.text);

  if (appendSig) {
    const sig = await getSignature();
    text = appendSignatureText(text, sig.text);
    html = appendSignatureHtml(html, sig.html);
  }

  const recipients = to
    .map((t) => t.trim())
    .filter(Boolean)
    .join(", ");

  let status: "sent" | "logged" | "failed" = "logged";
  const cleanTo = to.map((t) => t.trim()).filter(Boolean);
  const mode = emailMode();

  if (mode === "smtp") {
    // Send through the Plesk (or any) SMTP mail server.
    try {
      const transport = await getSmtpTransport();
      await transport.sendMail({ from: EMAIL_FROM, to: cleanTo, subject, text, html });
      status = "sent";
    } catch (err) {
      status = "failed";
      console.error("[email] SMTP send failed:", err);
    }
  } else if (mode === "resend") {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const res = await resend.emails.send({
        from: EMAIL_FROM,
        to: cleanTo,
        subject,
        text,
        html,
      });
      status = res.error ? "failed" : "sent";
      if (res.error) {
        console.error("[email] Resend error:", res.error);
      }
    } catch (err) {
      status = "failed";
      console.error("[email] Resend threw:", err);
    }
  } else {
    // No email key configured — log the full email so the app runs end-to-end.
    console.log(
      [
        "",
        "==================== EMAIL (console fallback) ====================",
        `From:    ${EMAIL_FROM}`,
        `To:      ${recipients}`,
        `Subject: ${subject}`,
        "------------------------------------------------------------------",
        text,
        "==================================================================",
        "",
      ].join("\n"),
    );
    status = "logged";
  }

  const log = await prisma.emailLog.create({
    data: {
      senderUserId: senderUserId || null,
      to: recipients,
      subject,
      body: text,
      status,
      direction: "outbound",
    },
  });

  return { status, logId: log.id };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmails(raw: string): {
  valid: string[];
  invalid: string[];
} {
  const parts = raw
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (EMAIL_RE.test(p)) valid.push(p);
    else invalid.push(p);
  }
  return { valid, invalid };
}
