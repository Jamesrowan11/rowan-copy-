"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createOwnMailbox, addTeammate } from "@/server/mail-workspace";

type Result = { ok: boolean; error?: string; info?: string };

function LocalField({ domain, label = "Address" }: { domain: string; label?: string }) {
  return (
    <div>
      <label className="label" htmlFor="local">{label}</label>
      <div className="flex items-center gap-2">
        <input id="local" name="local" className="input" placeholder="name"
          pattern="[a-z0-9]([a-z0-9._-]{0,38}[a-z0-9])?" title="Lowercase letters, numbers, dots, or hyphens" required />
        <span className="whitespace-nowrap text-sm text-navy-400">@{domain}</span>
      </div>
    </div>
  );
}

export function OwnMailboxForm({ domain }: { domain: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createOwnMailbox, { ok: false } as Result);
  if (state.ok) router.refresh();
  return (
    <form action={action} className="card space-y-4 p-6">
      <h2 className="text-lg font-600 text-navy">Create your mailbox</h2>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <LocalField domain={domain} />
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" minLength={8}
          autoComplete="new-password" placeholder="At least 8 characters" required />
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create my mailbox"}
      </button>
    </form>
  );
}

export function AddTeammateForm({ domain }: { domain: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addTeammate, { ok: false } as Result);
  if (state.ok) router.refresh();
  return (
    <form action={action} className="card space-y-4 p-6">
      <h2 className="text-lg font-600 text-navy">Add a teammate</h2>
      <p className="text-sm text-navy-500">
        Creates their mailbox and a portal login. They sign in with their new email address and the password you set.
      </p>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && state.info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.info}</p>}
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" name="name" className="input" placeholder="Jordan Smith" required />
      </div>
      <LocalField domain={domain} label="Their email address" />
      <div>
        <label className="label" htmlFor="password">Initial password</label>
        <input id="password" name="password" type="password" className="input" minLength={8}
          autoComplete="new-password" placeholder="At least 8 characters" required />
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add teammate"}
      </button>
    </form>
  );
}
