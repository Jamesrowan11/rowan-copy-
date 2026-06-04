import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import {
  PageHeader,
  StatusBadge,
  EmptyState,
  fmtDate,
} from "@/components/portal/ui";
import { MonthlyPlanCard } from "./MonthlyPlanCard";

export default async function ClientHome() {
  const me = await requireRole("CLIENT");

  const [projects, plan] = await Promise.all([
    prisma.project.findMany({
      where: { clientId: me.id },
      orderBy: { updatedAt: "desc" },
      include: {
        documents: { where: { kind: "deliverable" }, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.monthlyPlan.findUnique({ where: { clientId: me.id } }),
  ]);

  const active = projects.filter((p) => !["Closed", "Cancelled", "Approved"].includes(p.status));
  const past = projects.filter((p) => ["Closed", "Cancelled", "Approved"].includes(p.status));

  return (
    <>
      <PageHeader
        title={`Welcome, ${me.name.split(" ")[0]}`}
        description="Your projects, drafts, and updates with Rowan Copy."
        action={<Link href="/client/request" className="btn-primary">+ New request</Link>}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-600 text-navy">Active projects</h2>
            {active.length === 0 ? (
              <EmptyState>No active projects. Start a new request anytime.</EmptyState>
            ) : (
              <div className="space-y-3">
                {active.map((p) => (
                  <Link key={p.id} href={`/client/projects/${p.id}`} className="card block p-4 hover:border-navy-300">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-600 text-navy">{p.title}</p>
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="mt-1 text-sm text-navy-500">
                      {p.type}
                      {p.dueDate ? ` · due ${fmtDate(p.dueDate)}` : ""}
                      {p.documents.length ? ` · ${p.documents.length} deliverable(s)` : ""}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-600 text-navy">Project history</h2>
            {past.length === 0 ? (
              <EmptyState>Nothing here yet.</EmptyState>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-navy-100">
                    {past.map((p) => (
                      <tr key={p.id} className="hover:bg-navy-50/40">
                        <td className="px-4 py-3">
                          <Link href={`/client/projects/${p.id}`} className="font-600 text-navy hover:text-accent-hover">
                            {p.title}
                          </Link>
                          <div className="text-xs text-navy-400">{p.type} · {fmtDate(p.updatedAt)}</div>
                        </td>
                        <td className="px-4 py-3 text-right"><StatusBadge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div>
          <MonthlyPlanCard
            active={plan?.active ?? false}
            renewalLabel={fmtDate(plan?.renewalDate)}
          />
        </div>
      </div>
    </>
  );
}
