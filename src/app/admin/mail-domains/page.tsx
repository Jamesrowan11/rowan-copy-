import Link from "next/link";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { pleskListDomains, mailDomainStatus, mailServerIp } from "@/lib/plesk-mail-domain";
import { setupDomainMail } from "@/server/mail-domain";

export const dynamic = "force-dynamic";

export default async function AdminMailDomainsPage() {
  await requireAdmin();

  // Customers with the mailbox-management switch on, grouped by their domain.
  const customers = await prisma.user.findMany({
    where: { mailAdmin: true, mailDomain: { not: null } },
    orderBy: { mailDomain: "asc" },
    select: { id: true, name: true, mailDomain: true },
  });

  const byDomain = new Map<string, string[]>();
  for (const c of customers) {
    const d = c.mailDomain as string;
    byDomain.set(d, [...(byDomain.get(d) ?? []), c.name]);
  }

  const known = await pleskListDomains();
  const rows = await Promise.all(
    Array.from(byDomain.keys()).map(async (domain) => ({
      domain,
      customers: byDomain.get(domain) as string[],
      status: await mailDomainStatus(domain, known),
    })),
  );

  return (
    <>
      <PageHeader
        title="Mail domains"
        description="Set up customers' own domains for mail — without opening Plesk."
      />

      <div className="mb-6 rounded-lg border border-navy-100 bg-navy-50/40 px-4 py-3 text-sm text-navy-600">
        Each customer you switch on (Admin → Users → a client → <strong>Mailbox management</strong>) shows up here.
        Click <strong>Set up mail</strong> to add their domain to the server as an add-on, then point its
        <strong> MX record</strong> at this server (<code>{mailServerIp()}</code>) — or move the domain&apos;s DNS to
        Plesk and the MX is handled automatically.
      </div>

      {rows.length === 0 ? (
        <EmptyState>
          No customer mail domains yet. Turn on <strong>Mailbox management</strong> for a client from{" "}
          <Link href="/admin/users" className="text-copper hover:underline">Users &amp; team</Link>.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map(({ domain, customers: names, status }) => {
            const pill = status.ready
              ? { cls: "bg-emerald-100 text-emerald-700", label: "Ready" }
              : status.inPlesk
                ? { cls: "bg-amber-100 text-amber-700", label: "Needs MX" }
                : { cls: "bg-navy-100 text-navy-600", label: "Not set up" };
            return (
              <div key={domain} className="card flex flex-wrap items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-600 text-navy">{domain}</span>
                    <span className={`badge ${pill.cls}`}>{pill.label}</span>
                  </div>
                  <p className="text-xs text-navy-400">For: {names.join(", ")}</p>
                  <p className="mt-1 text-sm text-navy-600">{status.advice}</p>
                </div>
                {!status.inPlesk && (
                  <ConfirmButton
                    action={setupDomainMail.bind(null, domain)}
                    confirm={`Add ${domain} to the server for mail (as an add-on domain)?`}
                    className="btn-primary btn-sm"
                  >
                    Set up mail
                  </ConfirmButton>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
