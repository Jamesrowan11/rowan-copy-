"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { requestMailbox } from "@/server/mailbox-requests";

type Result = { ok: boolean; error?: string; info?: string };

export function RequestMailboxForm({ domain }: { domain: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(requestMailbox, { ok: false } as Result);

  if (state.ok) router.refresh();

  return (
    <form action={action} className="card space-y-4 p-6">
      <h2 className="text-lg font-600 text-navy">Request an email account</h2>
      <p className="text-sm text-navy-500">
        Ask for your own <strong>@{domain}</strong> mailbox. An admin will review and set it up —
        you&apos;ll then read and send mail right here in the portal.
      </p>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && state.info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.info}</p>}

      <div>
        <label className="label" htmlFor="desiredLocal">Address you&apos;d like</label>
        <div className="flex items-center gap-2">
          <input
            id="desiredLocal"
            name="desiredLocal"
            className="input"
            placeholder="yourname"
            pattern="[a-z0-9]([a-z0-9._-]{0,38}[a-z0-9])?"
            title="Lowercase letters, numbers, dots, or hyphens"
            required
          />
          <span className="whitespace-nowrap text-sm text-navy-400">@{domain}</span>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="note">Note (optional)</label>
        <textarea id="note" name="note" rows={2} className="input" placeholder="Anything we should know?" />
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
