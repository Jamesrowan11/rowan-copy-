"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/portal/ui";
import {
  findLeads,
  importFoundLeads,
  type FindLeadsResult,
  type FoundLeadView,
} from "@/server/leads";
import { SEARCH_RADII_MILES } from "@/lib/places-config";
import { websiteStatus } from "@/lib/website-quality";

type Step = "search" | "preview" | "done";

export function FindLeadsPanel() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>("search");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [max, setMax] = useState("10");
  const [radius, setRadius] = useState("5");
  const [quality, setQuality] = useState<"best" | "all">("best");
  const [leads, setLeads] = useState<FoundLeadView[]>([]);
  const [stats, setStats] = useState<{ found: number; passed: number; quality: "best" | "all" }>({ found: 0, passed: 0, quality: "best" });
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skippedDuplicate: number } | null>(null);

  function runSearch() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("city", city);
      fd.set("category", category);
      fd.set("max", max);
      fd.set("radius", radius);
      fd.set("quality", quality);
      const res: FindLeadsResult = await findLeads({ ok: false }, fd);
      if (!res.ok) {
        setError(res.error || "Search failed.");
        return;
      }
      setLeads(res.leads || []);
      setStats({ found: res.found ?? 0, passed: res.passed ?? (res.leads?.length || 0), quality: res.quality ?? quality });
      setRemaining(res.searchesRemaining ?? null);
      setStep("preview");
    });
  }

  function confirmImport() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("city", city);
      fd.set("category", category);
      fd.set(
        "leads",
        JSON.stringify(
          leads.map((l) => ({
            businessName: l.businessName,
            currentWebsite: l.currentWebsite,
            phone: l.phone,
            address: l.address,
          })),
        ),
      );
      const res = await importFoundLeads({ ok: false }, fd);
      if (!res.ok) {
        setError(res.error || "Import failed.");
        return;
      }
      setResult({ imported: res.imported || 0, skippedDuplicate: res.skippedDuplicate || 0 });
      setStep("done");
      router.refresh();
    });
  }

  function reset() {
    setStep("search");
    setLeads([]);
    setResult(null);
    setError(null);
  }

  return (
    <section className="card p-6">
      <h2 className="mb-1 text-lg font-600 text-navy">Find leads (Google Places)</h2>
      <p className="mb-4 text-sm text-navy-600">
        Search a city + category for local businesses, see which have no website, and
        import them as scored draft demos. Admin only — each search uses paid API quota.
      </p>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {step === "search" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="fl-city">Center location</label>
              <input id="fl-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Clarksville, MD" />
              <p className="mt-1 text-xs text-navy-400">Search center (also saved as each lead&apos;s city).</p>
            </div>
            <div>
              <label className="label" htmlFor="fl-cat">Category</label>
              <input id="fl-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. HVAC, dentist, salon" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="fl-radius">Radius</label>
              <select id="fl-radius" className="input" value={radius} onChange={(e) => setRadius(e.target.value)}>
                {SEARCH_RADII_MILES.map((mi) => (
                  <option key={mi} value={mi}>{mi} mile{mi === 1 ? "" : "s"}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="fl-quality">Lead quality</label>
              <select id="fl-quality" className="input" value={quality} onChange={(e) => setQuality(e.target.value as "best" | "all")}>
                <option value="best">Best targets only (no/weak website)</option>
                <option value="all">All businesses</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label" htmlFor="fl-max">Max results</label>
              <select id="fl-max" className="input !w-auto" value={max} onChange={(e) => setMax(e.target.value)}>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
            </div>
            <button type="button" className="btn-primary btn-sm" disabled={pending || !city.trim() || !category.trim()} onClick={runSearch}>
              {pending ? "Searching…" : "Find leads"}
            </button>
          </div>
          <p className="text-xs text-navy-400">
            Each search is one paid Text Search call (max 20 results); radii over 31 miles widen the area beyond Google&apos;s precise circle.
          </p>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-navy-600">
              {stats.quality === "best" ? (
                <>Found <strong>{stats.found}</strong>, <strong>{stats.passed}</strong> {stats.passed === 1 ? "is a best target" : "are best targets"}</>
              ) : (
                <>Found <strong>{stats.found}</strong> business{stats.found === 1 ? "" : "es"}</>
              )}{" "}for <strong>{category}</strong> near <strong>{city}</strong>.
              {remaining != null && <span className="text-navy-400"> {remaining} search{remaining === 1 ? "" : "es"} left today.</span>}
            </p>
          </div>

          {leads.length === 0 ? (
            <p className="rounded-lg border border-navy-100 bg-navy-50/40 px-3 py-2 text-sm text-navy-500">
              {stats.found > 0
                ? "Businesses were found, but none are best targets (all have real websites). Switch to “All businesses” to see them."
                : "No businesses found. Try a broader category, area, or radius."}
            </p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {leads.map((l, i) => (
                <li key={`${l.businessName}-${i}`} className="rounded-lg border border-navy-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-600 text-navy">{l.businessName}</p>
                      {l.address && <p className="truncate text-xs text-navy-400">{l.address}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <StatusBadge status={l.tier} />
                      <span className="text-sm font-700 text-navy">{l.score}</span>
                    </div>
                  </div>
                  <div className="mt-1.5">
                    {(() => {
                      const s = websiteStatus(l.currentWebsite);
                      if (s === "none") return <span className="badge bg-accent text-white">No website — hot</span>;
                      if (s === "weak") return <span className="badge bg-amber-100 text-amber-700">Weak site — good</span>;
                      return <span className="badge bg-navy-100 text-navy-500">Has website</span>;
                    })()}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {leads.length > 0 && (
              <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={confirmImport}>
                {pending ? "Importing…" : `Import ${leads.length} as draft demos`}
              </button>
            )}
            <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={reset}>
              Search again
            </button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-3">
          <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Imported <strong>{result.imported}</strong> lead{result.imported === 1 ? "" : "s"} as scored drafts.
            {result.skippedDuplicate ? ` Skipped ${result.skippedDuplicate} duplicate${result.skippedDuplicate === 1 ? "" : "s"}.` : ""}
          </div>
          <p className="text-sm text-navy-600">
            They appear below with an <span className="badge bg-accent-soft text-accent-hover">Imported</span> badge and a score. Generate the hot ones first.
          </p>
          <button type="button" className="btn-outline btn-sm" onClick={reset}>
            Find more
          </button>
        </div>
      )}
    </section>
  );
}
