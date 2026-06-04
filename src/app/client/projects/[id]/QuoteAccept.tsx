"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptQuote } from "../../actions";

type LineItem = { id: string; label: string; quantity: number; unitPrice: number };

export function QuoteAccept({
  quote,
}: {
  quote: { id: string; title: string; status: string; notes: string | null; lineItems: LineItem[] };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const total = quote.lineItems.reduce((s, li) => s + li.unitPrice * li.quantity, 0);

  return (
    <section className="card border-accent/40 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-600 text-navy">{quote.title}</h2>
        <span className={`badge ${quote.status === "Accepted" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
          {quote.status}
        </span>
      </div>
      {quote.notes && <p className="mb-3 text-sm text-navy-600">{quote.notes}</p>}
      <ul className="space-y-1 text-sm">
        {quote.lineItems.map((li) => (
          <li key={li.id} className="flex justify-between">
            <span className="text-navy-600">{li.label} × {li.quantity}</span>
            <span className="text-navy-700">${(li.unitPrice * li.quantity).toLocaleString()}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-navy-100 pt-2 text-right font-600 text-navy">
        Total: ${total.toLocaleString()}
      </p>

      {quote.status === "Sent" && (
        <div className="mt-4">
          <button
            className="btn-primary"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Accept this quote? This confirms you'd like to proceed.")) return;
              start(async () => {
                const res = await acceptQuote(quote.id);
                if (!res.ok) setError(res.error || "Failed");
                else router.refresh();
              });
            }}
          >
            {pending ? "Accepting…" : "Accept quote"}
          </button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}
      {quote.status === "Accepted" && (
        <p className="mt-3 text-sm text-emerald-600">You accepted this quote — thank you! We&apos;re on it.</p>
      )}
    </section>
  );
}
