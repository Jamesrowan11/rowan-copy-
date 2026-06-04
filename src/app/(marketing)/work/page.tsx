import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Work",
  description:
    "A selection of copywriting samples and short case studies from Rowan Copy.",
};

// Placeholder case studies — replace blurbs and add real samples when supplied.
const SAMPLES = [
  {
    tag: "Website copy",
    title: "Home services company — full site rewrite",
    blurb:
      "Rewrote five pages for a Maryland HVAC company. Goal: sound trustworthy and local without the usual contractor clichés. [Placeholder — add live link & before/after.]",
  },
  {
    tag: "Policy package",
    title: "Salon — policies & client waiver",
    blurb:
      "Privacy policy, terms, and a plain-English client waiver a first-timer could actually read. [Placeholder — add sample PDF.]",
  },
  {
    tag: "Captions",
    title: "Coffee roaster — 30 social captions",
    blurb:
      "A month of captions in a warm, slightly nerdy voice that matched the brand. [Placeholder — add sample grid.]",
  },
  {
    tag: "Email",
    title: "Boutique gym — re-engagement email",
    blurb:
      "A win-back email to lapsed members that booked 14 trials in a week. [Placeholder — add metrics & screenshot.]",
  },
  {
    tag: "Listings",
    title: "Restaurant — Google & Yelp descriptions",
    blurb:
      "Profile descriptions tuned for search and for hungry humans. [Placeholder — add links.]",
  },
  {
    tag: "Website copy",
    title: "Consultant — one-page site",
    blurb:
      "A single sharp page that turned a vague service into an obvious yes. [Placeholder — add live link.]",
  },
];

export default function WorkPage() {
  return (
    <div className="container-x py-16 md:py-20">
      <header className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-hover">
          Work
        </p>
        <h1 className="mt-2 text-4xl font-700 text-navy sm:text-5xl">
          Selected work
        </h1>
        <p className="mt-4 text-lg text-navy-600">
          A few projects that show the range. Real samples and case studies are
          on the way — the cards below are placeholders I&apos;ll swap for the
          finished pieces.
        </p>
      </header>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {SAMPLES.map((s) => (
          <article key={s.title} className="card overflow-hidden">
            <div className="flex aspect-[4/3] items-center justify-center border-b border-navy-100 bg-navy-50/60 text-xs font-medium uppercase tracking-wide text-navy-400">
              [Sample image placeholder]
            </div>
            <div className="p-5">
              <span className="badge bg-accent-soft text-accent-hover">{s.tag}</span>
              <h2 className="mt-3 text-lg font-600 text-navy">{s.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-navy-600">
                {s.blurb}
              </p>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-navy-100 bg-navy-50/40 p-8 text-center">
        <h2 className="text-2xl font-600 text-navy">
          Want to see samples for your industry?
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-navy-600">
          Tell me what you do and I&apos;ll send relevant examples along with a
          quote.
        </p>
        <Link href="/contact" className="btn-primary mt-5">
          Get a quote
        </Link>
      </div>
    </div>
  );
}
