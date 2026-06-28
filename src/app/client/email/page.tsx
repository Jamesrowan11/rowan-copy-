import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatusBadge, fmtDate } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { cancelMailboxRequest } from "@/server/mailbox-requests";
import { RequestMailboxForm } from "./RequestMailboxForm";

export const dynamic = "force-dynamic";

const MAIL_DOMAIN = process.env.DEMO_DOMAIN || "rowancopy.com";

export default async function ClientEmailPage() {
  const user = await requireRole("CLIENT");

  const [requests, mailboxes] = await Promise.all([
    prisma.mailboxRequest.findMany({
      where: { requesterId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mailbox.findMany({
      where: { ownerId: user.id, active: true },
      orderBy: { address: "asc" },
      select: { id: true, address: true },
    }),
  ]);

  const hasPending = requests.some((r) => r.status === "Pending");

  return (
    <>
      <PageHeader
        title="Email account"
        description="Request and manage your Rowan Copy email — all in one place."
      />

      {mailboxes.length > 0 && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          You have an active mailbox:{" "}
          {mailboxes.map((m) => <strong key={m.id}>{m.address}</strong>)}.{" "}
          <Link href="/client/mail" className="font-600 underline">Open your inbox →</Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {!hasPending && <RequestMailboxForm domain={MAIL_DOMAIN} />}

        <div>
          <h2 className="mb-3 text-sm font-600 uppercase tracking-wide text-navy-400">Your requests</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-navy-400">No requests yet.</p>
          ) : (
            <div className="card divide-y divide-navy-100 p-0">
              {requests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-600 text-navy">{r.desiredLocal}@{r.domain}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-navy-400">
                      Requested {fmtDate(r.createdAt)}
                      {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                    </p>
                  </div>
                  {r.status === "Pending" && (
                    <ConfirmButton
                      action={cancelMailboxRequest.bind(null, r.id)}
                      confirm="Cancel this email request?"
                      className="text-xs text-red-500 hover:underline"
                    >
                      Cancel
                    </ConfirmButton>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
