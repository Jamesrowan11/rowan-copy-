import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { researchAndBuild, draftOutreachEmail, slugifyLabel } from "@/lib/leadgen";
import { deploySubdomain } from "@/lib/deploy";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Background processor for a Demo. Triggered fire-and-forget by createDemo.
// Secured by INBOUND_WEBHOOK_SECRET (x-internal-secret header or ?secret=),
// reusing the inbound-webhook pattern. Open only if the secret is unset (dev).
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
  const demo = await prisma.demo.findUnique({ where: { id } });
  if (!demo) return new NextResponse("Not found", { status: 404 });

  // (a) mark Building
  await prisma.demo.update({ where: { id }, data: { status: "Building" } });

  if (!process.env.ANTHROPIC_API_KEY) {
    await prisma.demo.update({
      where: { id },
      data: { status: "Error", researchSummary: "ANTHROPIC_API_KEY is not set on the server." },
    });
    return NextResponse.json({ ok: false, error: "missing ANTHROPIC_API_KEY" });
  }

  try {
    // (b) research + build the sample site
    const research = await researchAndBuild({
      businessName: demo.businessName,
      city: demo.city,
      industry: demo.industry,
      currentWebsite: demo.currentWebsite,
    });

    // (c) build a subdomain label
    const label = slugifyLabel(demo.businessName);

    // (d) deploy to Plesk — on failure, record DeployFailed but keep going
    let liveUrl: string | null = null;
    let deployFailed = false;
    try {
      liveUrl = await deploySubdomain(label, research.html);
    } catch (err) {
      deployFailed = true;
      console.error(`[demo ${id}] deploy failed:`, err);
    }

    // (e) draft the outreach email (with the real live URL if we have one)
    const draft = await draftOutreachEmail({
      businessName: demo.businessName,
      city: demo.city,
      researchSummary: research.researchSummary,
      liveUrl: liveUrl || "",
    });

    // (f) save everything
    await prisma.demo.update({
      where: { id },
      data: {
        subdomainLabel: label,
        liveUrl,
        researchSummary: research.researchSummary,
        foundExistingSite: research.foundExistingSite,
        emailSubject: draft.subject,
        emailBody: draft.body,
        status: deployFailed ? "DeployFailed" : "Ready",
      },
    });

    await audit({
      actorId: demo.createdById,
      action: "update",
      entityType: "Demo",
      entityId: id,
      summary: deployFailed
        ? `Demo for ${demo.businessName} built but deploy failed`
        : `Demo for ${demo.businessName} ready at ${liveUrl}`,
    });

    return NextResponse.json({ ok: true, status: deployFailed ? "DeployFailed" : "Ready" });
  } catch (err) {
    console.error(`[demo ${id}] error:`, err);
    await prisma.demo.update({
      where: { id },
      data: {
        status: "Error",
        researchSummary:
          (await prisma.demo.findUnique({ where: { id } }))?.researchSummary ||
          `Generation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      },
    });
    return NextResponse.json({ ok: false, error: "generation failed" });
  }
}
