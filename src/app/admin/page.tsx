import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import {
  PageHeader,
  StatTile,
  StatusBadge,
  EmptyState,
  fmtDate,
} from "@/components/portal/ui";
import { ACTIVE_PROJECT_STATUSES, IN_REVIEW_STATUSES } from "@/lib/constants";

export default async function AdminOverview() {
  await requireAdmin();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    openInquiries,
    activeProjects,
    inReview,
    closedThisMonth,
    activePlans,
    recentInquiries,
    dueSoon,
  ] = await Promise.all([
    prisma.inquiry.count({ where: { status: { in: ["New", "Reviewed"] } } }),
    prisma.project.count({ where: { status: { in: ACTIVE_PROJECT_STATUSES } } }),
    prisma.project.count({ where: { status: { in: IN_REVIEW_STATUSES } } }),
    prisma.project.count({
      where: { status: "Closed", updatedAt: { gte: startOfMonth } },
    }),
    prisma.monthlyPlan.count({ where: { active: true } }),
    prisma.inquiry.findMany({
      where: { status: { in: ["New", "Reviewed"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.project.findMany({
      where: {
        status: { in: ACTIVE_PROJECT_STATUSES },
        dueDate: { not: null },
      },
      orderBy: { dueDate: "asc" },
      take: 6,
      include: { client: true, assignee: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Everything happening across Rowan Copy right now."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Open inquiries" value={openInquiries} />
        <StatTile label="Active projects" value={activeProjects} />
        <StatTile label="In review / revisions" value={inReview} />
        <StatTile label="Closed this month" value={closedThisMonth} />
        <StatTile label="Active monthly plans" value={activePlans} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-600 text-navy">New inquiries</h2>
            <Link href="/admin/inquiries" className="link text-sm">
              View all →
            </Link>
          </div>
          {recentInquiries.length === 0 ? (
            <EmptyState>No open inquiries. Nice and clear.</EmptyState>
          ) : (
            <ul className="divide-y divide-navy-100">
              {recentInquiries.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-600 text-navy">
                      {i.name}
                      {i.business ? ` · ${i.business}` : ""}
                    </p>
                    <p className="truncate text-xs text-navy-500">
                      {i.serviceType} · {fmtDate(i.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-600 text-navy">Due soon</h2>
            <Link href="/admin/projects" className="link text-sm">
              All projects →
            </Link>
          </div>
          {dueSoon.length === 0 ? (
            <EmptyState>Nothing with a due date right now.</EmptyState>
          ) : (
            <ul className="divide-y divide-navy-100">
              {dueSoon.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="truncate text-sm font-600 text-navy hover:text-accent-hover"
                    >
                      {p.title}
                    </Link>
                    <p className="truncate text-xs text-navy-500">
                      {p.client.name} · {p.assignee?.name ?? "Unassigned"} · due{" "}
                      {fmtDate(p.dueDate)}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
