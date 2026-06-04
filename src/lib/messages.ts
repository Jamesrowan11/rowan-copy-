import { prisma } from "@/lib/prisma";

/** Count threads with at least one message the user hasn't read yet. */
export async function getUnreadThreadCount(userId: string): Promise<number> {
  const parts = await prisma.threadParticipant.findMany({
    where: { userId },
    include: {
      thread: {
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  let count = 0;
  for (const p of parts) {
    const last = p.thread.messages[0];
    if (!last) continue;
    // Unread if the latest message is from someone else and is newer than
    // the user's lastReadAt (or they've never read it).
    if (last.senderId === userId) continue;
    if (!p.lastReadAt || last.createdAt > p.lastReadAt) count++;
  }
  return count;
}

/** Returns the thread if the user participates in it, else null (server-enforced). */
export async function getThreadForUser(threadId: string, userId: string) {
  const part = await prisma.threadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId } },
  });
  if (!part) return null;
  return prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      participants: { include: { user: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: true },
      },
    },
  });
}

/** List a user's threads (newest activity first) with unread flag + preview. */
export async function listThreadsForUser(userId: string) {
  const parts = await prisma.threadParticipant.findMany({
    where: { userId },
    include: {
      thread: {
        include: {
          participants: { include: { user: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  return parts
    .map((p) => {
      const last = p.thread.messages[0];
      const unread =
        !!last &&
        last.senderId !== userId &&
        (!p.lastReadAt || last.createdAt > p.lastReadAt);
      return {
        id: p.thread.id,
        subject: p.thread.subject,
        updatedAt: p.thread.updatedAt,
        last,
        unread,
        participants: p.thread.participants.map((tp) => tp.user),
      };
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function markThreadRead(threadId: string, userId: string) {
  await prisma.threadParticipant.updateMany({
    where: { threadId, userId },
    data: { lastReadAt: new Date() },
  });
}
