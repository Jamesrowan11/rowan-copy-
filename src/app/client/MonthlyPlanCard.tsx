"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestMonthlyUpdate } from "./actions";

export function MonthlyPlanCard({
  active,
  renewalLabel,
}: {
  active: boolean;
  renewalLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!active) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-600 text-navy">Monthly plan</h2>
        <p className="mt-2 text-sm text-navy-600">
          You&apos;re not on the $30/month hosting + upkeep plan. Want hosting, your
          domain, and minor content updates handled for you? Message us or email{" "}
          <a href="mailto:landen@rowancopy.com" className="link">landen@rowancopy.com</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-600 text-navy">Monthly plan</h2>
        <span className="badge bg-emerald-100 text-emerald-700">Active</span>
      </div>
      <p className="mt-2 text-sm text-navy-600">Renews on {renewalLabel}.</p>
      <button
        className="btn-primary btn-sm mt-4"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await requestMonthlyUpdate();
            if (res.ok) {
              setMsg("Got it — we'll be in touch about your update.");
              router.refresh();
            } else setMsg(res.error || "Something went wrong.");
          })
        }
      >
        {pending ? "Sending…" : "Request an update"}
      </button>
      {msg && <p className="mt-2 text-sm text-emerald-600">{msg}</p>}
    </div>
  );
}
