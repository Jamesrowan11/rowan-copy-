"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { postMessage } from "@/server/messaging";

type Result = { ok: boolean; error?: string };

export function ReplyForm({ threadId }: { threadId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(postMessage, { ok: false } as Result);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="threadId" value={threadId} />
      <textarea name="body" rows={3} className="input" placeholder="Write a reply…" required />
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? "Sending…" : "Send reply"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
