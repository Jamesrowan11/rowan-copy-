"use client";

import { useActionState } from "react";
import { submitReview, type ReviewState } from "./actions";

export function ReviewForm({ token, defaultName }: { token: string; defaultName: string }) {
  const [state, action, pending] = useActionState(submitReview, { ok: false } as ReviewState);

  if (state.ok) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-2xl text-accent-hover">★</div>
        <h2 className="text-2xl font-600 text-navy">Thank you!</h2>
        <p className="mt-2 text-navy-600">Your review means a lot. We may feature it on the site.</p>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-7">
      <input type="hidden" name="token" value={token} />
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <div>
        <label className="label" htmlFor="authorName">Your name</label>
        <input id="authorName" name="authorName" className="input" defaultValue={defaultName} required />
      </div>
      <div>
        <label className="label" htmlFor="business">Business (optional)</label>
        <input id="business" name="business" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="rating">Rating</label>
        <select id="rating" name="rating" className="input" defaultValue="5">
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="body">Your review</label>
        <textarea id="body" name="body" rows={5} className="input" required placeholder="What was it like working with Rowan Copy?" />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
