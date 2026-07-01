"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { generateCampaign } from "@/server/ads";

type Result = { ok: boolean; error?: string; info?: string };
type ClientOption = { id: string; name: string };

export function AdGeneratorForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(generateCampaign, { ok: false } as Result);

  if (state.ok) router.refresh();

  return (
    <form action={action} className="card space-y-4 p-6">
      <h2 className="text-lg font-600 text-navy">New ad campaign</h2>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && state.info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.info}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="businessName">Business name</label>
          <input id="businessName" name="businessName" className="input" placeholder="Acme Plumbing" required />
        </div>
        <div>
          <label className="label" htmlFor="clientId">Link to a client (optional)</label>
          <select id="clientId" name="clientId" className="input" defaultValue="">
            <option value="">— none / one-off —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-navy-400">Pulls their brand voice if set.</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="offer">What are you advertising?</label>
        <textarea id="offer" name="offer" rows={2} className="input" placeholder="Emergency drain cleaning — 24/7, same-day service, upfront pricing." required />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="platform">Platform</label>
          <select id="platform" name="platform" className="input" defaultValue="Both">
            <option value="Both">Google + Meta</option>
            <option value="Google">Google only</option>
            <option value="Meta">Meta only</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="objective">Objective</label>
          <input id="objective" name="objective" className="input" placeholder="Leads / Calls / Sales" />
        </div>
        <div>
          <label className="label" htmlFor="budget">Budget (optional)</label>
          <input id="budget" name="budget" className="input" placeholder="$25/day" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="audience">Target audience</label>
          <input id="audience" name="audience" className="input" placeholder="Homeowners 30–65 near Columbia, MD" />
        </div>
        <div>
          <label className="label" htmlFor="cta">Call to action</label>
          <input id="cta" name="cta" className="input" placeholder="Call now / Get a free quote" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="keyPoints">Key selling points (optional)</label>
        <textarea id="keyPoints" name="keyPoints" rows={2} className="input" placeholder="Licensed & insured, 5-star reviews, 20 years local, free estimates" />
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Writing ads…" : "Generate ads"}
      </button>
    </form>
  );
}
