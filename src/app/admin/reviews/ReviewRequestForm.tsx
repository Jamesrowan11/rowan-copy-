"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { requestReview } from "../actions";

type Project = { id: string; title: string; clientName: string };
type Result = { ok: boolean; error?: string };

export function ReviewRequestForm({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(requestReview, { ok: false } as Result);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      ref.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-3">
      <select name="projectId" className="input" required defaultValue="">
        <option value="" disabled>Choose a project…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.title} — {p.clientName}</option>
        ))}
      </select>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? "Sending…" : "Email review request"}
        </button>
        {state.ok && <span className="text-sm text-emerald-600">Request sent.</span>}
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
