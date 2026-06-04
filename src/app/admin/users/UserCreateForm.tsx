"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "../actions";
import { ROLES, ROLE_LABELS } from "@/lib/constants";

export function UserCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createUser, { ok: false });

  if (state.ok && open) {
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return <button className="btn-primary" onClick={() => setOpen(true)}>+ New user</button>;
  }

  return (
    <form action={action} className="card w-full space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-600 text-navy">New user / team member</h2>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="role">Role</label>
          <select id="role" name="role" className="input" defaultValue="CLIENT">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="password">Initial password</label>
          <input id="password" name="password" type="text" className="input" minLength={8} required placeholder="At least 8 characters" />
        </div>
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}
