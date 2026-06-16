"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { sendMail } from "@/server/mail";

type Result = { ok: boolean; error?: string };

export function ComposeForm({
  mailboxId,
  fromAddress,
  backHref,
  defaults,
  title = "New message",
}: {
  mailboxId: string;
  fromAddress: string;
  backHref: string;
  title?: string;
  defaults?: {
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
    inReplyTo?: string;
    references?: string;
  };
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(sendMail, { ok: false } as Result);

  useEffect(() => {
    if (state.ok) router.push(backHref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="card p-6">
      <input type="hidden" name="mailboxId" value={mailboxId} />
      <input type="hidden" name="inReplyTo" value={defaults?.inReplyTo ?? ""} />
      <input type="hidden" name="references" value={defaults?.references ?? ""} />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-600 text-navy">{title}</h2>
        <Link href={backHref} className="btn-ghost btn-sm">Cancel</Link>
      </div>

      {state.error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="w-14 text-navy-400">From</span>
          <span className="font-600 text-navy">{fromAddress}</span>
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" name="to" className="input" placeholder="name@example.com, another@example.com"
            defaultValue={defaults?.to ?? ""} required />
        </div>
        <div>
          <label className="label" htmlFor="cc">Cc (optional)</label>
          <input id="cc" name="cc" className="input" defaultValue={defaults?.cc ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="subject">Subject</label>
          <input id="subject" name="subject" className="input" defaultValue={defaults?.subject ?? ""} required />
        </div>
        <div>
          <label className="label" htmlFor="body">Message</label>
          <textarea id="body" name="body" rows={12} className="input"
            placeholder="Write your email — your signature is added automatically."
            defaultValue={defaults?.body ?? ""} required />
        </div>
      </div>

      <div className="mt-4">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
