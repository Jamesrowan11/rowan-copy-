"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { addDnsRecord } from "@/server/dns";

type Result = { ok: boolean; error?: string; info?: string };
const TYPES = ["A", "AAAA", "CNAME", "TXT"] as const;

const PLACEHOLDER: Record<string, string> = {
  A: "192.0.2.1",
  AAAA: "2001:db8::1",
  CNAME: "target.example.com",
  TXT: "v=spf1 include:_spf.example.com ~all",
};

export function AddDnsRecordForm({ domain }: { domain: string }) {
  const router = useRouter();
  const [type, setType] = useState<string>("A");
  const [state, action, pending] = useActionState(addDnsRecord, { ok: false } as Result);

  if (state.ok) {
    // Refresh to show the new record, then let the success note linger.
    router.refresh();
  }

  return (
    <form action={action} className="card space-y-4 p-6">
      <input type="hidden" name="domain" value={domain} />
      <h2 className="text-lg font-600 text-navy">Add a record to {domain}</h2>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && state.info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.info}</p>}

      <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
        <div>
          <label className="label" htmlFor="type">Type</label>
          <select id="type" name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="host">Host / name</label>
          <input id="host" name="host" className="input" placeholder="@ for the root, or e.g. www" defaultValue="@" />
          <p className="mt-1 text-xs text-navy-400">Use <code>@</code> for the domain root, or a label like <code>www</code>.</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="value">Value</label>
        <input id="value" name="value" className="input" placeholder={PLACEHOLDER[type]} required />
        <p className="mt-1 text-xs text-navy-400">
          {type === "A" && "An IPv4 address this name should resolve to."}
          {type === "AAAA" && "An IPv6 address this name should resolve to."}
          {type === "CNAME" && "The canonical hostname this name should alias to."}
          {type === "TXT" && "Free-form text (SPF, DKIM, domain verification, …)."}
        </p>
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add record"}
      </button>
    </form>
  );
}
