import Link from "next/link";
import { EmptyState, fmtDateTime } from "@/components/portal/ui";
import { NewThreadForm } from "@/components/portal/NewThreadForm";

type Recipient = { id: string; name: string; email: string; role: string };

type ThreadSummary = {
  id: string;
  subject: string;
  updatedAt: Date;
  unread: boolean;
  last: { body: string; senderId: string | null } | null;
  participants: { id: string; name: string; role: string }[];
};

export function MessagesPanel({
  threads,
  basePath,
  recipients,
  isClient,
}: {
  threads: ThreadSummary[];
  basePath: string;
  recipients: Recipient[];
  isClient: boolean;
}) {
  return (
    <div className="space-y-5">
      <NewThreadForm basePath={basePath} recipients={recipients} isClient={isClient} />

      {threads.length === 0 ? (
        <EmptyState>No conversations yet.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {threads.map((t) => {
            const others = isClient
              ? "Rowan Copy"
              : t.participants
                  .filter((p) => p.role !== "ADMIN" || t.participants.length <= 2)
                  .map((p) => p.name)
                  .join(", ");
            return (
              <li key={t.id}>
                <Link
                  href={`${basePath}/${t.id}`}
                  className={`block rounded-xl border p-4 transition-colors hover:border-navy-300 ${
                    t.unread ? "border-accent/40 bg-accent-soft/40" : "border-navy-100 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-600 text-navy">
                      {t.unread && (
                        <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" />
                      )}
                      {t.subject}
                    </p>
                    <span className="shrink-0 text-xs text-navy-400">{fmtDateTime(t.updatedAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-navy-500">
                    {others ? `${others} · ` : ""}
                    {t.last?.body ?? "No messages yet"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
