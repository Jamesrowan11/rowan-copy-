"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { addSubdomain } from "@/server/domains";

type Result = { ok: boolean; error?: string; info?: string };

export function AddSubdomainForm({ parentDomain }: { parentDomain: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addSubdomain, { ok: false } as Result);

  if (state.ok && open) {
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return <button className="btn-primary" onClick={() => setOpen(true)}>+ Add subdomain</button>;
  }

  return (
    <form action={action} className="card w-full space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-600 text-navy">Add a subdomain</h2>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      <div>
        <label className="label" htmlFor="label">Subdomain</label>
        <div className="flex items-center gap-2">
          <input
            id="label"
            name="label"
            className="input"
            placeholder="shop"
            pattern="[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?"
            title="Lowercase letters, numbers, and hyphens"
            required
          />
          <span className="whitespace-nowrap text-sm text-navy-400">.{parentDomain}</span>
        </div>
        <p className="mt-1 text-xs text-navy-400">
          Creates the subdomain on the server with a placeholder page. Wildcard DNS and Plesk
          auto-SSL make it resolve over HTTPS automatically.
        </p>
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create subdomain"}
      </button>
    </form>
  );
}
