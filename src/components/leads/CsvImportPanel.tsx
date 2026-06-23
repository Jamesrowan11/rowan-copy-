"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  parseCsvHeaders,
  importCsv,
  type CsvHeadersResult,
  type CsvImportResult,
} from "@/server/leads";
import {
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  type ImportField,
} from "@/lib/csv";

type Step = "upload" | "map" | "done";

export function CsvImportPanel() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRowCount, setDataRowCount] = useState(0);
  const [mapping, setMapping] = useState<Record<ImportField, string>>(
    {} as Record<ImportField, string>,
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);

  function reset() {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setDataRowCount(0);
    setMapping({} as Record<ImportField, string>);
    setError(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function readColumns() {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const res: CsvHeadersResult = await parseCsvHeaders({ ok: false }, fd);
      if (!res.ok) {
        setError(res.error || "Could not read the CSV.");
        return;
      }
      setHeaders(res.headers || []);
      setDataRowCount(res.dataRowCount || 0);
      setMapping((res.guesses || {}) as Record<ImportField, string>);
      setStep("map");
    });
  }

  function runImport() {
    if (!file) return;
    if (!mapping.businessName) {
      setError("Map the Business name column.");
      return;
    }
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", file);
      for (const f of IMPORT_FIELDS) fd.set(`map_${f}`, mapping[f] || "");
      const res = await importCsv({ ok: false }, fd);
      if (!res.ok) {
        setError(res.error || "Import failed.");
        return;
      }
      setResult(res);
      setStep("done");
      router.refresh();
    });
  }

  return (
    <section className="card p-6">
      <h2 className="mb-1 text-lg font-600 text-navy">Import a CSV of leads</h2>
      <p className="mb-4 text-sm text-navy-600">
        Upload an export from Olivine, Apollo, or anywhere. Map the columns and
        import them as draft demos to generate later.
      </p>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {step === "upload" && (
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm text-navy-700 file:mr-3 file:rounded-lg file:border-0 file:bg-navy-100 file:px-3 file:py-2 file:text-sm file:font-600 file:text-navy hover:file:bg-navy-200"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setError(null);
            }}
          />
          <button type="button" className="btn-primary btn-sm" disabled={pending || !file} onClick={readColumns}>
            {pending ? "Reading…" : "Read columns"}
          </button>
        </div>
      )}

      {step === "map" && (
        <div className="space-y-4">
          <p className="text-sm text-navy-600">
            Detected <strong>{headers.length}</strong> column
            {headers.length === 1 ? "" : "s"} and <strong>{dataRowCount}</strong> data row
            {dataRowCount === 1 ? "" : "s"}. Map them to our fields:
          </p>

          <div className="space-y-3">
            {IMPORT_FIELDS.map((field) => (
              <div key={field} className="grid grid-cols-[1fr_1.4fr] items-center gap-3">
                <label className="text-sm font-600 text-navy" htmlFor={`map-${field}`}>
                  {IMPORT_FIELD_LABELS[field]}
                  {field === "businessName" && <span className="text-accent"> *</span>}
                </label>
                <select
                  id={`map-${field}`}
                  className="input !py-2"
                  value={mapping[field] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                >
                  <option value="">— none —</option>
                  {headers.map((h, i) => (
                    <option key={`${h}-${i}`} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pending || !mapping.businessName} onClick={runImport}>
              {pending ? "Importing…" : `Import ${dataRowCount} row${dataRowCount === 1 ? "" : "s"} as drafts`}
            </button>
            <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-3">
          <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Imported <strong>{result.imported}</strong> lead
            {result.imported === 1 ? "" : "s"} as drafts.
            {result.skippedDuplicate ? ` Skipped ${result.skippedDuplicate} duplicate${result.skippedDuplicate === 1 ? "" : "s"}.` : ""}
            {result.skippedNoName ? ` Skipped ${result.skippedNoName} without a business name.` : ""}
          </div>
          <p className="text-sm text-navy-600">
            They appear below with an <span className="badge bg-accent-soft text-accent-hover">Imported</span> badge.
            Generate them individually or use “Generate all imported”.
          </p>
          <button type="button" className="btn-outline btn-sm" onClick={reset}>
            Import another file
          </button>
        </div>
      )}
    </section>
  );
}
