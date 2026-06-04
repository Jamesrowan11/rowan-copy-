import type { Metadata } from "next";
import Link from "next/link";
import { SERVICES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Straightforward pricing for website copy, policies, captions, emails, and ongoing upkeep. One-time projects billed up front; the monthly plan billed monthly via Stripe.",
};

export default function PricingPage() {
  return (
    <div className="container-x py-16 md:py-20">
      <header className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-hover">
          Pricing
        </p>
        <h1 className="mt-2 text-4xl font-700 text-navy sm:text-5xl">
          Simple, honest pricing.
        </h1>
        <p className="mt-4 text-lg text-navy-600">
          Starting prices below. You&apos;ll always get a firm quote before any
          work begins, so the final number is never a surprise.
        </p>
      </header>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((s) => (
          <div key={s.type} className="card flex flex-col p-7">
            <h2 className="text-lg font-600 text-navy">{s.name}</h2>
            <p className="mt-2 font-heading text-3xl font-700 text-navy">
              {s.startingPrice.replace(/^from /, "")}
            </p>
            {s.startingPrice.startsWith("from") && (
              <p className="text-xs uppercase tracking-wide text-navy-400">
                starting
              </p>
            )}
            <p className="mt-3 flex-1 text-sm leading-relaxed text-navy-600">
              {s.blurb}
            </p>
            {s.details && (
              <ul className="mt-4 space-y-1 border-t border-navy-100 pt-4 text-sm text-navy-500">
                {s.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            <Link href="/contact" className="btn-outline btn-sm mt-5">
              Get a quote
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {[
          {
            h: "One-time projects",
            b: "Billed up front before work starts. You get a clear quote and timeline first.",
          },
          {
            h: "Monthly plan",
            b: "The $30/month hosting + upkeep plan is billed monthly. Cancel anytime.",
          },
          {
            h: "Payments & delivery",
            b: "Payments run through Stripe. All work is delivered digitally, formatted and ready to use.",
          },
        ].map((c) => (
          <div key={c.h} className="rounded-xl border border-navy-100 bg-navy-50/40 p-6">
            <h3 className="font-600 text-navy">{c.h}</h3>
            <p className="mt-2 text-sm text-navy-600">{c.b}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-xl border border-navy-100 bg-white p-5 text-sm text-navy-600">
        <strong className="text-navy">Heads up on policies:</strong> Policy and
        agreement wording is a plain-language starting point, not legal advice.
        Please confirm anything legally sensitive with your own attorney.
      </div>
    </div>
  );
}
