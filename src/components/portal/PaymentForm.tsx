"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { addPayment } from "@/app/admin/actions";

type Result = { ok: boolean; error?: string };

export function PaymentForm({
  clientId,
  projectId,
}: {
  clientId: string;
  projectId?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(addPayment, { ok: false } as Result);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      formRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="description" className="input" placeholder="Description (e.g. Deposit)" required />
        <input name="amount" type="number" min="0" step="0.01" className="input" placeholder="Amount (optional)" />
      </div>
      <input name="stripeUrl" type="url" className="input" placeholder="https://buy.stripe.com/…" required />
      <label className="flex items-center gap-2 text-sm text-navy-600">
        <input type="checkbox" name="notify" defaultChecked className="rounded" />
        Email the client this payment link
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? "Adding…" : "Add payment link"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
