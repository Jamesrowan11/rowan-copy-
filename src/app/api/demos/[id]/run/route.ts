import { NextResponse } from "next/server";
import { runDemoPipeline } from "@/lib/demo-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Optional external trigger for a Demo's processing. The pipeline normally runs
// in-process from the createDemo server action; this route remains for manual /
// retry use. Secured by INBOUND_WEBHOOK_SECRET (x-internal-secret header or
// ?secret=), reusing the inbound-webhook pattern. Open only if the secret is
// unset (dev).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (secret) {
    const provided =
      req.headers.get("x-internal-secret") ||
      new URL(req.url).searchParams.get("secret");
    if (provided !== secret) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  const { id } = await params;
  const result = await runDemoPipeline(id);
  return NextResponse.json(result);
}
