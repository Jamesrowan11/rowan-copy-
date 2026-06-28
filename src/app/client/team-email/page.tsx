import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { removeTeammate } from "@/server/mail-workspace";
import { OwnMailboxForm, AddTeammateForm } from "./TeamEmailForms";

export const dynamic = "force-dynamic";

export default async function ClientTeamEmailPage() {
  const session = await requireRole("CLIENT");
  const me = await prisma.user.findUnique({ where: { id: session.id } });
  // Only customers with the switch on can see this.
  if (!me || !me.mailAdmin || !me.mailDomain) redirect("/client/email");
  const domain = me.mailDomain;

  const [ownMailboxes, team] = await Promise.all([
    prisma.mailbox.findMany({ where: { ownerId: me.id, active: true }, select: { id: true, address: true } }),
    prisma.user.findMany({
      where: { mailWorkspaceOwnerId: me.id },
      orderBy: { name: "asc" },
      include: { mailboxes: { select: { address: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Team email"
        description={`Manage mailboxes on ${domain} — yours and your team's.`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Your own mailbox */}
        <div>
          <h2 className="mb-3 text-sm font-600 uppercase tracking-wide text-navy-400">Your mailbox</h2>
          {ownMailboxes.length > 0 ? (
            <div className="card p-6">
              <p className="font-600 text-navy">{ownMailboxes[0].address}</p>
              <p className="mt-1 text-sm text-navy-500">Your mailbox is ready.</p>
              <div className="mt-3 flex gap-2">
                <Link href="/client/mail" className="btn-primary btn-sm">Open inbox</Link>
                <Link href="/client/mail/settings" className="btn-outline btn-sm">Settings</Link>
              </div>
            </div>
          ) : (
            <OwnMailboxForm domain={domain} />
          )}
        </div>

        {/* Add a teammate */}
        <div>
          <h2 className="mb-3 text-sm font-600 uppercase tracking-wide text-navy-400">Add to your team</h2>
          <AddTeammateForm domain={domain} />
        </div>
      </div>

      {/* Team list */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-600 uppercase tracking-wide text-navy-400">Your team ({team.length})</h2>
        {team.length === 0 ? (
          <EmptyState>No teammates yet. Add one above to give them a mailbox and a portal login.</EmptyState>
        ) : (
          <div className="card divide-y divide-navy-100 p-0">
            {team.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-600 text-navy">{t.name}</p>
                  <p className="text-xs text-navy-400">{t.mailboxes.map((m) => m.address).join(", ") || t.email}</p>
                </div>
                <ConfirmButton
                  action={removeTeammate.bind(null, t.id)}
                  confirm={`Remove ${t.name}? This deletes their mailbox on the server and their portal login. This cannot be undone.`}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </ConfirmButton>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
