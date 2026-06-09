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

      {/* FAQ */}
      <section className="mt-16 max-w-3xl" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl font-700 text-navy">
          Common questions
        </h2>
        <div className="mt-6 space-y-3">
          {[
            {
              q: "How fast will I get my copy?",
              a: "Most single projects come back within a few days. You get a firm delivery date with your quote, and the portal emails you the moment a draft is ready.",
            },
            {
              q: "What if I don't like the first draft?",
              a: "Revision rounds are included in every quote. Request changes right from the portal and the draft moves back to writing — you'll see exactly how many rounds you have left.",
            },
            {
              q: "How do payments work?",
              a: "One-time projects are billed up front through a secure Stripe link. The $30/month plan bills monthly and you can cancel anytime. Everything is delivered digitally.",
            },
            {
              q: "Do you work outside Maryland?",
              a: "Yes. I'm based in Howard County and love working with local businesses, but everything runs remotely just as well — clients are all over the U.S.",
            },
            {
              q: "What do you need from me to start?",
              a: "Just the contact form to begin. Once we're working together, a short project brief in the portal (audience, goal, tone) makes the first draft dramatically better.",
            },
          ].map((item) => (
            <details key={item.q} className="card group p-5">
              <summary className="cursor-pointer list-none font-600 text-navy marker:content-none">
                <span className="flex items-center justify-between gap-3">
                  {item.q}
                  <span className="text-navy-300 transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-navy-600">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
