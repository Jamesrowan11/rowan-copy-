"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge, EmptyState, fmtDateTime } from "@/components/portal/ui";
import { ActionForm } from "@/components/portal/ActionForm";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import {
  createDemo,
  convertDemo,
  deleteDemo,
  generateDemo,
  generateDemoNow,
  scoreAllUnscored,
  editDemo,
  preflightCustomDomain,
  goLiveCustomDomain,
} from "@/server/leads";
import { scoreLead } from "@/lib/lead-scoring";
import { CsvImportPanel } from "./CsvImportPanel";
import { FindLeadsPanel } from "./FindLeadsPanel";

export type DemoView = {
  id: string;
  businessName: string;
  city: string;
  industry: string;
  email: string;
  status: string;
  liveUrl: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  foundExistingSite: boolean | null;
  currentWebsite: string | null;
  researchSummary: string | null;
  score: number | null;
  tier: string | null;
  lastEditInstruction: string | null;
  lastEditedAt: string | null;
  customDomain: string | null;
  customDomainStatus: string;
  lastDnsCheck: string | null;
  convertedProjectId: string | null;
  createdAt: string;
};

type TierFilter = "all" | "Hot" | "Warm" | "Cold";

export function LeadsManager({ demos, basePath }: { demos: DemoView[]; basePath: string }) {
  const router = useRouter();
  const isAdmin = basePath === "/admin";
  const [genAll, setGenAll] = useState<{ done: number; total: number } | null>(null);
  const [sortByScore, setSortByScore] = useState(true);
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [scoring, setScoring] = useState(false);
  const [, startScore] = useTransition();

  // Auto-refresh while any demo is still being researched/built so a
  // "Building" row flips to "Ready" without a manual reload.
  const inProgress = demos.some(
    (d) => d.status === "Queued" || d.status === "Building" || d.status === "Editing",
  );
  useEffect(() => {
    if (!inProgress || genAll) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [inProgress, genAll, router]);

  const importedCount = demos.filter((d) => d.status === "Imported").length;
  const unscoredCount = demos.filter((d) => d.score == null).length;

  // Filter by tier, then sort (highest score first by default).
  const visibleDemos = demos
    .filter((d) => tierFilter === "all" || d.tier === tierFilter)
    .slice()
    .sort((a, b) =>
      sortByScore
        ? (b.score ?? -1) - (a.score ?? -1)
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  function backfillScores() {
    setScoring(true);
    startScore(async () => {
      await scoreAllUnscored();
      setScoring(false);
      router.refresh();
    });
  }

  // Generate every imported demo SEQUENTIALLY with a short delay between each
  // (not all at once) to control API cost and avoid rate limits.
  async function generateAllImported() {
    const ids = demos.filter((d) => d.status === "Imported").map((d) => d.id);
    if (ids.length === 0) return;
    setGenAll({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i++) {
      try {
        await generateDemoNow(ids[i]);
      } catch {
        /* pipeline records its own Error status; keep going */
      }
      setGenAll({ done: i + 1, total: ids.length });
      router.refresh();
      if (i < ids.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
    setGenAll(null);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {isAdmin && <FindLeadsPanel />}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-1 text-lg font-600 text-navy">Generate a sample site</h2>
          <p className="mb-4 text-sm text-navy-600">
            Enter a business and we&apos;ll research it, build a sample one-page site,
            deploy it live, and draft a friendly outreach email — automatically.
          </p>
          <ActionForm action={createDemo} submitText="Generate demo" successText="Queued — building now…" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="businessName" label="Business name" required />
              <Field name="city" label="City" required />
              <Field name="industry" label="Industry" required placeholder="e.g. plumber, salon, café" />
              <Field name="email" label="Contact email" type="email" required />
            </div>
            <Field name="currentWebsite" label="Current website (optional)" placeholder="https://… (leave blank and we'll search)" />
          </ActionForm>
        </section>

        <CsvImportPanel />
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-600 text-navy">Demos</h2>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && unscoredCount > 0 && (
              <button type="button" className="btn-outline btn-sm" disabled={scoring} onClick={backfillScores}>
                {scoring ? "Scoring…" : `Score all unscored (${unscoredCount})`}
              </button>
            )}
            {importedCount > 0 && (
              <button type="button" className="btn-primary btn-sm" disabled={!!genAll} onClick={generateAllImported}>
                {genAll ? `Generating ${genAll.done} of ${genAll.total}…` : `Generate all imported (${importedCount})`}
              </button>
            )}
          </div>
        </div>

        {demos.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-navy-600">
              <span>Tier</span>
              <select
                className="input !w-auto !py-1.5"
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as TierFilter)}
              >
                <option value="all">All</option>
                <option value="Hot">Hot</option>
                <option value="Warm">Warm</option>
                <option value="Cold">Cold</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-navy-600">
              <input type="checkbox" className="rounded" checked={sortByScore} onChange={(e) => setSortByScore(e.target.checked)} />
              Sort by score (highest first)
            </label>
            <span className="ml-auto text-xs text-navy-400">
              Showing {visibleDemos.length} of {demos.length}
            </span>
          </div>
        )}

        {genAll && (
          <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-navy-100">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${Math.round((genAll.done / genAll.total) * 100)}%` }}
            />
          </div>
        )}

        {demos.length === 0 ? (
          <EmptyState>No demos yet. Generate one above, or import a CSV.</EmptyState>
        ) : visibleDemos.length === 0 ? (
          <EmptyState>No demos match this filter.</EmptyState>
        ) : (
          <div className="space-y-3">
            {visibleDemos.map((d) => (
              <DemoRow key={d.id} demo={d} basePath={basePath} isAdmin={isAdmin} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DemoRow({ demo, basePath, isAdmin }: { demo: DemoView; basePath: string; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy =
    demo.status === "Queued" || demo.status === "Building" || demo.status === "Editing";
  const canGenerate = ["Imported", "Error", "DeployFailed"].includes(demo.status);
  // A demo with a live site can be AI-edited (Ready, or a previous edit that failed).
  const canEdit = demo.status === "Ready" || demo.status === "EditFailed";

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-600 text-navy">
            {demo.businessName}
            <span className="text-navy-400">
              {" · "}
              {demo.city || "—"}
              {demo.industry ? ` · ${demo.industry}` : ""}
            </span>
          </p>
          {demo.email && <p className="text-sm text-navy-500">{demo.email}</p>}
          {demo.liveUrl && (
            <a href={demo.liveUrl} target="_blank" rel="noreferrer" className="link text-sm">
              {demo.liveUrl} ↗
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {demo.tier && (
            <span className="inline-flex items-center gap-1">
              <StatusBadge status={demo.tier} />
              {demo.score != null && (
                <span className="text-sm font-700 text-navy">{demo.score}</span>
              )}
            </span>
          )}
          {demo.convertedProjectId ? (
            <StatusBadge status="Converted" />
          ) : (
            <StatusBadge status={demo.status} />
          )}
          {busy && <Spinner />}
        </div>
      </div>

      {demo.tier && <ScoreReasons demo={demo} />}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-navy-100 pt-3">
        {canGenerate && (
          <button
            type="button"
            className="btn-navy btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await generateDemo(demo.id);
                if (!res.ok) setError(res.error || "Failed");
                else router.refresh();
              })
            }
          >
            {pending ? "Starting…" : demo.status === "Imported" ? "Generate demo" : "Retry"}
          </button>
        )}

        <button
          type="button"
          className="btn-outline btn-sm"
          disabled={!demo.emailBody}
          onClick={() => {
            const text = `Subject: ${demo.emailSubject ?? ""}\n\n${demo.emailBody ?? ""}`;
            navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            });
          }}
        >
          {copied ? "Copied!" : "Copy email draft"}
        </button>

        {!demo.convertedProjectId && (
          <button
            type="button"
            className="btn-navy btn-sm"
            disabled={pending || demo.status !== "Ready"}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await convertDemo(demo.id);
                if (!res.ok) setError(res.error || "Failed");
                else if (res.projectId) router.push(`${basePath}/projects/${res.projectId}`);
                else router.refresh();
              })
            }
          >
            {pending ? "Converting…" : "Convert to Project"}
          </button>
        )}

        <ConfirmButton
          action={deleteDemo.bind(null, demo.id)}
          confirm={`Delete the demo for ${demo.businessName} and tear down its live subdomain?`}
          className="btn-danger btn-sm"
        >
          Delete & tear down
        </ConfirmButton>

        <span className="ml-auto text-xs text-navy-400">{fmtDateTime(demo.createdAt)}</span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      {demo.status === "Editing" && (
        <p className="mt-3 flex items-center gap-2 text-sm text-blue-700">
          <Spinner /> Editing &amp; redeploying — the live URL won&apos;t change.
        </p>
      )}

      {canEdit && (
        <EditWithAI demoId={demo.id} failed={demo.status === "EditFailed"} />
      )}

      {isAdmin && demo.status === "Ready" && <CustomDomainPanel demo={demo} />}

      {demo.lastEditInstruction && demo.status !== "Editing" && (
        <p className="mt-2 text-xs text-navy-400">
          Last edit{demo.lastEditedAt ? ` · ${fmtDateTime(demo.lastEditedAt)}` : ""}: “{demo.lastEditInstruction}”
        </p>
      )}

      {demo.emailSubject && (
        <details className="mt-3 rounded-lg border border-navy-100 bg-navy-50/40 p-3">
          <summary className="cursor-pointer text-sm font-600 text-navy">Outreach email draft</summary>
          <p className="mt-2 text-sm font-600 text-navy">Subject: {demo.emailSubject}</p>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-navy-700">{demo.emailBody}</pre>
        </details>
      )}
    </div>
  );
}

function CustomDomainPanel({ demo }: { demo: DemoView }) {
  const router = useRouter();
  const [checking, startCheck] = useTransition();
  const [going, startGo] = useTransition();
  const [domain, setDomain] = useState(demo.customDomain ?? "");
  const [error, setError] = useState<string | null>(null);
  const status = demo.customDomainStatus;
  const ready = status === "ReadyToGoLive";

  if (status === "Live" && demo.customDomain) {
    return (
      <div className="mt-3 rounded-lg border border-green-200 bg-green-50/60 p-3">
        <p className="text-sm font-600 text-green-800">
          🌐 Live on custom domain ·{" "}
          <a href={`https://${demo.customDomain}`} target="_blank" rel="noreferrer" className="link">
            {demo.customDomain} ↗
          </a>
        </p>
        <p className="mt-1 text-xs text-navy-500">The rowancopy.com preview URL also still works.</p>
      </div>
    );
  }

  function runCheck() {
    const d = domain.trim();
    if (!d) return;
    setError(null);
    startCheck(async () => {
      const res = await preflightCustomDomain(demo.id, d);
      if (!res.ok) setError(res.error || "Check failed.");
      router.refresh();
    });
  }

  function goLive() {
    setError(null);
    startGo(async () => {
      const res = await goLiveCustomDomain(demo.id);
      if (!res.ok) setError(res.error || "Go-live failed.");
      router.refresh();
    });
  }

  return (
    <details className="mt-3 rounded-lg border border-navy-100 bg-navy-50/40 p-3" open={status !== "None"}>
      <summary className="cursor-pointer text-sm font-600 text-navy">
        Go live on custom domain
        {status !== "None" && (
          <span className="ml-2 align-middle">
            <StatusBadge status={status} />
          </span>
        )}
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-xs text-navy-500">
          Have the client point their domain&apos;s A record to{" "}
          <code className="rounded bg-navy-100 px-1 font-mono">3.151.16.78</code>, then run a pre-flight check.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <input
            className="input flex-1"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="theirbusiness.com"
            disabled={checking || going}
          />
          <button type="button" className="btn-outline btn-sm" disabled={checking || going || !domain.trim()} onClick={runCheck}>
            {checking ? "Checking…" : "Run pre-flight check"}
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={!ready || checking || going}
            title={ready ? "" : "Run a pre-flight check that passes first"}
            onClick={goLive}
          >
            {going ? "Going live…" : "Go Live"}
          </button>
        </div>

        {demo.lastDnsCheck && (
          <div className="rounded-lg border border-navy-100 bg-white p-3">
            <p className="mb-1 text-xs font-600 uppercase tracking-wide text-navy-400">Readiness report</p>
            <pre className="whitespace-pre-wrap font-sans text-sm text-navy-700">{demo.lastDnsCheck}</pre>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </details>
  );
}

function EditWithAI({ demoId, failed }: { demoId: string; failed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const text = instruction.trim();
    if (!text) return;
    setError(null);
    start(async () => {
      const res = await editDemo(demoId, text);
      if (!res.ok) setError(res.error || "Failed");
      else {
        setInstruction("");
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-navy-100 bg-navy-50/40 p-3">
      <label className="label" htmlFor={`edit-${demoId}`}>
        Edit with AI
      </label>
      <div className="flex flex-wrap items-start gap-2">
        <input
          id={`edit-${demoId}`}
          className="input flex-1"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. make the header navy, add a contact form, mention they're family-owned"
          disabled={pending}
        />
        <button type="button" className="btn-primary btn-sm" disabled={pending || !instruction.trim()} onClick={submit}>
          {pending ? "Sending…" : "Revise & redeploy"}
        </button>
      </div>
      <p className="mt-1 text-xs text-navy-400">
        Revises the existing site and redeploys to the same URL. Keeps everything you didn&apos;t ask to change.
      </p>
      {failed && !error && (
        <p className="mt-1 text-xs text-orange-600">Last edit failed — your live site is unchanged. Try again.</p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ScoreReasons({ demo }: { demo: DemoView }) {
  // Recompute reasons from the same pure function & the same inputs used to
  // store the score, so the explanation always matches the displayed number.
  const { reasons } = scoreLead({
    businessName: demo.businessName,
    city: demo.city,
    industry: demo.industry,
    email: demo.email,
    currentWebsite: demo.currentWebsite,
    foundExistingSite: demo.foundExistingSite,
    researchSummary: demo.researchSummary,
  });
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs font-600 text-navy-500 hover:text-navy">
        Why this score?
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-navy-600">
        {reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </details>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-navy-200 border-t-navy-600"
      aria-label="Working"
    />
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} className="input" required={required} placeholder={placeholder} />
    </div>
  );
}
