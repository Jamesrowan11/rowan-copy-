import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState, StatusBadge, fmtDateTime } from "@/components/portal/ui";
import { RequestDecision } from "./RequestDecision";

export const dynamic = "force-dynamic";

export default async function AdminMailboxRequestsPage() {
  await requireAdmin();
  const requests = await prisma.mailboxRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { requester: { select: { name: true, email: true } } },
  });

  const pending = requests.filter((r) => r.status === "Pending");
  const decided = requests.filter((r) => r.status !== "Pending");

  return (
    <>
      <PageHeader
        title="Mailbox requests"
        description="Clients request an email account here. Approve to create their mailbox on the server, or deny."
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-600 uppercase tracking-wide text-navy-400">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <EmptyState>No pending requests.</EmptyState>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <div key={r.id} className="card flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-600 text-navy">{r.desiredLocal}@{r.domain}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-navy-400">
                      {r.requester.name} ({r.requester.email}) · {fmtDateTime(r.createdAt)}
                    </p>
                    {r.note && <p className="mt-1 text-sm text-navy-600">“{r.note}”</p>}
                  </div>
                  <RequestDecision id={r.id} defaultLocal={r.desiredLocal} domain={r.domain} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-600 uppercase tracking-wide text-navy-400">Decided</h2>
        {decided.length === 0 ? (
          <EmptyState>Nothing decided yet.</EmptyState>
        ) : (
          <div className="card divide-y divide-navy-100 p-0">
            {decided.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-600 text-navy">{r.desiredLocal}@{r.domain}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-navy-400">
                    {r.requester.name} · {r.decidedAt ? fmtDateTime(r.decidedAt) : ""}
                    {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
