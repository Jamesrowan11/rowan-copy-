import Link from "next/link";
import { fmtDateTime } from "@/components/portal/ui";
import { ReplyForm } from "@/components/portal/ReplyForm";

type Msg = {
  id: string;
  body: string;
  createdAt: Date;
  senderId: string | null;
  sender: { name: string; role: string } | null;
};

export function ThreadView({
  threadId,
  subject,
  messages,
  meId,
  basePath,
  clientView = false,
}: {
  threadId: string;
  subject: string;
  messages: Msg[];
  meId: string;
  basePath: string;
  clientView?: boolean;
}) {
  return (
    <div>
      <div className="mb-4">
        <Link href={basePath} className="text-sm text-navy-500 hover:text-navy">
          ← All messages
        </Link>
      </div>
      <h1 className="mb-4 text-2xl font-700 text-navy">{subject}</h1>

      <div className="card mb-4 max-h-[55vh] space-y-4 overflow-y-auto p-5">
        {messages.map((m) => {
          const mine = m.senderId === meId;
          const who = mine
            ? "You"
            : clientView
              ? "Rowan Copy"
              : m.sender?.name ?? "Unknown";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  mine
                    ? "bg-navy text-white"
                    : "border border-navy-100 bg-navy-50/60 text-navy-700"
                }`}
              >
                <p className={`mb-1 text-xs ${mine ? "text-navy-200" : "text-navy-400"}`}>
                  {who} · {fmtDateTime(m.createdAt)}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <ReplyForm threadId={threadId} />
    </div>
  );
}
