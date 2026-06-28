"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { approveMailboxRequest, denyMailboxRequest } from "@/server/mailbox-requests";

type Result = { ok: boolean; error?: string; info?: string };

export function RequestDecision({
  id,
  defaultLocal,
  domain,
}: {
  id: string;
  defaultLocal: string;
  domain: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "approve" | "deny">("idle");
  const [approveState, approveAction, approving] = useActionState(approveMailboxRequest, { ok: false } as Result);
  const [denyState, denyAction, denying] = useActionState(denyMailboxRequest, { ok: false } as Result);

  if (approveState.ok || denyState.ok) router.refresh();

  if (mode === "idle") {
    return (
      <div className="flex items-center gap-2">
        <button className="btn-primary btn-sm" onClick={() => setMode("approve")}>Approve</button>
        <button className="btn-outline btn-sm" onClick={() => setMode("deny")}>Deny</button>
      </div>
    );
  }

  if (mode === "approve") {
    return (
      <form action={approveAction} className="w-full max-w-md space-y-2 rounded-lg border border-navy-100 p-3">
        <input type="hidden" name="id" value={id} />
        {approveState.error && <p className="text-xs text-red-600">{approveState.error}</p>}
        <div className="flex items-center gap-2">
          <input name="desiredLocal" className="input" defaultValue={defaultLocal}
            pattern="[a-z0-9]([a-z0-9._-]{0,38}[a-z0-9])?" title="Lowercase letters, numbers, dots, or hyphens" required />
          <span className="whitespace-nowrap text-xs text-navy-400">@{domain}</span>
        </div>
        <input name="password" type="password" className="input" placeholder="Initial password (8+ chars)"
          minLength={8} autoComplete="new-password" required />
        <p className="text-xs text-navy-400">
          Creates the mailbox on the server and assigns it. Share this password with the client; they can change their signature anytime.
        </p>
        <div className="flex items-center gap-2">
          <button type="submit" className="btn-primary btn-sm" disabled={approving}>
            {approving ? "Creating…" : "Create & assign"}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setMode("idle")}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <form action={denyAction} className="w-full max-w-md space-y-2 rounded-lg border border-navy-100 p-3">
      <input type="hidden" name="id" value={id} />
      {denyState.error && <p className="text-xs text-red-600">{denyState.error}</p>}
      <input name="decisionNote" className="input" placeholder="Reason (optional, shown to the client)" />
      <div className="flex items-center gap-2">
        <button type="submit" className="btn-danger btn-sm" disabled={denying}>
          {denying ? "Saving…" : "Confirm deny"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setMode("idle")}>Cancel</button>
      </div>
    </form>
  );
}
