import { requireAdmin } from "@/lib/authz";
import { PageHeader, EmptyState } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { pleskListDns } from "@/lib/plesk-dns";
import { parentDomain } from "@/lib/plesk-domains";
import { deleteDnsRecord } from "@/server/dns";
import { AddDnsRecordForm } from "./AddDnsRecordForm";

export const dynamic = "force-dynamic";

const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/i;

export default async function AdminDnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const fallback = parentDomain();
  const raw = (Array.isArray(sp.domain) ? sp.domain[0] : sp.domain) || fallback;
  const domain = HOSTNAME_RE.test(raw) ? raw.toLowerCase() : fallback;

  const records = await pleskListDns(domain);

  return (
    <>
      <PageHeader
        title="DNS records"
        description="Add and remove DNS records on Plesk-hosted zones — without opening Plesk Admin."
      />

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Heads-up:</strong> these records only change what the world resolves if
        <strong> Plesk is the authoritative DNS server</strong> for this domain. If your DNS is hosted
        elsewhere (your registrar, Route&nbsp;53, Cloudflare, …), edit it there instead — changes here
        won&apos;t take effect. If the list below is empty, Plesk likely isn&apos;t hosting this zone.
      </div>

      {/* Domain selector */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="domain">Domain</label>
          <input
            id="domain"
            name="domain"
            className="input"
            defaultValue={domain}
            placeholder={fallback}
            pattern="[a-zA-Z0-9.-]+"
          />
        </div>
        <button type="submit" className="btn-ghost btn-sm">Load records</button>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <AddDnsRecordForm domain={domain} />

        <div>
          <h2 className="mb-3 text-sm font-600 uppercase tracking-wide text-navy-400">
            Records for {domain}
          </h2>
          {records.length === 0 ? (
            <EmptyState>
              No records found for {domain}. Either Plesk doesn&apos;t host this zone, or the server
              isn&apos;t set up for portal provisioning yet.
            </EmptyState>
          ) : (
            <div className="card divide-y divide-navy-100 p-0">
              {records.map((r, i) => (
                <div key={`${r.type}-${r.host}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="badge bg-navy-100 text-navy-700">{r.type}</span>
                      <span className="truncate font-600 text-navy">{r.host || "@"}</span>
                    </div>
                    <p className="truncate text-xs text-navy-400">{r.value}</p>
                  </div>
                  {r.id ? (
                    <ConfirmButton
                      action={deleteDnsRecord.bind(null, domain, r.id)}
                      confirm={`Delete this ${r.type} record (${r.host || "@"} → ${r.value}) from ${domain}? This cannot be undone.`}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </ConfirmButton>
                  ) : (
                    <span className="text-xs text-navy-300">Edit in Plesk</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
