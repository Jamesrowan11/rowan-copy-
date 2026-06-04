"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveDraft, requestRevision } from "../../actions";

type Result = { ok: boolean; error?: string };

export function RevisionControls({
  projectId,
  remaining,
}: {
  projectId: string;
  remaining: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showRevise, setShowRevise] = useState(false);
  const [state, action] = useActionState(requestRevision, { ok: false } as Result);

  useEffect(() => {
    if (state.ok) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-navy-600">
        A draft is ready for your review. Approve it, or request changes.
        {remaining >= 0
          ? ` You have ${remaining} revision round${remaining === 1 ? "" : "s"} included.`
          : " You've used all included revision rounds — extra rounds may be billed."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary btn-sm"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Approve this draft? This marks the work approved.")) return;
            start(async () => {
              const res = await approveDraft(projectId);
              if (res.ok) router.refresh();
            });
          }}
        >
          Approve draft
        </button>
        <button className="btn-outline btn-sm" onClick={() => setShowRevise((v) => !v)}>
          Request changes
        </button>
      </div>

      {showRevise && (
        <form action={action} className="rounded-lg border border-navy-100 bg-navy-50/40 p-3">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="label" htmlFor="message">What would you like changed?</label>
          <textarea id="message" name="message" rows={3} className="input" required />
          <button type="submit" className="btn-navy btn-sm mt-2">Send revision request</button>
          {state.ok && state.error && (
            <p className="mt-2 text-sm text-amber-600">{state.error}</p>
          )}
          {state.ok && !state.error && (
            <p className="mt-2 text-sm text-emerald-600">Sent — we&apos;ll get on it.</p>
          )}
          {!state.ok && state.error && (
            <p className="mt-2 text-sm text-red-600">{state.error}</p>
          )}
        </form>
      )}
    </div>
  );
}
