import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { getThreadForUser, markThreadRead } from "@/lib/messages";
import { ThreadView } from "@/components/portal/ThreadView";

export default async function ClientThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireRole("CLIENT");
  const { id } = await params;
  const thread = await getThreadForUser(id, me.id);
  if (!thread) notFound();
  await markThreadRead(id, me.id);

  return (
    <ThreadView
      threadId={thread.id}
      subject={thread.subject}
      meId={me.id}
      basePath="/client/messages"
      clientView
      messages={thread.messages.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        senderId: m.senderId,
        sender: m.sender ? { name: m.sender.name, role: m.sender.role } : null,
      }))}
    />
  );
}
