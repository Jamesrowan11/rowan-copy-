import type { Metadata } from "next";
import Link from "next/link";
import { SERVICES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Website copy, policy & agreement packages, social captions, marketing emails, business listings, and ongoing hosting + upkeep — with starting prices.",
};

export default function ServicesPage() {
  return (
    <div className="container-x py-16 md:py-20">
      <header className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-hover">
          Services
        </p>
        <h1 className="mt-2 text-4xl font-700 text-navy sm:text-5xl">
          Words, priced up front.
        </h1>
        <p className="mt-4 text-lg text-navy-600">
          Here&apos;s what I write and what it starts at. Every project gets a
          firm quote before any work begins — these are the floors, not
          surprises waiting to happen.
        </p>
      </header>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {SERVICES.map((s) => (
          <article key={s.type} className="card flex flex-col p-7">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-600 text-navy">{s.name}</h2>
              <span className="badge whitespace-nowrap bg-accent-soft text-accent-hover">
                {s.startingPrice}
              </span>
            </div>
            <p className="mt-3 text-navy-600">{s.blurb}</p>
            {s.details && (
              <ul className="mt-4 space-y-1.5 text-sm text-navy-500">
                {s.details.map((d) => (
                  <li key={d} className="flex items-center gap-2">
                    <span className="text-accent" aria-hidden>•</span>
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>

      <div className="mt-10 rounded-xl border border-navy-100 bg-navy-50/50 p-5 text-sm text-navy-600">
        <strong className="text-navy">A note on policies and agreements:</strong>{" "}
        Policy and agreement wording is a clear, plain-language starting point —
        not legal advice. For anything legally sensitive, please confirm the
        final wording with your own attorney.
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-3">
        <Link href="/contact" className="btn-primary">
          Get a quote
        </Link>
        <Link href="/pricing" className="btn-outline">
          See pricing cards
        </Link>
      </div>
    </div>
  );
}
