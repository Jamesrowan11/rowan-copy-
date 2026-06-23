"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { teardownSubdomain } from "@/lib/deploy";
import { runDemoPipeline, safeError } from "@/lib/demo-pipeline";
import { parseCsv, guessMapping, IMPORT_FIELDS, type ImportField } from "@/lib/csv";
import { scoreLead } from "@/lib/lead-scoring";
import { searchPlaces, placesConfigured, PLACES_HARD_CAP } from "@/lib/places";
import crypto from "crypto";

type Result = { ok: boolean; error?: string };
type ConvertResult = Result & { projectId?: string };
const OK: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

/**
 * Run the demo pipeline IN-PROCESS as a background task (do not await). Phusion
 * Passenger doesn't expose a TCP port, so the old internal HTTP self-call was
 * refused (ECONNREFUSED) — running the work directly avoids any self-call. The
 * pipeline owns the Demo's status transitions and never throws; the extra
 * .catch is belt-and-suspenders so a rejection can never crash the action.
 */
function startDemoPipeline(demoId: string): void {
  void runDemoPipeline(demoId).catch((err) => {
    // Log message only — never the raw error object or env.
    console.error(`[leadgen] pipeline crashed for demo ${demoId}: ${safeError(err)}`);
    prisma.demo
      .update({ where: { id: demoId }, data: { status: "Error" } })
      .catch(() => {});
  });
}

const demoSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required.").max(160),
  city: z.string().trim().min(1, "City is required.").max(120),
  industry: z.string().trim().min(1, "Industry is required.").max(120),
  email: z.string().trim().email("Enter a valid email."),
  currentWebsite: z.string().trim().max(300).optional(),
});

export async function createDemo(_prev: Result, formData: FormData): Promise<Result> {
  const me = await requireRoleAction("ADMIN", "EMPLOYEE");
  const parsed = demoSchema.safeParse({
    businessName: formData.get("businessName"),
    city: formData.get("city"),
    industry: formData.get("industry"),
    email: formData.get("email"),
    currentWebsite: formData.get("currentWebsite") || undefined,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message || "Please check the fields.");
  }
  const d = parsed.data;

  // Score from the form details up front (re-scored after research runs).
  const scored = scoreLead({
    businessName: d.businessName,
    city: d.city,
    industry: d.industry,
    email: d.email,
    currentWebsite: d.currentWebsite || null,
  });

  const demo = await prisma.demo.create({
    data: {
      businessName: d.businessName,
      city: d.city,
      industry: d.industry,
      email: d.email.toLowerCase(),
      currentWebsite: d.currentWebsite || null,
      status: "Queued",
      score: scored.score,
      tier: scored.tier,
      createdById: me.id,
    },
  });

  await audit({
    actorId: me.id,
    action: "create",
    entityType: "Demo",
    entityId: demo.id,
    summary: `Queued lead demo for ${d.businessName} (${d.city})`,
  });

  // Kick off background processing WITHOUT blocking the response (research +
  // deploy can take 30-90s). Runs in-process — no self-HTTP-call (which Passenger
  // refuses). The action returns immediately; the demo finishes in the background.
  startDemoPipeline(demo.id);

  revalidatePath("/admin/leads");
  revalidatePath("/staff/leads");
  return OK;
}

// --------------------------------------------------------------------------
// CSV mass-import
// --------------------------------------------------------------------------

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB

export type CsvHeadersResult = {
  ok: boolean;
  error?: string;
  headers?: string[];
  dataRowCount?: number;
  guesses?: Record<ImportField, string>;
};

/** Parse an uploaded CSV's header row and pre-guess the column mapping. */
export async function parseCsvHeaders(
  _prev: CsvHeadersResult,
  formData: FormData,
): Promise<CsvHeadersResult> {
  await requireRoleAction("ADMIN", "EMPLOYEE");
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "Choose a CSV file." };
  if (file.size > MAX_CSV_BYTES) return { ok: false, error: "File is too large (max 5 MB)." };

  let rows: string[][];
  try {
    rows = parseCsv(await file.text());
  } catch {
    return { ok: false, error: "Could not read that file as CSV." };
  }
  if (rows.length < 1) return { ok: false, error: "The CSV appears to be empty." };

  const headers = rows[0].map((h) => h.trim());
  if (headers.every((h) => h === "")) {
    return { ok: false, error: "No header row detected." };
  }
  return {
    ok: true,
    headers,
    dataRowCount: rows.length - 1,
    guesses: guessMapping(headers),
  };
}

export type CsvImportResult = {
  ok: boolean;
  error?: string;
  imported?: number;
  skippedDuplicate?: number;
  skippedNoName?: number;
};

/** Import mapped CSV rows as draft Demos (status "Imported"). Deduped, no generation. */
export async function importCsv(
  _prev: CsvImportResult,
  formData: FormData,
): Promise<CsvImportResult> {
  const me = await requireRoleAction("ADMIN", "EMPLOYEE");
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "Choose a CSV file." };
  if (file.size > MAX_CSV_BYTES) return { ok: false, error: "File is too large (max 5 MB)." };

  // Column mapping: field -> header name.
  const map = {} as Record<ImportField, string>;
  for (const f of IMPORT_FIELDS) map[f] = String(formData.get(`map_${f}`) || "");
  if (!map.businessName) return { ok: false, error: "Map the Business name column." };

  let rows: string[][];
  try {
    rows = parseCsv(await file.text());
  } catch {
    return { ok: false, error: "Could not read that file as CSV." };
  }
  if (rows.length < 2) return { ok: false, error: "No data rows to import." };

  const headers = rows[0].map((h) => h.trim());
  const colIdx = {} as Record<ImportField, number>;
  for (const f of IMPORT_FIELDS) colIdx[f] = map[f] ? headers.indexOf(map[f]) : -1;

  // Dedupe against existing demos (businessName + city, case-insensitive) AND
  // against rows already seen within this file.
  const existing = await prisma.demo.findMany({ select: { businessName: true, city: true } });
  const seen = new Set(
    existing.map((d) => `${d.businessName.trim().toLowerCase()}|${(d.city || "").trim().toLowerCase()}`),
  );

  const get = (row: string[], ix: number) =>
    ix >= 0 && ix < row.length ? String(row[ix]).trim() : "";

  let skippedNoName = 0;
  let skippedDuplicate = 0;
  const toCreate: {
    businessName: string;
    city: string;
    industry: string;
    email: string;
    currentWebsite: string | null;
    status: string;
    score: number;
    tier: string;
    createdById: string;
  }[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const businessName = get(row, colIdx.businessName);
    if (!businessName) {
      skippedNoName++;
      continue;
    }
    const city = get(row, colIdx.city);
    const key = `${businessName.toLowerCase()}|${city.toLowerCase()}`;
    if (seen.has(key)) {
      skippedDuplicate++;
      continue;
    }
    seen.add(key);
    const industry = get(row, colIdx.industry);
    const email = get(row, colIdx.email).toLowerCase();
    const currentWebsite = get(row, colIdx.currentWebsite) || null;
    const scored = scoreLead({ businessName, city, industry, email, currentWebsite });
    toCreate.push({
      businessName,
      city,
      industry,
      email,
      currentWebsite,
      status: "Imported",
      score: scored.score,
      tier: scored.tier,
      createdById: me.id,
    });
  }

  if (toCreate.length) await prisma.demo.createMany({ data: toCreate });

  await audit({
    actorId: me.id,
    action: "create",
    entityType: "Demo",
    summary: `Imported ${toCreate.length} lead(s) from CSV (skipped ${skippedDuplicate} duplicate, ${skippedNoName} without a name)`,
  });

  revalidatePath("/admin/leads");
  revalidatePath("/staff/leads");
  return { ok: true, imported: toCreate.length, skippedDuplicate, skippedNoName };
}

// --------------------------------------------------------------------------
// Google Places lead-finder (ADMIN only — it spends money)
// --------------------------------------------------------------------------

const DEFAULT_DAILY_SEARCH_LIMIT = 50;
const DAILY_LIMIT_KEY = "placesSearch.dailyLimit";

function todayKey(): string {
  return `placesSearch.count.${new Date().toISOString().slice(0, 10)}`;
}

async function getDailyLimit(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: DAILY_LIMIT_KEY } });
  const n = s ? parseInt(s.value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_SEARCH_LIMIT;
}

async function getDailyUsed(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: todayKey() } });
  const n = s ? parseInt(s.value, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export type FoundLeadView = {
  businessName: string;
  city: string;
  industry: string;
  currentWebsite: string;
  phone: string;
  address: string;
  score: number;
  tier: string;
};

export type FindLeadsResult = {
  ok: boolean;
  error?: string;
  leads?: FoundLeadView[];
  count?: number;
  searchesRemaining?: number;
};

const findSchema = z.object({
  city: z.string().trim().min(1, "Enter a city or area.").max(120),
  category: z.string().trim().min(1, "Enter a business category.").max(120),
  max: z.coerce.number().int().min(1).max(PLACES_HARD_CAP),
});

/** Find local businesses via Google Places (New) Text Search. Preview only — does NOT save. */
export async function findLeads(
  _prev: FindLeadsResult,
  formData: FormData,
): Promise<FindLeadsResult> {
  const admin = await requireRoleAction("ADMIN"); // ADMIN only — it spends money

  const parsed = findSchema.safeParse({
    city: formData.get("city"),
    category: formData.get("category"),
    max: formData.get("max"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Check the fields." };
  }
  const { city, category, max } = parsed.data;

  if (!placesConfigured()) {
    return { ok: false, error: "Lead-finder isn't configured (no GOOGLE_PLACES_API_KEY on the server)." };
  }

  // HARD per-day cap — block BEFORE calling (and paying) Google.
  const limit = await getDailyLimit();
  const used = await getDailyUsed();
  if (used >= limit) {
    return { ok: false, error: `Daily search limit reached (${limit}/day). Try again tomorrow or raise the limit.` };
  }

  let found;
  try {
    // Hard cap on results enforced inside searchPlaces (min(max, 20), one call).
    found = await searchPlaces(city, category, Math.min(max, PLACES_HARD_CAP));
  } catch (err) {
    console.error("[findLeads] places error:", safeError(err));
    return { ok: false, error: "Couldn't reach Google Places. Check the API key and try again." };
  }

  // Count the billable call (only after it succeeded).
  await prisma.appSetting.upsert({
    where: { key: todayKey() },
    create: { key: todayKey(), value: "1" },
    update: { value: String(used + 1) },
  });

  await audit({
    actorId: admin.id,
    action: "use",
    entityType: "Demo",
    summary: `Places search: "${category}" in "${city}" (${found.length} result(s), max ${max})`,
  });

  const leads: FoundLeadView[] = found.map((f) => {
    const s = scoreLead({
      businessName: f.businessName,
      city,
      industry: category,
      email: "",
      currentWebsite: f.currentWebsite || null,
    });
    return {
      businessName: f.businessName,
      city,
      industry: category,
      currentWebsite: f.currentWebsite,
      phone: f.phone,
      address: f.address,
      score: s.score,
      tier: s.tier,
    };
  });

  return {
    ok: true,
    leads,
    count: leads.length,
    searchesRemaining: Math.max(0, limit - (used + 1)),
  };
}

const importFoundSchema = z.object({
  city: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(120),
  leads: z
    .array(
      z.object({
        businessName: z.string().trim().min(1).max(200),
        currentWebsite: z.string().trim().max(500).optional().default(""),
        phone: z.string().trim().max(80).optional().default(""),
        address: z.string().trim().max(400).optional().default(""),
      }),
    )
    .min(1)
    .max(PLACES_HARD_CAP), // hard cap on what can be imported in one go
});

/** Save previewed found leads as draft Demos (status "Imported"), deduped + scored. */
export async function importFoundLeads(
  _prev: CsvImportResult,
  formData: FormData,
): Promise<CsvImportResult> {
  const me = await requireRoleAction("ADMIN");

  let payload: unknown;
  try {
    payload = {
      city: formData.get("city"),
      category: formData.get("category"),
      leads: JSON.parse(String(formData.get("leads") || "[]")),
    };
  } catch {
    return { ok: false, error: "Could not read the found leads." };
  }
  const parsed = importFoundSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "No valid leads to import." };
  const { city, category, leads } = parsed.data;

  const existing = await prisma.demo.findMany({ select: { businessName: true, city: true } });
  const seen = new Set(
    existing.map((d) => `${d.businessName.trim().toLowerCase()}|${(d.city || "").trim().toLowerCase()}`),
  );

  let skippedDuplicate = 0;
  const toCreate: {
    businessName: string;
    city: string;
    industry: string;
    email: string;
    currentWebsite: string | null;
    status: string;
    score: number;
    tier: string;
    createdById: string;
  }[] = [];

  for (const lead of leads) {
    const key = `${lead.businessName.toLowerCase()}|${city.toLowerCase()}`;
    if (seen.has(key)) {
      skippedDuplicate++;
      continue;
    }
    seen.add(key);
    const currentWebsite = lead.currentWebsite || null;
    const scored = scoreLead({
      businessName: lead.businessName,
      city,
      industry: category,
      email: "",
      currentWebsite,
    });
    toCreate.push({
      businessName: lead.businessName,
      city,
      industry: category,
      email: "",
      currentWebsite,
      status: "Imported",
      score: scored.score,
      tier: scored.tier,
      createdById: me.id,
    });
  }

  if (toCreate.length) await prisma.demo.createMany({ data: toCreate });

  await audit({
    actorId: me.id,
    action: "create",
    entityType: "Demo",
    summary: `Imported ${toCreate.length} lead(s) from Google Places "${category}" in "${city}" (skipped ${skippedDuplicate} duplicate)`,
  });

  revalidatePath("/admin/leads");
  return { ok: true, imported: toCreate.length, skippedDuplicate, skippedNoName: 0 };
}

// --------------------------------------------------------------------------
// Scoring backfill
// --------------------------------------------------------------------------

/** Backfill score + tier for any demos that don't have a score yet (admin-only). */
export async function scoreAllUnscored(): Promise<Result & { scored?: number }> {
  const admin = await requireRoleAction("ADMIN");
  const unscored = await prisma.demo.findMany({ where: { score: null } });
  let scoredCount = 0;
  for (const demo of unscored) {
    const scored = scoreLead({
      businessName: demo.businessName,
      city: demo.city,
      industry: demo.industry,
      email: demo.email,
      currentWebsite: demo.currentWebsite,
      foundExistingSite: demo.foundExistingSite,
      researchSummary: demo.researchSummary,
    });
    await prisma.demo.update({
      where: { id: demo.id },
      data: { score: scored.score, tier: scored.tier },
    });
    scoredCount++;
  }
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "Demo",
    summary: `Backfilled lead scores for ${scoredCount} unscored demo(s)`,
  });
  revalidatePath("/admin/leads");
  revalidatePath("/staff/leads");
  return { ok: true, scored: scoredCount };
}

// --------------------------------------------------------------------------
// Generation (shared in-process pipeline)
// --------------------------------------------------------------------------

/** Per-row "Generate demo": fire the pipeline in the background (status -> Building -> Ready). */
export async function generateDemo(id: string): Promise<Result> {
  await requireRoleAction("ADMIN", "EMPLOYEE");
  const demo = await prisma.demo.findUnique({ where: { id } });
  if (!demo) return fail("Demo not found.");
  // Mark Queued immediately so the table starts polling, then run in background.
  await prisma.demo.update({ where: { id }, data: { status: "Queued" } });
  startDemoPipeline(id);
  revalidatePath("/admin/leads");
  revalidatePath("/staff/leads");
  return OK;
}

/**
 * "Generate all imported": awaits the FULL pipeline for one demo so the client
 * can drive a sequential loop (one at a time, with a delay) to control API cost
 * and avoid rate limits. Returns the final status.
 */
export async function generateDemoNow(
  id: string,
): Promise<{ ok: boolean; status: string; error?: string }> {
  await requireRoleAction("ADMIN", "EMPLOYEE");
  const demo = await prisma.demo.findUnique({ where: { id } });
  if (!demo) return { ok: false, status: "Error", error: "Demo not found." };
  const res = await runDemoPipeline(id);
  revalidatePath("/admin/leads");
  revalidatePath("/staff/leads");
  return res;
}

export async function deleteDemo(id: string): Promise<Result> {
  const me = await requireRoleAction("ADMIN", "EMPLOYEE");
  const demo = await prisma.demo.findUnique({ where: { id } });
  if (!demo) return fail("Demo not found.");

  // Tear down the live subdomain so dead demos don't pile up (best-effort).
  if (demo.subdomainLabel) {
    try {
      await teardownSubdomain(demo.subdomainLabel);
    } catch (err) {
      // Log message only — never the raw error object or env.
      console.error(`[deleteDemo] teardown failed for ${demo.subdomainLabel}: ${safeError(err)}`);
    }
  }

  await prisma.demo.delete({ where: { id } });
  await audit({
    actorId: me.id,
    action: "delete",
    entityType: "Demo",
    entityId: id,
    summary: `Deleted lead demo for ${demo.businessName} (tore down ${demo.subdomainLabel ?? "—"})`,
  });

  revalidatePath("/admin/leads");
  revalidatePath("/staff/leads");
  return OK;
}

// Convert a demo into a Client + Project, mirroring the Inquiry -> Project flow.
export async function convertDemo(id: string): Promise<ConvertResult> {
  const me = await requireRoleAction("ADMIN", "EMPLOYEE");
  const demo = await prisma.demo.findUnique({ where: { id } });
  if (!demo) return fail("Demo not found.");
  if (demo.convertedProjectId) return fail("This demo is already converted.");

  const email = demo.email.toLowerCase();
  let client = await prisma.user.findUnique({ where: { email } });
  if (!client) {
    const tempPassword = crypto.randomBytes(6).toString("base64url");
    client = await prisma.user.create({
      data: {
        name: demo.businessName,
        email,
        role: "CLIENT",
        passwordHash: await hashPassword(tempPassword),
      },
    });
  }

  const scopeLines = [
    `Lead-generated sample site for ${demo.businessName} (${demo.city}).`,
    demo.liveUrl ? `Live sample: ${demo.liveUrl}` : null,
    demo.researchSummary ? `\nResearch notes:\n${demo.researchSummary}` : null,
  ].filter(Boolean);

  const project = await prisma.project.create({
    data: {
      title: `${demo.businessName} — Sample Site`,
      type: "Sample Site",
      scope: scopeLines.join("\n"),
      status: "In Progress",
      clientId: client.id,
      assigneeId: me.role === "EMPLOYEE" ? me.id : null,
    },
  });

  await prisma.demo.update({
    where: { id },
    data: { convertedProjectId: project.id },
  });

  await audit({
    actorId: me.id,
    action: "create",
    entityType: "Project",
    entityId: project.id,
    summary: `Converted lead demo ${demo.businessName} into a project`,
  });

  revalidatePath("/admin/leads");
  revalidatePath("/staff/leads");
  return { ok: true, projectId: project.id };
}
