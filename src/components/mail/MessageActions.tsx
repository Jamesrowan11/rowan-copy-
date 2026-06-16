"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markMessageRead, deleteMailMessage } from "@/server/mail";

export function MessageActions({
  mailboxId,
  folder,
  uid,
  seen,
  listHref,
}: {
  mailboxId: string;
  folder: string;
  uid: number;
  seen: boolean;
  listHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-outline btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await markMessageRead(mailboxId, folder, uid, !seen);
            if (!res.ok) setError(res.error || "Failed");
            else router.refresh();
          })
        }
      >
        Mark {seen ? "unread" : "read"}
      </button>
      <button
        type="button"
        className="btn-danger btn-sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Move this message to Trash?")) return;
          start(async () => {
            const res = await deleteMailMessage(mailboxId, folder, uid);
            if (!res.ok) setError(res.error || "Failed");
            else router.push(listHref);
          });
        }}
      >
        Delete
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
