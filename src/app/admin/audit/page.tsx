import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { PageHeader, EmptyState, fmtDateTime } from "@/components/portal/ui";

export default async function AuditLogPage() {
  await requireAdmin();
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 250,
    include: { actor: true },
  });

  return (
    <>
      <PageHeader title="Audit log" description="Who created, edited, or deleted key records." />
      {logs.length === 0 ? (
        <EmptyState>No activity recorded yet.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy-50/70 text-xs uppercase tracking-wide text-navy-500">
              <tr>
                <th className="px-4 py-3 font-600">When</th>
                <th className="px-4 py-3 font-600">Who</th>
                <th className="px-4 py-3 font-600">Action</th>
                <th className="px-4 py-3 font-600">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-navy-500">{fmtDateTime(l.createdAt)}</td>
                  <td className="px-4 py-2.5 text-navy-600">{l.actor?.name ?? "System"}</td>
                  <td className="px-4 py-2.5">
                    <span className="badge bg-navy-100 text-navy-600">{l.action}</span>
                    <span className="ml-1 text-xs text-navy-400">{l.entityType}</span>
                  </td>
                  <td className="px-4 py-2.5 text-navy-700">{l.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
