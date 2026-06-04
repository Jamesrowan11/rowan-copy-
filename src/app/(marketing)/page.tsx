import Link from "next/link";
import { SERVICES, COMPANY } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const featured = await prisma.review.findMany({
    where: { featured: true, body: { not: null } },
    orderBy: { submittedAt: "desc" },
    take: 2,
  });
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-50/70 to-white">
        <div className="container-x grid items-center gap-12 py-20 md:grid-cols-[1.1fr_0.9fr] md:py-28">
          <div>
            <p className="mb-4 inline-flex items-center rounded-full border border-navy-200 bg-white px-3 py-1 text-xs font-medium text-navy-600">
              Copywriting & web studio · {COMPANY.location}
            </p>
            <h1 className="text-4xl font-700 leading-[1.05] text-navy sm:text-5xl md:text-6xl">
              Clean copy for small businesses.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-navy-600">
              Words are the part of your business most people judge first. I
              write the website pages, policies, captions, and emails that make
              small businesses sound as good as they actually are — clear,
              honest, and ready to use.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/contact" className="btn-primary">
                Get a quote
              </Link>
              <Link href="/work" className="btn-outline">
                See the work
              </Link>
            </div>
            <p className="mt-6 text-sm text-navy-500">
              One-time projects or ongoing help. No retainers you can&apos;t get
              out of.
            </p>
          </div>

          <div className="relative">
            {/* Decorative copy "sample" card */}
            <div className="card rotate-1 p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                <span className="text-xs font-medium uppercase tracking-wide text-navy-400">
                  Homepage draft · v2
                </span>
              </div>
              <p className="font-heading text-2xl font-600 text-navy">
                Repairs done right, the first time.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-navy-600">
                Family-owned and licensed in Maryland since 2009. Tell us
                what&apos;s wrong and we&apos;ll give you a straight answer and a
                fair price — no upsell, no surprises.
              </p>
              <div className="mt-4 inline-flex rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">
                Book an estimate
              </div>
            </div>
            <div className="absolute -bottom-5 -left-4 hidden rounded-xl border border-navy-100 bg-white px-4 py-2 text-xs text-navy-500 shadow-card sm:block">
              ✓ Delivered copy-and-paste ready
            </div>
          </div>
        </div>
      </section>

      {/* Services overview */}
      <section className="container-x py-16 md:py-20">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-700 text-navy">What I write</h2>
            <p className="mt-2 max-w-xl text-navy-600">
              A focused menu, priced up front. Need something not listed? Ask —
              if it&apos;s words, it&apos;s probably a yes.
            </p>
          </div>
          <Link href="/services" className="btn-outline btn-sm">
            All services & pricing
          </Link>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.slice(0, 6).map((s) => (
            <div key={s.type} className="card p-6 transition-shadow hover:shadow-card">
              <h3 className="text-lg font-600 text-navy">{s.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-600">
                {s.blurb}
              </p>
              <p className="mt-4 text-sm font-semibold text-accent-hover">
                {s.startingPrice}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Why Rowan Copy strip */}
      <section className="bg-navy text-white">
        <div className="container-x py-16 md:py-20">
          <h2 className="text-3xl font-700 text-white">Why Rowan Copy</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "A clear process",
                body: "You always know what stage we're at, what I need from you, and when it lands. No black box.",
              },
              {
                title: "Fast turnaround",
                body: "Most projects come back in days, not weeks. I quote a real timeline up front and hold to it.",
              },
              {
                title: "Copy-and-paste ready",
                body: "Delivered formatted and final, so you can drop it straight into your site or scheduler.",
              },
              {
                title: "Real human writing",
                body: "Every word is written by a person who read about your business. No generic filler, ever.",
              },
            ].map((item) => (
              <div key={item.title}>
                <div className="mb-3 h-8 w-8 rounded-lg bg-accent/20 text-accent" aria-hidden>
                  <div className="flex h-full w-full items-center justify-center font-700 text-accent">
                    ✓
                  </div>
                </div>
                <h3 className="text-lg font-600 text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-200">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials — featured reviews, or a placeholder until supplied */}
      <section className="container-x py-16 md:py-20">
        {featured.length > 0 ? (
          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
            {featured.map((r) => (
              <figure key={r.id} className="card p-8">
                {r.rating ? (
                  <p className="text-accent" aria-label={`${r.rating} out of 5 stars`}>
                    {"★".repeat(r.rating)}
                  </p>
                ) : null}
                <blockquote className="mt-3 font-heading text-xl font-500 leading-snug text-navy">
                  &ldquo;{r.body}&rdquo;
                </blockquote>
                <figcaption className="mt-4 text-sm text-navy-500">
                  {r.authorName}
                  {r.business ? ` — ${r.business}` : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <figure className="mx-auto max-w-3xl rounded-2xl border border-dashed border-navy-200 bg-navy-50/40 p-10 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">
              [Placeholder — testimonial to be supplied]
            </p>
            <blockquote className="mt-4 font-heading text-2xl font-500 leading-snug text-navy">
              &ldquo;A short, specific quote from a happy client goes here — what
              they needed, what they got, and why it mattered.&rdquo;
            </blockquote>
            <figcaption className="mt-4 text-sm text-navy-500">
              First Last — Business Name, Maryland
            </figcaption>
          </figure>
        )}
      </section>

      {/* Closing CTA */}
      <section className="container-x pb-8">
        <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-600 px-8 py-14 text-center text-white">
          <h2 className="text-3xl font-700 text-white">
            Tell me what you need written.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-navy-200">
            Send a few details and I&apos;ll come back with a quote, a timeline,
            and a plan. No pressure, no jargon.
          </p>
          <div className="mt-7 flex justify-center gap-3">
            <Link href="/contact" className="btn-primary">
              Get a quote
            </Link>
            <a href={`mailto:${COMPANY.email}`} className="btn-outline border-white/30 bg-transparent text-white hover:bg-white/10">
              Email me
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
