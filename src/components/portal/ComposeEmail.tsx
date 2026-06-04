"use client";

import { useActionState, useRef, useEffect } from "react";
import { composeEmail } from "@/server/compose";
import { CountedTextarea } from "@/components/portal/CountedTextarea";
import { ROLE_LABELS } from "@/lib/constants";

type Recipient = { id: string; name: string; email: string; role: string };
type Result = { ok: boolean; error?: string; sentCount?: number };

export function ComposeEmail({ recipients }: { recipients: Recipient[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(composeEmail, { ok: false } as Result);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  const grouped = {
    ADMIN: recipients.filter((r) => r.role === "ADMIN"),
    EMPLOYEE: recipients.filter((r) => r.role === "EMPLOYEE"),
    CLIENT: recipients.filter((r) => r.role === "CLIENT"),
  };

  return (
    <form ref={formRef} action={action} className="card space-y-4 p-6">
      {state.ok && (
        <p className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          Sent to {state.sentCount} recipient{state.sentCount === 1 ? "" : "s"}. The
          company signature was appended automatically.
        </p>
      )}
      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{state.error}</p>
      )}

      <div>
        <label className="label">Portal recipients</label>
        <div className="max-h-48 overflow-y-auto rounded-xl border border-navy-200 p-3">
          {(["ADMIN", "EMPLOYEE", "CLIENT"] as const).map((role) =>
            grouped[role].length ? (
              <fieldset key={role} className="mb-3 last:mb-0">
                <legend className="mb-1 text-xs font-600 uppercase tracking-wide text-navy-400">
                  {ROLE_LABELS[role]}s
                </legend>
                <div className="grid gap-1 sm:grid-cols-2">
                  {grouped[role].map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm text-navy-700">
                      <input type="checkbox" name="userIds" value={r.id} className="rounded" />
                      {r.name} <span className="text-navy-400">({r.email})</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null,
          )}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="typed">Or type addresses (comma-separated)</label>
        <input id="typed" name="typed" className="input" placeholder="someone@example.com, another@example.com" />
      </div>

      <div>
        <label className="label" htmlFor="subject">Subject</label>
        <input id="subject" name="subject" className="input" required />
      </div>

      <div>
        <label className="label" htmlFor="body">Message</label>
        <CountedTextarea id="body" name="body" rows={8} required
          placeholder="Write your email. The Rowan Copy signature is added automatically." />
      </div>

      <p className="text-xs text-navy-400">Up to 25 recipients per send.</p>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Send email"}
      </button>
    </form>
  );
}
