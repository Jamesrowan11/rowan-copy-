import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { PageHeader, EmptyState } from "@/components/portal/ui";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { UserCreateForm } from "./UserCreateForm";

export default async function AdminUsersPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { _count: { select: { projectsAsClient: true, projectsAsAssignee: true } } },
  });

  const groups: Record<Role, typeof users> = { ADMIN: [], EMPLOYEE: [], CLIENT: [] };
  for (const u of users) groups[u.role as Role].push(u);

  return (
    <>
      <PageHeader
        title="Users & team"
        description="Create, edit, deactivate, and manage every account."
        action={<UserCreateForm />}
      />

      {(["ADMIN", "EMPLOYEE", "CLIENT"] as Role[]).map((role) => (
        <section key={role} className="mb-8">
          <h2 className="mb-3 text-sm font-600 uppercase tracking-wide text-navy-500">
            {ROLE_LABELS[role]}s ({groups[role].length})
          </h2>
          {groups[role].length === 0 ? (
            <EmptyState>No {ROLE_LABELS[role].toLowerCase()}s yet.</EmptyState>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-navy-100">
                  {groups[role].map((u) => (
                    <tr key={u.id} className="hover:bg-navy-50/40">
                      <td className="px-4 py-3">
                        <Link href={`/admin/users/${u.id}`} className="font-600 text-navy hover:text-accent-hover">
                          {u.name}
                        </Link>
                        <div className="text-xs text-navy-400">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-navy-500">
                        {role === "CLIENT"
                          ? `${u._count.projectsAsClient} project(s)`
                          : `${u._count.projectsAsAssignee} assigned`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.active ? (
                          <span className="badge bg-emerald-100 text-emerald-700">Active</span>
                        ) : (
                          <span className="badge bg-red-100 text-red-700">Inactive</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </>
  );
}
