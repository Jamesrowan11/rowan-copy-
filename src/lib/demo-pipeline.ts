import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  researchAndBuild,
  draftOutreachEmail,
  slugifyLabel,
  reviseSiteHtml,
} from "@/lib/leadgen";
import { deploySubdomain, redeploySubdomain, readDeployedHtml } from "@/lib/deploy";
import { scoreLead } from "@/lib/lead-scoring";

export type DemoRunResult = { ok: boolean; status: string; error?: string };

/**
 * Extract a SAFE, log-friendly string from any thrown value. Only the message
 * is returned — never the raw error object (some SDK errors carry request
 * headers/credentials) and never anything env-related. This guarantees the
 * pipeline's catch blocks can never log secrets or environment variables.
 */
export function safeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown error";
}

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
      // Log message only — never the raw error object or env.
      console.error(`[demo ${demoId}] deploy failed: ${safeError(err)}`);
    }

    // (e) draft the outreach email (with the real live URL if we have one)
    const draft = await draftOutreachEmail({
      businessName: demo.businessName,
      city: demo.city,
      researchSummary: research.researchSummary,
      liveUrl: liveUrl || "",
    });

    // (f) re-score now that research has run, then save everything
    const scored = scoreLead({
      businessName: demo.businessName,
      city: demo.city,
      industry: demo.industry,
      email: demo.email,
      currentWebsite: demo.currentWebsite,
      foundExistingSite: research.foundExistingSite,
      researchSummary: research.researchSummary,
    });
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
        html: research.html, // store the source HTML so it can be edited later
        score: scored.score,
        tier: scored.tier,
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
    // Log message only — never the raw error object or env.
    const message = safeError(err);
    console.error(`[demo ${demoId}] error: ${message}`);
    await prisma.demo.update({
      where: { id: demoId },
      data: {
        status: "Error",
        researchSummary: demo.researchSummary || `Generation failed: ${message}`,
      },
    });
    return { ok: false, status: "Error", error: "generation failed" };
  }
}

/**
 * Revise a Ready demo's site per an instruction and redeploy to the SAME
 * subdomain (live URL unchanged). Runs in-process; owns the Demo's status
 * transitions and never throws. On any failure it sets "EditFailed" and leaves
 * the previous live site and stored HTML intact.
 */
export async function runDemoEdit(
  demoId: string,
  instruction: string,
): Promise<DemoRunResult> {
  const demo = await prisma.demo.findUnique({ where: { id: demoId } });
  if (!demo) return { ok: false, status: "Error", error: "Demo not found." };

  // Record the attempt + set EditFailed without touching the live site.
  const markFailed = async (error: string): Promise<DemoRunResult> => {
    await prisma.demo.update({
      where: { id: demoId },
      data: { status: "EditFailed", lastEditInstruction: instruction, lastEditedAt: new Date() },
    });
    return { ok: false, status: "EditFailed", error };
  };

  if (!demo.subdomainLabel) return markFailed("No deployed site to edit.");
  if (!process.env.ANTHROPIC_API_KEY) return markFailed("ANTHROPIC_API_KEY is not set on the server.");

  // Current HTML: stored on the Demo, else read the live index.html as a fallback
  // (covers demos generated before the html field existed).
  const currentHtml = demo.html || (await readDeployedHtml(demo.subdomainLabel)) || null;
  if (!currentHtml) return markFailed("No current HTML to revise.");

  try {
    // 1. Revise (model call). If this throws, nothing on disk is touched.
    const revised = await reviseSiteHtml(currentHtml, instruction);

    // 2. Redeploy to the SAME subdomain (atomic write; never creates a new one).
    await redeploySubdomain(demo.subdomainLabel, revised);

    // 3. Save the new HTML, edit history, and flip back to Ready.
    await prisma.demo.update({
      where: { id: demoId },
      data: {
        html: revised,
        status: "Ready",
        lastEditInstruction: instruction,
        lastEditedAt: new Date(),
      },
    });

    await audit({
      actorId: demo.createdById,
      action: "update",
      entityType: "Demo",
      entityId: demoId,
      summary: `AI-edited demo "${demo.businessName}" and redeployed to ${demo.liveUrl}: "${instruction.slice(0, 140)}"`,
    });

    return { ok: true, status: "Ready" };
  } catch (err) {
    // Live site + stored HTML untouched. Record the attempt and the failed state.
    console.error(`[demo ${demoId}] edit failed: ${safeError(err)}`);
    return markFailed("edit failed");
  }
}
