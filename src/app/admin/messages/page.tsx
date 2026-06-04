import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { listThreadsForUser } from "@/lib/messages";
import { PageHeader } from "@/components/portal/ui";
import { MessagesPanel } from "@/components/portal/MessagesPanel";

export default async function AdminMessagesPage() {
  const me = await requireAdmin();
  const threads = await listThreadsForUser(me.id);
  const recipients = await prisma.user.findMany({
    where: { active: true, NOT: { id: me.id } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });

  return (
    <>
      <PageHeader title="Messages" description="Every conversation across the studio." />
      <MessagesPanel
        threads={threads.map((t) => ({
          id: t.id,
          subject: t.subject,
          updatedAt: t.updatedAt,
          unread: t.unread,
          last: t.last ? { body: t.last.body, senderId: t.last.senderId } : null,
          participants: t.participants.map((p) => ({ id: p.id, name: p.name, role: p.role })),
        }))}
        basePath="/admin/messages"
        recipients={recipients}
        isClient={false}
      />
    </>
  );
}
