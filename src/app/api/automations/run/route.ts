import { NextResponse } from "next/server";
import { runScheduledAutomations } from "@/lib/automations";

// Scheduled automations runner. Point a daily (or hourly) cron / Task Scheduler
// job here:
//   curl "https://rowancopy.com/api/automations/run?secret=INBOUND_WEBHOOK_SECRET"
//
// It sends: due-soon reminders to assignees, overdue alerts to admins,
// monthly-plan renewal reminders to clients, and the admin daily digest — each
// gated by its toggle in Admin → Signature & settings, and deduped so running
// it more often than daily never double-sends.
//
// Secured by INBOUND_WEBHOOK_SECRET when set (open in local dev if unset).
export async function GET(req: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (secret) {
    const provided =
      req.headers.get("x-webhook-secret") ||
      new URL(req.url).searchParams.get("secret");
    if (provided !== secret) return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = await runScheduledAutomations();
  return NextResponse.json({ ok: true, ...results });
}
