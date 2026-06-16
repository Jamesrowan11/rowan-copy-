"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createMailbox } from "@/server/mail";

type StaffOption = { id: string; name: string; role: string };
type Result = { ok: boolean; error?: string };

export function CreateMailboxForm({ staff }: { staff: StaffOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const [state, action, pending] = useActionState(createMailbox, { ok: false } as Result);

  if (state.ok && open) {
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return <button className="btn-primary" onClick={() => setOpen(true)}>+ Add mailbox</button>;
  }

  return (
    <form action={action} className="card w-full space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-600 text-navy">Add a mailbox</h2>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="address">Email address</label>
          <input id="address" name="address" type="email" className="input" placeholder="mara@rowancopy.com" required />
        </div>
        <div>
          <label className="label" htmlFor="displayName">Display name</label>
          <input id="displayName" name="displayName" className="input" placeholder="Mara Ellis — Rowan Copy" required />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-navy-700">
        <input type="checkbox" name="shared" className="rounded" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        Shared mailbox (e.g. info@rowancopy.com) — usable by all staff
      </label>

      {!shared && (
        <div>
          <label className="label" htmlFor="ownerId">Owner</label>
          <select id="ownerId" name="ownerId" className="input" defaultValue="">
            <option value="" disabled>Choose an employee or admin…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role.toLowerCase()})</option>)}
          </select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="host">Mail host</label>
          <input id="host" name="host" className="input" placeholder="rowancopy.com" />
          <p className="mt-1 text-xs text-navy-400">Used for both IMAP and SMTP unless overridden below.</p>
        </div>
        <div>
          <label className="label" htmlFor="username">Username</label>
          <input id="username" name="username" className="input" placeholder="(defaults to the email address)" />
        </div>
        <div>
          <label className="label" htmlFor="imapPort">IMAP port</label>
          <input id="imapPort" name="imapPort" type="number" className="input" defaultValue={993} />
        </div>
        <div>
          <label className="label" htmlFor="smtpPort">SMTP port</label>
          <input id="smtpPort" name="smtpPort" type="number" className="input" defaultValue={587} />
        </div>
      </div>

      <p className="text-xs text-navy-400">
        After creating it, the owner sets the mailbox password (encrypted) and a signature from their Mail settings.
      </p>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add mailbox"}
      </button>
    </form>
  );
}
