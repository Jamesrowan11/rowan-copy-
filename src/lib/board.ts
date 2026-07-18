import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { searchPlaces, placesConfigured } from "@/lib/places";
import { scoreLead } from "@/lib/lead-scoring";
import { runDemoPipeline } from "@/lib/demo-pipeline";
import { sendEmail } from "@/lib/email";
import { findContactEmail } from "@/lib/email-scout";

// ---------------------------------------------------------------------------
// The AI Board of Directors: autonomous agents that run the studio's growth
// loop on a schedule — find leads, build demo sites, send outreach — then a
// Chairman writes the executive summary. Every director is individually
// toggleable and capped; the whole board has a master kill switch and a
// dry-run mode where nothing external happens but the full plan is reported.
// ---------------------------------------------------------------------------

export type BoardConfig = {
  enabled: boolean;           // master kill switch
  mode: "dry-run" | "live";
  growth: { enabled: boolean; city: string; categories: string[]; dailyLeads: number };
  production: { enabled: boolean; dailyBuilds: number };
  outreach: { enabled: boolean; dailySends: number };
};

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  enabled: false,
  mode: "dry-run",
  growth: { enabled: true, city: "Columbia, MD", categories: ["plumber", "hvac", "landscaping", "cleaning service", "electrician", "roofing", "auto repair"], dailyLeads: 10 },
  production: { enabled: true, dailyBuilds: 3 },
  outreach: { enabled: true, dailySends: 5 },
};

const CONFIG_KEY = "board.config";

export async function getBoardConfig(): Promise<BoardConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: CONFIG_KEY } });
  if (!row) return DEFAULT_BOARD_CONFIG;
  try {
    const parsed = JSON.parse(row.value) as Partial<BoardConfig>;
    return {
      ...DEFAULT_BOARD_CONFIG,
      ...parsed,
      growth: { ...DEFAULT_BOARD_CONFIG.growth, ...(parsed.growth ?? {}) },
      production: { ...DEFAULT_BOARD_CONFIG.production, ...(parsed.production ?? {}) },
      outreach: { ...DEFAULT_BOARD_CONFIG.outreach, ...(parsed.outreach ?? {}) },
    };
  } catch {
    return DEFAULT_BOARD_CONFIG;
  }
}

export async function saveBoardConfig(config: BoardConfig): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: JSON.stringify(config) },
    update: { value: JSON.stringify(config) },
  });
}

export type DirectorSection = {
  director: string;
  ran: boolean;
  actions: number;
  lines: string[]; // human-readable log of what happened / would happen
};
export type BoardReport = {
  mode: "dry-run" | "live";
  sections: DirectorSection[];
  chairman: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Hard ceilings so a mistyped config can never run away with money.
const MAX_LEADS = 25;
const MAX_BUILDS = 10;
const MAX_SENDS = 20;

function clamp(n: number, max: number): number {
  return Math.min(Math.max(0, Math.floor(n) || 0), max);
}

async function firstAdminId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", active: true }, select: { id: true } });
  return admin?.id ?? null;
}

// --- Growth Director: find new leads via Google Places -----------------------
async function runGrowth(cfg: BoardConfig, live: boolean, adminId: string): Promise<DirectorSection> {
  const s: DirectorSection = { director: "Growth", ran: true, actions: 0, lines: [] };
  if (!placesConfigured()) {
    s.lines.push("Skipped: GOOGLE_PLACES_API_KEY is not configured.");
    return s;
  }
  const cap = clamp(cfg.growth.dailyLeads, MAX_LEADS);
  if (cap === 0) { s.lines.push("Skipped: daily lead cap is 0."); return s; }

  // Rotate through the category list by day of month so coverage varies.
  const cats = cfg.growth.categories.filter(Boolean);
  if (cats.length === 0) { s.lines.push("Skipped: no categories configured."); return s; }
  const category = cats[new Date().getDate() % cats.length];
  s.lines.push(`Searching "${category}" near ${cfg.growth.city} (cap ${cap}).`);

  let found;
  try {
    found = await searchPlaces(cfg.growth.city, category, cap);
  } catch (err) {
    s.lines.push(`Search failed: ${err instanceof Error ? err.message : "error"}`);
    return s;
  }

  const existing = await prisma.demo.findMany({ select: { businessName: true, city: true } });
  const seen = new Set(existing.map((d) => `${d.businessName.trim().toLowerCase()}|${(d.city || "").trim().toLowerCase()}`));
  const fresh = found.filter((l) => !seen.has(`${l.businessName.trim().toLowerCase()}|${cfg.growth.city.trim().toLowerCase()}`));
  s.lines.push(`Found ${found.length}, ${fresh.length} new after de-dupe.`);

  for (const lead of fresh) {
    const scored = scoreLead({
      businessName: lead.businessName,
      city: cfg.growth.city,
      industry: category,
      email: "",
      currentWebsite: lead.currentWebsite || null,
    });
    if (live) {
      await prisma.demo.create({
        data: {
          businessName: lead.businessName,
          city: cfg.growth.city,
          industry: category,
          email: "",
          currentWebsite: lead.currentWebsite || null,
          status: "Imported",
          score: scored.score,
          tier: scored.tier,
          createdById: adminId,
        },
      });
    }
    s.actions++;
    s.lines.push(`${live ? "Imported" : "Would import"}: ${lead.businessName} (${scored.tier}, score ${scored.score}${lead.currentWebsite ? "" : ", no website"}).`);
  }
  return s;
}

// --- Production Director: build demo sites for the best leads ----------------
async function runProduction(cfg: BoardConfig, live: boolean): Promise<DirectorSection> {
  const s: DirectorSection = { director: "Production", ran: true, actions: 0, lines: [] };
  const cap = clamp(cfg.production.dailyBuilds, MAX_BUILDS);
  if (cap === 0) { s.lines.push("Skipped: daily build cap is 0."); return s; }

  const queue = await prisma.demo.findMany({
    where: { status: { in: ["Imported", "Queued"] }, liveUrl: null },
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    take: cap,
  });
  if (queue.length === 0) { s.lines.push("Nothing to build — the queue is empty."); return s; }
  s.lines.push(`Building top ${queue.length} lead${queue.length === 1 ? "" : "s"} by score.`);

  for (const demo of queue) {
    if (!live) {
      s.actions++;
      s.lines.push(`Would build a demo site for ${demo.businessName} (score ${demo.score ?? "—"}).`);
      continue;
    }
    const result = await runDemoPipeline(demo.id); // owns its own status transitions; never throws
    s.actions++;
    s.lines.push(
      result.ok
        ? `Built + deployed ${demo.businessName} → status ${result.status}.`
        : `Build for ${demo.businessName} ended ${result.status}${result.error ? ` (${result.error})` : ""}.`,
    );
  }
  return s;
}

// --- Outreach Director: send the drafted email for Ready demos ---------------
async function runOutreach(cfg: BoardConfig, live: boolean, adminId: string): Promise<DirectorSection> {
  const s: DirectorSection = { director: "Outreach", ran: true, actions: 0, lines: [] };
  const cap = clamp(cfg.outreach.dailySends, MAX_SENDS);
  if (cap === 0) { s.lines.push("Skipped: daily send cap is 0."); return s; }

  const ready = await prisma.demo.findMany({
    where: {
      status: "Ready",
      outreachSentAt: null,
      emailSubject: { not: null },
      emailBody: { not: null },
    },
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    take: cap * 3, // headroom: some will lack a usable email address
  });

  // Scout missing addresses from the lead's own website so outreach never
  // stalls waiting for a human (bounded per run to keep runtime predictable).
  let scouted = 0;
  for (const demo of ready) {
    if (EMAIL_RE.test(demo.email) || !demo.currentWebsite || scouted >= 10) continue;
    scouted++;
    const email = await findContactEmail(demo.currentWebsite);
    if (email) {
      demo.email = email;
      if (live) await prisma.demo.update({ where: { id: demo.id }, data: { email } });
      s.lines.push(`${live ? "Found" : "Would save"} contact email for ${demo.businessName}: ${email} (from their website).`);
    }
  }

  const sendable = ready.filter((d) => EMAIL_RE.test(d.email)).slice(0, cap);
  const missingEmail = ready.filter((d) => !EMAIL_RE.test(d.email)).length;
  if (missingEmail > 0) {
    s.lines.push(`${missingEmail} ready demo${missingEmail === 1 ? "" : "s"} still lack an email (no address published on their site) — add one in the Lead generator to unlock them.`);
  }
  if (sendable.length === 0) { s.lines.push("No ready demos with a usable email address."); return s; }

  for (const demo of sendable) {
    if (!live) {
      s.actions++;
      s.lines.push(`Would email ${demo.businessName} <${demo.email}>: "${demo.emailSubject}".`);
      continue;
    }
    try {
      await sendEmail({
        to: [demo.email],
        subject: demo.emailSubject as string,
        text: demo.emailBody as string,
        senderUserId: adminId,
      });
      await prisma.demo.update({ where: { id: demo.id }, data: { outreachSentAt: new Date() } });
      s.actions++;
      s.lines.push(`Sent outreach to ${demo.businessName} <${demo.email}>.`);
    } catch (err) {
      s.lines.push(`Send to ${demo.email} failed: ${err instanceof Error ? err.message : "error"}.`);
    }
  }
  return s;
}

// --- Chairman: executive summary (AI, with deterministic fallback) -----------
async function chairmanSummary(sections: DirectorSection[], mode: string): Promise<string> {
  const totals = sections.map((s) => `${s.director}: ${s.actions} action(s)\n${s.lines.map((l) => `- ${l}`).join("\n")}`).join("\n\n");
  const fallback = `Board ran in ${mode} mode. ${sections.map((s) => `${s.director} took ${s.actions} action(s)`).join("; ")}.`;
  if (!process.env.ANTHROPIC_API_KEY) return fallback;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system:
        "You are the chairman of a small web studio's AI board. Given tonight's director logs, write a crisp 3-5 sentence executive summary for the owner: what was accomplished, anything that needs a human, and the single most useful next step. Plain text, no preamble.",
      messages: [{ role: "user", content: `Mode: ${mode}\n\n${totals}` }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

/** Run the full board once. Returns the saved BoardRun id and report. */
export async function runBoard(trigger: "schedule" | "manual"): Promise<{ id: string; report: BoardReport } | { skipped: string }> {
  const cfg = await getBoardConfig();
  if (!cfg.enabled) return { skipped: "The board is switched off (master kill switch)." };

  // Concurrency guard: one run at a time (a stuck run older than 30 min doesn't block).
  const inFlight = await prisma.boardRun.findFirst({
    where: { finishedAt: null, startedAt: { gt: new Date(Date.now() - 30 * 60 * 1000) } },
  });
  if (inFlight) return { skipped: "A board run is already in progress." };

  const adminId = await firstAdminId();
  if (!adminId) return { skipped: "No active admin account found." };

  const live = cfg.mode === "live";
  const run = await prisma.boardRun.create({ data: { mode: cfg.mode, trigger, report: "{}" } });

  const sections: DirectorSection[] = [];
  if (cfg.growth.enabled) sections.push(await runGrowth(cfg, live, adminId));
  if (cfg.production.enabled) sections.push(await runProduction(cfg, live));
  if (cfg.outreach.enabled) sections.push(await runOutreach(cfg, live, adminId));

  const chairman = await chairmanSummary(sections, cfg.mode);
  const report: BoardReport = { mode: cfg.mode, sections, chairman };
  const actions = sections.reduce((n, s) => n + s.actions, 0);

  await prisma.boardRun.update({
    where: { id: run.id },
    data: { report: JSON.stringify(report), actions, finishedAt: new Date() },
  });
  await audit({
    actorId: adminId,
    action: "create",
    entityType: "BoardRun",
    entityId: run.id,
    summary: `AI board ran (${cfg.mode}, ${trigger}): ${actions} action(s)`,
  });
  return { id: run.id, report };
}
