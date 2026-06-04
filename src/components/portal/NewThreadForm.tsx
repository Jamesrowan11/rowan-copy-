"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startThread } from "@/server/messaging";
import { ROLE_LABELS } from "@/lib/constants";

type Recipient = { id: string; name: string; email: string; role: string };
type Result = { ok: boolean; error?: string; threadId?: string };

export function NewThreadForm({
  basePath,
  recipients,
  isClient,
}: {
  basePath: string;
  recipients: Recipient[];
  isClient: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(startThread, { ok: false } as Result);

  useEffect(() => {
    if (state.ok && state.threadId) {
      formRef.current?.reset();
      setOpen(false);
      router.push(`${basePath}/${state.threadId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!open) {
    return (
      <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>
        + New message
      </button>
    );
  }

  const grouped = {
    ADMIN: recipients.filter((r) => r.role === "ADMIN"),
    EMPLOYEE: recipients.filter((r) => r.role === "EMPLOYEE"),
    CLIENT: recipients.filter((r) => r.role === "CLIENT"),
  };

  return (
    <form ref={formRef} action={action} className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-600 text-navy">New message</h2>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      {isClient ? (
        <p className="rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-600">
          Your message goes to the Rowan Copy team.
        </p>
      ) : (
        <div>
          <label className="label">To</label>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-navy-200 p-3">
            {(["ADMIN", "EMPLOYEE", "CLIENT"] as const).map((role) =>
              grouped[role].length ? (
                <fieldset key={role} className="mb-2 last:mb-0">
                  <legend className="text-xs font-600 uppercase tracking-wide text-navy-400">
                    {ROLE_LABELS[role]}s
                  </legend>
                  {grouped[role].map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm text-navy-700">
                      <input type="checkbox" name="recipientIds" value={r.id} className="rounded" />
                      {r.name}
                    </label>
                  ))}
                </fieldset>
              ) : null,
            )}
          </div>
        </div>
      )}

      <input name="subject" className="input" placeholder="Subject" />
      <textarea name="body" rows={4} className="input" placeholder="Write your message…" required />
      <button type="submit" className="btn-primary btn-sm" disabled={pending}>
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
