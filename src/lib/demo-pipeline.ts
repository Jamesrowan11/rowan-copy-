import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { researchAndBuild, draftOutreachEmail, slugifyLabel } from "@/lib/leadgen";
import { deploySubdomain } from "@/lib/deploy";

export type DemoRunResult = { ok: boolean; status: string; error?: string };

/**
 * Runs the full Lead Generator pipeline for a Demo IN-PROCESS:
 *   research (claude-sonnet-4-6 + web search) -> build HTML -> deploy via
 *   `plesk bin subdomain` -> draft outreach email (claude-haiku-4-5) -> save.
 *
 * Designed to be invoked fire-and-forget from a server action — it owns the
 * Demo's status transitions and never throws (it records "Error"/"DeployFailed"
 * itself), so a rejection can't crash the caller. Returns the final outcome for
 * callers that want it (e.g. the run route).
 *
 * This replaces the old internal HTTP self-call, which fails under Phusion
 * Passenger (no TCP port to connect to → ECONNREFUSED on 127.0.0.1:3000).
 */
export async function runDemoPipeline(demoId: string): Promise<DemoRunResult> {
  const demo = await prisma.demo.findUnique({ where: { id: demoId } });
  if (!demo) return { ok: false, status: "Error", error: "Demo not found." };

  // (a) mark Building
  await prisma.demo.update({ where: { id: demoId }, data: { status: "Building" } });

  if (!process.env.ANTHROPIC_API_KEY) {
    await prisma.demo.update({
      where: { id: demoId },
      data: { status: "Error", researchSummary: "ANTHROPIC_API_KEY is not set on the server." },
    });
    return { ok: false, status: "Error", error: "missing ANTHROPIC_API_KEY" };
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
      console.error(`[demo ${demoId}] deploy failed:`, err);
    }

    // (e) draft the outreach email (with the real live URL if we have one)
    const draft = await draftOutreachEmail({
      businessName: demo.businessName,
      city: demo.city,
      researchSummary: research.researchSummary,
      liveUrl: liveUrl || "",
    });

    // (f) save everything
    const status = deployFailed ? "DeployFailed" : "Ready";
    await prisma.demo.update({
      where: { id: demoId },
      data: {
        subdomainLabel: label,
        liveUrl,
        researchSummary: research.researchSummary,
        foundExistingSite: research.foundExistingSite,
        emailSubject: draft.subject,
        emailBody: draft.body,
        status,
      },
    });

    await audit({
      actorId: demo.createdById,
      action: "update",
      entityType: "Demo",
      entityId: demoId,
      summary: deployFailed
        ? `Demo for ${demo.businessName} built but deploy failed`
        : `Demo for ${demo.businessName} ready at ${liveUrl}`,
    });

    return { ok: !deployFailed, status };
  } catch (err) {
    console.error(`[demo ${demoId}] error:`, err);
    await prisma.demo.update({
      where: { id: demoId },
      data: {
        status: "Error",
        researchSummary:
          demo.researchSummary ||
          `Generation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      },
    });
    return { ok: false, status: "Error", error: "generation failed" };
  }
}
