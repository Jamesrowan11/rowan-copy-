"use client";

import { useState, useTransition } from "react";
import { testMailbox } from "@/server/mail";

export function TestMailboxButton({ mailboxId }: { mailboxId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="btn-outline btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await testMailbox(mailboxId);
            setMsg({ ok: res.ok, text: res.ok ? res.info || "Connected." : res.error || "Failed." });
          })
        }
      >
        {pending ? "Testing…" : "Test connection"}
      </button>
      {msg && (
        <span className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</span>
      )}
    </div>
  );
}
