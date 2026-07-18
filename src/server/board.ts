"use server";

import { revalidatePath } from "next/cache";
import { requireRoleAction } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { getBoardConfig, saveBoardConfig, runBoard, type BoardConfig } from "@/lib/board";

type Result = { ok: boolean; error?: string; info?: string };
const fail = (error: string): Result => ({ ok: false, error });

/** Save the board's configuration (admin only). */
export async function updateBoardConfig(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const current = await getBoardConfig();

  const num = (name: string, fallback: number) => {
    const n = parseInt(String(formData.get(name) ?? ""), 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const config: BoardConfig = {
    enabled: formData.get("enabled") === "on",
    mode: formData.get("mode") === "live" ? "live" : "dry-run",
    growth: {
      enabled: formData.get("growthEnabled") === "on",
      city: String(formData.get("growthCity") || current.growth.city).trim() || current.growth.city,
      categories: String(formData.get("growthCategories") || "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      dailyLeads: num("growthDailyLeads", current.growth.dailyLeads),
    },
    production: {
      enabled: formData.get("productionEnabled") === "on",
      dailyBuilds: num("productionDailyBuilds", current.production.dailyBuilds),
    },
    outreach: {
      enabled: formData.get("outreachEnabled") === "on",
      dailySends: num("outreachDailySends", current.outreach.dailySends),
    },
  };
  if (config.growth.categories.length === 0) config.growth.categories = current.growth.categories;

  await saveBoardConfig(config);
  await audit({
    actorId: admin.id,
    action: "update",
    entityType: "AppSetting",
    summary: `AI board config: ${config.enabled ? "ON" : "OFF"}, ${config.mode}`,
  });
  revalidatePath("/admin/board");
  return { ok: true, info: "Board settings saved." };
}

/** Kick off a board run right now (admin only). */
export async function runBoardNow(): Promise<Result> {
  await requireRoleAction("ADMIN");
  try {
    const result = await runBoard("manual");
    revalidatePath("/admin/board");
    if ("skipped" in result) return fail(result.skipped);
    return { ok: true, info: "Board run complete — report below." };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "The board run failed.");
  }
}
