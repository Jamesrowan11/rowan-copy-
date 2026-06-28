import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { pleskListDns, DNS_TYPES, type DnsType } from "@/lib/plesk-dns";
import { mailDomainStatus } from "@/lib/plesk-mail-domain";
import { deleteClientDnsRecord } from "@/server/client-domain";
import { AddClientDnsRecordForm } from "./AddClientDnsRecordForm";

export const dynamic = "force-dynamic";

export default async function ClientDomainPage() {
  const session = await requireRole("CLIENT");
  const me = await prisma.user.findUnique({
    where: { id: session.id },
    select: { mailDomain: true },
  });
  if (!me?.mailDomain) redirect("/client");
  const domain = me.mailDomain;

  const [status, records] = await Promise.all([
    mailDomainStatus(domain),
    pleskListDns(domain),
  ]);

  const pill = status.ready
    ? { cls: "bg-emerald-100 text-emerald-700", label: "Active" }
    : status.inPlesk
      ? { cls: "bg-amber-100 text-amber-700", label: "Setup in progress" }
      : { cls: "bg-navy-100 text-navy-600", label: "Not set up" };

  return (
    <>
      <PageHeader title="Your domain" description={`Settings and DNS records for ${domain}.`} />

      {/* Domain status */}
      <section className="mb-6">
        <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-600 text-navy">{domain}</span>
              <span className={`badge ${pill.cls}`}>{pill.label}</span>
            </div>
            <p className="mt-1 text-sm text-navy-600">{status.advice}</p>
          </div>
        </div>
      </section>

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Note:</strong> DNS changes here only take effect if your domain&apos;s DNS is managed by us.
        If your domain points its nameservers elsewhere (your registrar, etc.), changes won&apos;t apply —
        reach out to Rowan Copy if you&apos;re not sure.
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AddClientDnsRecordForm domain={domain} />

        <div>
          <h2 className="mb-3 text-sm font-600 uppercase tracking-wide text-navy-400">
            DNS records
          </h2>
          {records.length === 0 ? (
            <EmptyState>
              No records to show yet. If your domain was just set up, give it a few minutes.
            </EmptyState>
          ) : (
            <div className="card divide-y divide-navy-100 p-0">
              {records.map((r, i) => {
                const editable = r.id && DNS_TYPES.includes(r.type as DnsType);
                return (
                  <div key={`${r.type}-${r.host}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="badge bg-navy-100 text-navy-700">{r.type}</span>
                        <span className="truncate font-600 text-navy">{r.host || "@"}</span>
                      </div>
                      <p className="truncate text-xs text-navy-400">{r.value}</p>
                    </div>
                    {editable ? (
                      <ConfirmButton
                        action={deleteClientDnsRecord.bind(null, r.id as string)}
                        confirm={`Remove this ${r.type} record (${r.host || "@"} → ${r.value})?`}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Remove
                      </ConfirmButton>
                    ) : (
                      <span className="text-xs text-navy-300">System record</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
