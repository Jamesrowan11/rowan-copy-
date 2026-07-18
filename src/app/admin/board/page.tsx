import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState, fmtDateTime } from "@/components/portal/ui";
import { ActionForm } from "@/components/portal/ActionForm";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { getBoardConfig } from "@/lib/board";
import type { BoardReport } from "@/lib/board";
import { checkDeliverability } from "@/lib/deliverability";
import { updateBoardConfig, runBoardNow } from "@/server/board";

export const dynamic = "force-dynamic";

function parseReport(raw: string): BoardReport | null {
  try {
    const r = JSON.parse(raw) as BoardReport;
    return r && Array.isArray(r.sections) ? r : null;
  } catch {
    return null;
  }
}

export default async function AdminBoardPage() {
  await requireAdmin();
  const [config, runs, health] = await Promise.all([
    getBoardConfig(),
    prisma.boardRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    checkDeliverability(),
  ]);

  return (
    <>
      <PageHeader
        title="AI board"
        description="Autonomous directors that find leads, build demo sites, and send outreach on a schedule — then report back."
        action={
          <ConfirmButton
            action={runBoardNow}
            confirm={`Run the board now in ${config.mode.toUpperCase()} mode?`}
            className="btn-primary btn-sm"
          >
            Run board now
          </ConfirmButton>
        }
      />

      <div
        className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
          !config.enabled
            ? "border-navy-200 bg-navy-50 text-navy-600"
            : config.mode === "live"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {!config.enabled ? (
          <>The board is <strong>switched off</strong>. Nothing runs until you enable it below.</>
        ) : config.mode === "live" ? (
          <>The board is <strong>LIVE</strong> — it imports leads, builds demo sites, and sends real outreach emails within the caps below.</>
        ) : (
          <>The board is in <strong>dry-run</strong> — it plans everything and reports what it <em>would</em> do, but takes no external action. Flip to Live when the reports look right.</>
        )}
      </div>

      {/* Email health — live deliverability audit (also runs before every board run) */}
      <section className="card mb-6 p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-600 text-navy">Email health — inbox, not spam</h2>
          <span className={`badge ${health.healthy ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
            {health.healthy ? "Healthy — outreach cleared" : "Issues — outreach auto-paused"}
          </span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {health.checks.map((c) => (
            <li key={c.name} className={`rounded-lg border px-3 py-2 text-sm ${c.ok ? "border-emerald-100 bg-emerald-50/50 text-navy-700" : "border-red-200 bg-red-50 text-red-800"}`}>
              <span className="font-600">{c.ok ? "✓" : "✗"} {c.name}</span>
              <span className="mt-0.5 block break-words text-xs opacity-80">{c.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-navy-400">
          The Deliverability director runs this audit before every board run and pauses outreach on any
          critical failure — sender reputation is protected automatically. Every cold email also carries a
          one-line opt-out.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        {/* Settings */}
        <section className="card h-fit p-6">
          <h2 className="mb-4 text-lg font-600 text-navy">Board settings</h2>
          <ActionForm action={updateBoardConfig} submitText="Save settings" successText="Saved">
            <label className="flex items-center gap-2 text-sm font-600 text-navy">
              <input type="checkbox" name="enabled" defaultChecked={config.enabled} className="rounded" />
              Board enabled (master switch)
            </label>
            <div>
              <label className="label" htmlFor="mode">Mode</label>
              <select id="mode" name="mode" className="input" defaultValue={config.mode}>
                <option value="dry-run">Dry-run — plan and report only</option>
                <option value="live">Live — take real actions</option>
              </select>
            </div>

            <div className="rounded-lg border border-navy-100 p-3">
              <label className="flex items-center gap-2 text-sm font-600 text-navy">
                <input type="checkbox" name="growthEnabled" defaultChecked={config.growth.enabled} className="rounded" />
                Growth director — find new leads
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="growthCity">Search area</label>
                  <input id="growthCity" name="growthCity" className="input" defaultValue={config.growth.city} />
                </div>
                <div>
                  <label className="label" htmlFor="growthDailyLeads">Leads per run (max 25)</label>
                  <input id="growthDailyLeads" name="growthDailyLeads" type="number" min={0} max={25} className="input" defaultValue={config.growth.dailyLeads} />
                </div>
              </div>
              <div className="mt-3">
                <label className="label" htmlFor="growthCategories">Categories (comma-separated, rotates daily)</label>
                <textarea id="growthCategories" name="growthCategories" rows={2} className="input" defaultValue={config.growth.categories.join(", ")} />
              </div>
            </div>

            <div className="rounded-lg border border-navy-100 p-3">
              <label className="flex items-center gap-2 text-sm font-600 text-navy">
                <input type="checkbox" name="productionEnabled" defaultChecked={config.production.enabled} className="rounded" />
                Production director — build demo sites
              </label>
              <div className="mt-3">
                <label className="label" htmlFor="productionDailyBuilds">Builds per run (max 10)</label>
                <input id="productionDailyBuilds" name="productionDailyBuilds" type="number" min={0} max={10} className="input" defaultValue={config.production.dailyBuilds} />
              </div>
            </div>

            <div className="rounded-lg border border-navy-100 p-3">
              <label className="flex items-center gap-2 text-sm font-600 text-navy">
                <input type="checkbox" name="outreachEnabled" defaultChecked={config.outreach.enabled} className="rounded" />
                Outreach director — send demo emails
              </label>
              <div className="mt-3">
                <label className="label" htmlFor="outreachDailySends">Sends per run (max 20)</label>
                <input id="outreachDailySends" name="outreachDailySends" type="number" min={0} max={20} className="input" defaultValue={config.outreach.dailySends} />
              </div>
              <p className="mt-2 text-xs text-navy-400">
                Only emails Ready demos that have a real address — leads found by the Growth
                director need an email added before outreach can reach them.
              </p>
            </div>
          </ActionForm>
          <p className="mt-4 text-xs text-navy-400">
            Schedule it: point a daily Plesk scheduled task at{" "}
            <code>/api/board/run?secret=…</code> (see DEPLOY-PLESK.md §12). Every run is capped,
            audited, and reported here.
          </p>
        </section>

        {/* Reports */}
        <section>
          <h2 className="mb-3 text-sm font-600 uppercase tracking-wide text-navy-400">
            Board reports
          </h2>
          {runs.length === 0 ? (
            <EmptyState>
              No runs yet. Enable the board and click <strong>Run board now</strong> — the first
              dry-run report shows exactly what it would do.
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {runs.map((run) => {
                const report = parseReport(run.report);
                return (
                  <div key={run.id} className="card p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`badge ${run.mode === "live" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {run.mode}
                      </span>
                      <span className="badge bg-navy-100 text-navy-600">{run.trigger}</span>
                      <span className="text-xs text-navy-400">
                        {fmtDateTime(run.startedAt)} · {run.actions} action{run.actions === 1 ? "" : "s"}
                      </span>
                    </div>
                    {report ? (
                      <>
                        <p className="text-sm leading-relaxed text-navy-700">{report.chairman}</p>
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs font-600 text-navy-500">
                            Director logs
                          </summary>
                          <div className="mt-2 space-y-3">
                            {report.sections.map((sec) => (
                              <div key={sec.director}>
                                <p className="text-xs font-700 uppercase tracking-wide text-navy-400">
                                  {sec.director} · {sec.actions} action{sec.actions === 1 ? "" : "s"}
                                </p>
                                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-navy-600">
                                  {sec.lines.map((l, i) => <li key={i}>{l}</li>)}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </details>
                      </>
                    ) : (
                      <p className="text-sm text-navy-400">Run in progress…</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
