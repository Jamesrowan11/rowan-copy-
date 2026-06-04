import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Inbound-email webhook (Resend / Mailgun / Postmark style). Matches the sender
// to a user and files the email into their message thread; if there's no match,
// it lands in the admin "Unmatched Inbox".
//
// Secured by INBOUND_WEBHOOK_SECRET (passed as ?secret= or x-webhook-secret
// header). If the secret is unset, the endpoint is OPEN — intended for local
// dev only. Always set the secret in production.
export async function POST(req: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const provided =
      req.headers.get("x-webhook-secret") || url.searchParams.get("secret");
    if (provided !== secret) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  let payload: Record<string, unknown> = {};
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      payload = await req.json();
    } else {
      const form = await req.formData();
      form.forEach((v, k) => (payload[k] = v));
    }
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  // Accept a range of common field names across providers.
  const fromRaw = String(
    payload.from || payload.sender || payload.From || payload.email || "",
  );
  const subject = String(payload.subject || payload.Subject || "(No subject)");
  const body = String(
    payload.text || payload.body || payload.plain || payload["body-plain"] || "",
  );

  // Extract a bare email from "Name <email>" if needed.
  const match = fromRaw.match(/[^\s<>]+@[^\s<>]+/);
  const fromEmail = (match ? match[0] : fromRaw).toLowerCase().trim();
  if (!fromEmail) return new NextResponse("Missing sender", { status: 400 });

  // Log every inbound email.
  await prisma.emailLog.create({
    data: {
      to: process.env.EMAIL_FROM || "Rowan Copy",
      subject,
      body,
      status: "received",
      direction: "inbound",
    },
  });

  const user = await prisma.user.findUnique({ where: { email: fromEmail } });

  if (!user || !user.active) {
    await prisma.inboundEmail.create({
      data: { fromEmail, subject, body, matched: false },
    });
    return NextResponse.json({ ok: true, matched: false });
  }

  // File into the user's most recent thread, or start a new one with all admins.
  const existing = await prisma.threadParticipant.findFirst({
    where: { userId: user.id },
    orderBy: { thread: { updatedAt: "desc" } },
    include: { thread: true },
  });

  if (existing) {
    await prisma.message.create({
      data: { threadId: existing.threadId, senderId: user.id, body: `${subject}\n\n${body}` },
    });
    await prisma.thread.update({
      where: { id: existing.threadId },
      data: { updatedAt: new Date() },
    });
  } else {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { id: true },
    });
    const participantIds = Array.from(new Set([user.id, ...admins.map((a) => a.id)]));
    await prisma.thread.create({
      data: {
        subject,
        participants: { create: participantIds.map((id) => ({ userId: id })) },
        messages: { create: { senderId: user.id, body } },
      },
    });
  }

  return NextResponse.json({ ok: true, matched: true });
}
