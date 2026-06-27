import Link from "next/link";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState, StatusBadge } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { pleskListSubdomains, parentDomain } from "@/lib/plesk-domains";
import { removeSubdomain, detachCustomDomain } from "@/server/domains";
import { AddSubdomainForm } from "./AddSubdomainForm";

export const dynamic = "force-dynamic";

export default async function AdminDomainsPage() {
  await requireAdmin();
  const domain = parentDomain();

  const [labels, demos] = await Promise.all([
    pleskListSubdomains(),
    prisma.demo.findMany({
      where: { subdomainLabel: { not: null } },
      orderBy: { businessName: "asc" },
      select: {
        id: true,
        businessName: true,
        subdomainLabel: true,
        liveUrl: true,
        customDomain: true,
        customDomainStatus: true,
      },
    }),
  ]);

  const demoByLabel = new Map(
    demos.filter((d) => d.subdomainLabel).map((d) => [d.subdomainLabel as string, d]),
  );

  // Merge the server's list with any demo labels the list may not surface, so the
  // overview is complete even if `plesk bin subdomain --list` is unavailable.
  const allLabels = Array.from(
    new Set([...labels, ...demos.map((d) => d.subdomainLabel as string)]),
  ).sort();

  const customDomains = demos.filter((d) => d.customDomain);

  return (
    <>
      <PageHeader
        title="Domains"
        description="Manage subdomains and custom-domain aliases on the server — without opening Plesk Admin."
        action={<AddSubdomainForm parentDomain={domain} />}
      />

      {/* Custom domains */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-600 uppercase tracking-wide text-navy-400">Custom domains</h2>
        {customDomains.length === 0 ? (
          <EmptyState>
            No custom domains yet. Point a client&apos;s domain at a Ready demo from the{" "}
            <Link href="/admin/leads" className="text-copper hover:underline">Lead generator</Link>.
          </EmptyState>
        ) : (
          <div className="card divide-y divide-navy-100 p-0">
            {customDomains.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <a href={`https://${d.customDomain}`} target="_blank" rel="noreferrer" className="font-600 text-navy hover:underline">
                      {d.customDomain}
                    </a>
                    <StatusBadge status={d.customDomainStatus} />
                  </div>
                  <p className="text-xs text-navy-400">
                    {d.businessName} → {d.subdomainLabel}.{domain}
                  </p>
                </div>
                <ConfirmButton
                  action={detachCustomDomain.bind(null, d.id)}
                  confirm={`Detach ${d.customDomain}? This removes the alias from the server. The ${d.subdomainLabel}.${domain} preview keeps working.`}
                  className="text-xs text-red-500 hover:underline"
                >
                  Detach
                </ConfirmButton>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Subdomains */}
      <section>
        <h2 className="mb-3 text-sm font-600 uppercase tracking-wide text-navy-400">Subdomains</h2>
        {allLabels.length === 0 ? (
          <EmptyState>
            No subdomains found. Add one above, or deploy a demo site from the Lead generator.
            {labels.length === 0 && (
              <span className="mt-1 block text-xs text-navy-400">
                (If you expected to see some, the server may not be set up for portal provisioning yet.)
              </span>
            )}
          </EmptyState>
        ) : (
          <div className="card divide-y divide-navy-100 p-0">
            {allLabels.map((label) => {
              const demo = demoByLabel.get(label);
              return (
                <div key={label} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <a href={`https://${label}.${domain}`} target="_blank" rel="noreferrer" className="font-600 text-navy hover:underline">
                      {label}.{domain}
                    </a>
                    <p className="text-xs text-navy-400">
                      {demo ? (
                        <>Demo preview · {demo.businessName}</>
                      ) : (
                        <>Standalone subdomain</>
                      )}
                    </p>
                  </div>
                  {demo ? (
                    <span className="text-xs text-navy-300">Managed via Lead generator</span>
                  ) : (
                    <ConfirmButton
                      action={removeSubdomain.bind(null, label)}
                      confirm={`Remove ${label}.${domain} from the server? This deletes the subdomain and its files. This cannot be undone.`}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </ConfirmButton>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
