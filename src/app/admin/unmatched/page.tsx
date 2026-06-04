import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { PageHeader, EmptyState, fmtDateTime } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { deleteInboundEmail } from "../actions";

export default async function UnmatchedInboxPage() {
  await requireAdmin();
  const emails = await prisma.inboundEmail.findMany({
    where: { matched: false },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Unmatched inbox"
        description="Inbound emails we couldn't match to a portal user. Reply from your own email client, then clear."
      />
      {emails.length === 0 ? (
        <EmptyState>Nothing unmatched. Clean inbox.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {emails.map((e) => (
            <li key={e.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-600 text-navy">{e.subject}</p>
                  <p className="text-xs text-navy-500">
                    From <a href={`mailto:${e.fromEmail}`} className="link">{e.fromEmail}</a> · {fmtDateTime(e.createdAt)}
                  </p>
                </div>
                <ConfirmButton action={deleteInboundEmail.bind(null, e.id)} confirm="Clear this from the unmatched inbox?" className="text-xs text-red-500 hover:underline">Clear</ConfirmButton>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-navy-700">{e.body}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
