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

const EMAIL_FROM = process.env.EMAIL_FROM || "Rowan Copy <landen@rowancopy.com>";

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
 * Pluggable email send. If RESEND_API_KEY is set, sends via Resend; otherwise
 * logs the full email to the server console. Every send is recorded in EmailLog
 * with the sender, recipients, subject, body, status and timestamp.
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
  const apiKey = process.env.RESEND_API_KEY;

  if (apiKey) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(apiKey);
      const res = await resend.emails.send({
        from: EMAIL_FROM,
        to: to.map((t) => t.trim()).filter(Boolean),
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
