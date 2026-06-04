import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { ACTIVE_PROJECT_STATUSES } from "@/lib/constants";

// Dashboard digest: a summary of open inquiries and due-soon projects, emailed
// to all active admins. Intended to be triggered by a scheduler (cron) — e.g.
//   curl "https://rowancopy.com/api/digest?secret=INBOUND_WEBHOOK_SECRET"
// Secured by INBOUND_WEBHOOK_SECRET when set (open in local dev if unset).
export async function GET(req: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (secret) {
    const provided =
      req.headers.get("x-webhook-secret") ||
      new URL(req.url).searchParams.get("secret");
    if (provided !== secret) return new NextResponse("Unauthorized", { status: 401 });
  }

  const soon = new Date(Date.now() + 1000 * 60 * 60 * 24 * 5);

  const [inquiries, dueSoon, admins] = await Promise.all([
    prisma.inquiry.findMany({
      where: { status: { in: ["New", "Reviewed"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({
      where: {
        status: { in: ACTIVE_PROJECT_STATUSES },
        dueDate: { not: null, lte: soon },
      },
      orderBy: { dueDate: "asc" },
      include: { client: true, assignee: true },
    }),
    prisma.user.findMany({ where: { role: "ADMIN", active: true } }),
  ]);

  if (admins.length === 0) return NextResponse.json({ ok: true, skipped: "no admins" });

  const lines: string[] = [];
  lines.push(`Rowan Copy daily digest — ${new Date().toLocaleDateString("en-US")}`);
  lines.push("");
  lines.push(`Open inquiries: ${inquiries.length}`);
  for (const i of inquiries.slice(0, 10)) {
    lines.push(`  • ${i.name}${i.business ? ` (${i.business})` : ""} — ${i.serviceType}`);
  }
  lines.push("");
  lines.push(`Projects due in the next 5 days: ${dueSoon.length}`);
  for (const p of dueSoon) {
    lines.push(
      `  • ${p.title} — ${p.client.name} — ${p.assignee?.name ?? "Unassigned"} — due ${p.dueDate?.toLocaleDateString("en-US")}`,
    );
  }

  await sendEmail({
    to: admins.map((a) => a.email),
    subject: "Rowan Copy — daily digest",
    text: lines.join("\n"),
  });

  return NextResponse.json({
    ok: true,
    inquiries: inquiries.length,
    dueSoon: dueSoon.length,
  });
}
