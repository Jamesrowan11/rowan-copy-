import { NextResponse } from "next/server";
import { runBoard } from "@/lib/board";

// The AI board's scheduled runner. Point a daily Plesk scheduled task here:
//   curl "https://rowancopy.com/api/board/run?secret=INBOUND_WEBHOOK_SECRET"
// Secured by INBOUND_WEBHOOK_SECRET when set (open in local dev if unset).
// Safe to call repeatedly: the board has a concurrency guard, per-director
// daily caps, a dry-run mode, and a master kill switch.
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (secret) {
    const provided =
      req.headers.get("x-webhook-secret") ||
      new URL(req.url).searchParams.get("secret");
    if (provided !== secret) return new NextResponse("Unauthorized", { status: 401 });
  }
  const result = await runBoard("schedule");
  return NextResponse.json({ ok: true, ...result });
}
