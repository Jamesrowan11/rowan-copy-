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
} from "@/server/leads";
import { CsvImportPanel } from "./CsvImportPanel";

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
  convertedProjectId: string | null;
  createdAt: string;
};

export function LeadsManager({ demos, basePath }: { demos: DemoView[]; basePath: string }) {
  const router = useRouter();
  const [genAll, setGenAll] = useState<{ done: number; total: number } | null>(null);

  // Auto-refresh while any demo is still being researched/built so a
  // "Building" row flips to "Ready" without a manual reload.
  const inProgress = demos.some((d) => d.status === "Queued" || d.status === "Building");
  useEffect(() => {
    if (!inProgress || genAll) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [inProgress, genAll, router]);

  const importedCount = demos.filter((d) => d.status === "Imported").length;

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
          {importedCount > 0 && (
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={!!genAll}
              onClick={generateAllImported}
            >
              {genAll
                ? `Generating ${genAll.done} of ${genAll.total}…`
                : `Generate all imported (${importedCount})`}
            </button>
          )}
        </div>

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
        ) : (
          <div className="space-y-3">
            {demos.map((d) => (
              <DemoRow key={d.id} demo={d} basePath={basePath} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DemoRow({ demo, basePath }: { demo: DemoView; basePath: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = demo.status === "Queued" || demo.status === "Building";
  const canGenerate = ["Imported", "Error", "DeployFailed"].includes(demo.status);

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
        <div className="flex items-center gap-2">
          {demo.convertedProjectId ? (
            <StatusBadge status="Converted" />
          ) : (
            <StatusBadge status={demo.status} />
          )}
          {busy && <Spinner />}
        </div>
      </div>

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
