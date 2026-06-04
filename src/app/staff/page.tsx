import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import {
  PageHeader,
  StatTile,
  StatusBadge,
  EmptyState,
  fmtDate,
} from "@/components/portal/ui";
import { ACTIVE_PROJECT_STATUSES } from "@/lib/constants";

export default async function StaffHome() {
  const me = await requireRole("EMPLOYEE");

  const [projects, announcements] = await Promise.all([
    prisma.project.findMany({
      where: { assigneeId: me.id, NOT: { status: "Cancelled" } },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      include: { client: true },
    }),
    prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { author: true },
    }),
  ]);

  const active = projects.filter((p) => ACTIVE_PROJECT_STATUSES.includes(p.status as never)).length;
  const inReview = projects.filter((p) => ["Draft Delivered", "Revisions"].includes(p.status)).length;

  return (
    <>
      <PageHeader title={`Welcome, ${me.name.split(" ")[0]}`} description="Your assigned projects and the latest from the team." />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatTile label="Assigned projects" value={projects.length} />
        <StatTile label="Active" value={active} />
        <StatTile label="In review / revisions" value={inReview} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <section>
          <h2 className="mb-3 text-lg font-600 text-navy">My projects</h2>
          {projects.length === 0 ? (
            <EmptyState>Nothing assigned to you right now.</EmptyState>
          ) : (
            <div className="space-y-3">
              {projects.map((p) => (
                <Link key={p.id} href={`/staff/projects/${p.id}`} className="card block p-4 hover:border-navy-300">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-600 text-navy">{p.title}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="mt-1 text-sm text-navy-500">
                    {p.client.name} · {p.type} · due {fmtDate(p.dueDate)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-600 text-navy">Announcements</h2>
          {announcements.length === 0 ? (
            <EmptyState>No announcements.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {announcements.map((a) => (
                <li key={a.id} className="card p-4">
                  <p className="font-600 text-navy">{a.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-navy-700">{a.body}</p>
                  <p className="mt-2 text-xs text-navy-400">{a.author.name} · {fmtDate(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
