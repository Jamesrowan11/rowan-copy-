import { prisma } from "@/lib/prisma";
import { DEFAULT_SIGNATURE_TEXT } from "@/lib/constants";

// Marker used to detect an already-appended signature so we never double-append.
const SIG_MARKER = "<!-- rowan-copy-signature -->";
const SIG_TEXT_MARKER = "-- \nRowan Copy";

function defaultHtml(text: string): string {
  const lines = text.split("\n");
  const [company, ...rest] = lines;
  return `${SIG_MARKER}
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f1;font-family:Helvetica,Arial,sans-serif;color:#14233f;font-size:14px;line-height:1.5">
  <div style="font-weight:700;color:#14233f;font-size:15px">${escapeHtml(company || "Rowan Copy")}</div>
  ${rest
    .map(
      (l, i) =>
        `<div style="color:${i === 0 ? "#48648c" : "#14233f"}">${escapeHtml(l)}</div>`,
    )
    .join("\n  ")}
</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function getSignature(): Promise<{ text: string; html: string }> {
  let sig = await prisma.signature.findFirst();
  if (!sig) {
    sig = await prisma.signature.create({
      data: {
        text: DEFAULT_SIGNATURE_TEXT,
        html: defaultHtml(DEFAULT_SIGNATURE_TEXT),
      },
    });
  }
  return { text: sig.text, html: sig.html };
}

export async function setSignature(text: string, html?: string) {
  const existing = await prisma.signature.findFirst();
  const finalHtml = html && html.trim() ? html : defaultHtml(text);
  if (existing) {
    return prisma.signature.update({
      where: { id: existing.id },
      data: { text, html: finalHtml },
    });
  }
  return prisma.signature.create({ data: { text, html: finalHtml } });
}

/** Append the company signature to a plain-text body unless already present. */
export function appendSignatureText(body: string, signatureText: string): string {
  if (body.includes(SIG_TEXT_MARKER) || body.includes(signatureText.trim())) {
    return body;
  }
  return `${body.trimEnd()}\n\n-- \n${signatureText}`;
}

/** Append the branded HTML signature unless already present. */
export function appendSignatureHtml(body: string, signatureHtml: string): string {
  if (body.includes(SIG_MARKER)) return body;
  return `${body}\n${signatureHtml}`;
}

export { defaultHtml as defaultSignatureHtml };
