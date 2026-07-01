import type { DomainGuide } from "@/lib/domain-guide";
import { CopyButton } from "@/components/portal/CopyButton";

const STATUS_UI: Record<
  DomainGuide["status"],
  { cls: string; label: string; msg: string }
> = {
  Live: {
    cls: "border-emerald-200 bg-emerald-50 text-emerald-800",
    label: "Pointing here ✓",
    msg: "This domain now points to our server. It's connected (or about to be) — no further DNS changes needed.",
  },
  Partial: {
    cls: "border-amber-200 bg-amber-50 text-amber-900",
    label: "Almost there",
    msg: "The root domain points here, but www doesn't yet. Add the www A record below so both versions work.",
  },
  NotPointing: {
    cls: "border-amber-200 bg-amber-50 text-amber-900",
    label: "Not pointing here yet",
    msg: "The domain isn't pointing to our server yet. Add the DNS records below at your domain registrar.",
  },
};

export function DomainSetupGuide({
  guide,
  audience = "client",
}: {
  guide: DomainGuide;
  audience?: "admin" | "client";
}) {
  const s = STATUS_UI[guide.status];
  return (
    <div className="space-y-4">
      <div className={`rounded-lg border px-4 py-3 text-sm ${s.cls}`}>
        <span className="font-600">{s.label}.</span> {s.msg}
        {guide.status !== "Live" && guide.currentRootIps.length > 0 && (
          <span className="mt-1 block text-xs">
            {guide.domain} currently resolves to {guide.currentRootIps.join(", ")}.
          </span>
        )}
      </div>

      {/* Records */}
      <div>
        <h4 className="mb-2 text-xs font-600 uppercase tracking-wide text-navy-400">
          DNS records to add at your registrar
        </h4>
        <div className="overflow-hidden rounded-lg border border-navy-100">
          <table className="w-full text-sm">
            <thead className="bg-navy-50 text-left text-xs text-navy-500">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Host / Name</th>
                <th className="px-3 py-2">Points to (value)</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {guide.records.map((r) => (
                <tr key={r.host}>
                  <td className="px-3 py-2 font-mono text-navy-700">{r.type}</td>
                  <td className="px-3 py-2 font-mono text-navy-700">{r.host}</td>
                  <td className="px-3 py-2 font-mono text-navy-700">{r.value}</td>
                  <td className="px-3 py-2 text-right"><CopyButton text={r.value} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-navy-400">
          Use <code>@</code> for the root domain. If your registrar doesn&apos;t allow a www A record,
          a CNAME for <code>www</code> pointing to <code>{guide.domain}</code> also works.
        </p>
      </div>

      {/* Steps */}
      <div>
        <h4 className="mb-2 text-xs font-600 uppercase tracking-wide text-navy-400">Step by step</h4>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-navy-700">
          {guide.steps.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
      </div>

      {audience === "admin" && (
        <p className="text-xs italic text-navy-400">
          Your client sees this same guide (and live status) in their project. Reload to re-check after
          they update DNS. Once it shows “Pointing here”, finish the connection from Admin → Domains
          (or the demo&apos;s Go Live).
        </p>
      )}
    </div>
  );
}
