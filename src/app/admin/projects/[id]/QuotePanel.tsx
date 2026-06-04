"use client";

import { ActionForm } from "@/components/portal/ActionForm";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import {
  createQuote,
  addQuoteLineItem,
  deleteQuoteLineItem,
  sendQuote,
  deleteQuote,
} from "../../actions";
import { SERVICES } from "@/lib/constants";

type LineItem = { id: string; label: string; quantity: number; unitPrice: number };
type Quote = {
  id: string;
  title: string;
  status: string;
  notes: string | null;
  lineItems: LineItem[];
} | null;

export function QuotePanel({
  projectId,
  quote,
}: {
  projectId: string;
  quote: Quote;
}) {
  if (!quote) {
    return (
      <section className="card p-5">
        <h2 className="mb-3 text-lg font-600 text-navy">Quote / proposal</h2>
        <ActionForm action={createQuote} hidden={{ projectId }} submitText="Start a quote">
          <input name="title" className="input" placeholder="Quote title (optional)" />
          <textarea name="notes" rows={2} className="input" placeholder="Notes (optional)" />
        </ActionForm>
      </section>
    );
  }

  const total = quote.lineItems.reduce((s, li) => s + li.unitPrice * li.quantity, 0);
  const editable = quote.status === "Draft";

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-600 text-navy">Quote / proposal</h2>
        <span className={`badge ${
          quote.status === "Accepted" ? "bg-emerald-100 text-emerald-700"
          : quote.status === "Sent" ? "bg-blue-100 text-blue-700"
          : "bg-navy-100 text-navy-600"
        }`}>{quote.status}</span>
      </div>

      <ul className="space-y-1 text-sm">
        {quote.lineItems.map((li) => (
          <li key={li.id} className="flex items-center justify-between gap-2">
            <span className="text-navy-600">{li.label} × {li.quantity}</span>
            <span className="flex items-center gap-2 text-navy-700">
              ${(li.unitPrice * li.quantity).toLocaleString()}
              {editable && (
                <ConfirmButton action={deleteQuoteLineItem.bind(null, li.id)} confirm="Remove this line?" className="text-xs text-red-500 hover:underline">×</ConfirmButton>
              )}
            </span>
          </li>
        ))}
        {quote.lineItems.length === 0 && <li className="text-sm text-navy-400">No line items yet.</li>}
      </ul>
      <p className="mt-2 border-t border-navy-100 pt-2 text-right text-sm font-600 text-navy">
        Total: ${total.toLocaleString()}
      </p>

      {editable && (
        <div className="mt-4 border-t border-navy-100 pt-4">
          <ActionForm action={addQuoteLineItem} hidden={{ quoteId: quote.id, projectId }} submitText="Add line item" resetOnSuccess className="space-y-2">
            <input name="label" className="input" placeholder="Description" required list="published-prices" />
            <datalist id="published-prices">
              {SERVICES.map((s) => <option key={s.type} value={s.name} />)}
            </datalist>
            <div className="grid grid-cols-2 gap-2">
              <input name="quantity" type="number" min="1" defaultValue={1} className="input" placeholder="Qty" />
              <input name="unitPrice" type="number" min="0" step="1" className="input" placeholder="Unit price" required
                list="price-values" />
              <datalist id="price-values">
                {SERVICES.filter((s) => s.priceValue).map((s) => <option key={s.type} value={String(s.priceValue)} />)}
              </datalist>
            </div>
          </ActionForm>

          <div className="mt-3 flex gap-3">
            <ConfirmButton action={sendQuote.bind(null, quote.id)} confirm="Send this quote to the client?" className="btn-primary btn-sm">
              Send to client
            </ConfirmButton>
            <ConfirmButton action={deleteQuote.bind(null, quote.id)} confirm="Delete this quote?" className="text-xs text-red-500 hover:underline">
              Delete quote
            </ConfirmButton>
          </div>
        </div>
      )}
    </section>
  );
}
