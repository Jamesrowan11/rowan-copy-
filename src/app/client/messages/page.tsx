import { requireRole } from "@/lib/authz";
import { listThreadsForUser } from "@/lib/messages";
import { PageHeader } from "@/components/portal/ui";
import { MessagesPanel } from "@/components/portal/MessagesPanel";

export default async function ClientMessagesPage() {
  const me = await requireRole("CLIENT");
  const threads = await listThreadsForUser(me.id);

  return (
    <>
      <PageHeader title="Messages" description="Your conversations with Rowan Copy." />
      <MessagesPanel
        threads={threads.map((t) => ({
          id: t.id,
          subject: t.subject,
          updatedAt: t.updatedAt,
          unread: t.unread,
          last: t.last ? { body: t.last.body, senderId: t.last.senderId } : null,
          participants: t.participants.map((p) => ({ id: p.id, name: p.name, role: p.role })),
        }))}
        basePath="/client/messages"
        recipients={[]}
        isClient={true}
      />
    </>
  );
}
