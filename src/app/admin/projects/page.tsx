import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import {
  PageHeader,
  StatusBadge,
  EmptyState,
  Money,
  fmtDate,
} from "@/components/portal/ui";
import { ProjectCreateForm } from "./ProjectCreateForm";

export default async function AdminProjectsPage() {
  await requireAdmin();

  const [projects, clients, staff] = await Promise.all([
    prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: { client: true, assignee: true },
    }),
    prisma.user.findMany({
      where: { role: "CLIENT", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "EMPLOYEE"] }, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Every project, from inquiry to closed."
        action={<ProjectCreateForm clients={clients} staff={staff} />}
      />

      {projects.length === 0 ? (
        <EmptyState>No projects yet. Create one to get started.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy-50/70 text-xs uppercase tracking-wide text-navy-500">
              <tr>
                <th className="px-4 py-3 font-600">Project</th>
                <th className="px-4 py-3 font-600">Client</th>
                <th className="px-4 py-3 font-600">Assignee</th>
                <th className="px-4 py-3 font-600">Due</th>
                <th className="px-4 py-3 font-600">Price</th>
                <th className="px-4 py-3 font-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-navy-50/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="font-600 text-navy hover:text-accent-hover"
                    >
                      {p.title}
                    </Link>
                    <div className="text-xs text-navy-400">{p.type}</div>
                  </td>
                  <td className="px-4 py-3 text-navy-600">{p.client.name}</td>
                  <td className="px-4 py-3 text-navy-600">
                    {p.assignee?.name ?? <span className="text-navy-400">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3 text-navy-600">{fmtDate(p.dueDate)}</td>
                  <td className="px-4 py-3 text-navy-600"><Money value={p.quotedPrice} /></td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
