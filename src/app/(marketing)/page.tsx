import Link from "next/link";
import { SERVICES, COMPANY } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { Reveal } from "@/components/marketing/Reveal";

// Rendered on-demand (it reads live featured reviews), so the production build
// never needs a database connection.
export const dynamic = "force-dynamic";

const STATS = [
  { value: "1 day", label: "First reply, guaranteed" },
  { value: "Days", label: "Typical turnaround — not weeks" },
  { value: "100%", label: "Copy-and-paste ready" },
];

const WHY = [
  { title: "A clear process", body: "You always know what stage we're at, what I need from you, and when it lands. No black box." },
  { title: "Fast turnaround", body: "Most projects come back in days, not weeks. I quote a real timeline up front and hold to it." },
  { title: "Copy-and-paste ready", body: "Delivered formatted and final, so you can drop it straight into your site or scheduler." },
  { title: "Real human writing", body: "Every word is written by a person who read about your business. No generic filler, ever." },
];

const STEPS = [
  { title: "Tell me what you need", body: "Send the form with a few details. You'll get a confirmation right away and a real reply within a business day." },
  { title: "Get a quote & timeline", body: "A firm price and delivery date, accepted with one click in your client portal. No surprises later." },
  { title: "I write, you review", body: "Drafts land in your portal the moment they're ready. Approve, or request changes — revision rounds are built into the quote." },
  { title: "Delivered, ready to use", body: "Final copy arrives formatted and copy-and-paste ready. It stays in your portal whenever you need it again." },
];

export default async function HomePage() {
  const featured = await prisma.review.findMany({
    where: { featured: true, body: { not: null } },
    orderBy: { submittedAt: "desc" },
    take: 2,
  });

  return (
    <>
      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-50/70 to-white">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" aria-hidden />
        <div className="pointer-events-none absolute -right-40 -top-40 h-[36rem] w-[36rem] hero-glow" aria-hidden />
        <div className="container-x relative grid items-center gap-12 py-20 md:grid-cols-[1.05fr_0.95fr] md:py-28">
          <div>
            <p className="eyebrow mb-5">Copywriting &amp; web studio · {COMPANY.location}</p>
            <h1 className="text-4xl font-700 leading-[1.03] text-navy sm:text-5xl md:text-6xl">
              Clean <span className="text-gradient">copy</span> for small businesses.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-600">
              Words are the part of your business most people judge first. I write the website
              pages, policies, captions, and emails that make small businesses sound as good as
              they actually are — clear, honest, and ready to use.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/contact" className="btn-primary">Get a quote</Link>
              <Link href="/work" className="btn-outline">See the work</Link>
            </div>
            <p className="mt-6 text-sm text-navy-500">
              One-time projects or ongoing help. No retainers you can&apos;t get out of.
            </p>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-navy-100 pt-6">
              {STATS.map((s) => (
                <div key={s.label}>
                  <dt className="font-heading text-2xl font-700 text-navy">{s.value}</dt>
                  <dd className="mt-1 text-xs leading-snug text-navy-500">{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Layered "sample copy" visual for depth */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -right-3 top-6 hidden h-full w-full rotate-3 rounded-2xl border border-navy-100 bg-navy-50/60 sm:block" aria-hidden />
            <div className="card relative rotate-1 p-6 transition-transform duration-300 hover:rotate-0">
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
                Family-owned and licensed in Maryland since 2009. Tell us what&apos;s wrong and
                we&apos;ll give you a straight answer and a fair price — no upsell, no surprises.
              </p>
              <div className="mt-4 inline-flex rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">
                Book an estimate
              </div>
            </div>
            <div className="absolute -bottom-5 -left-4 hidden rounded-xl border border-navy-100 bg-white px-4 py-2 text-xs font-medium text-navy-600 shadow-card sm:block">
              ✓ Delivered copy-and-paste ready
            </div>
          </div>
        </div>
      </section>

      {/* ---- Trust strip ---- */}
      <section className="border-y border-navy-100 bg-white">
        <div className="container-x flex flex-wrap items-center justify-center gap-x-8 gap-y-2 py-4 text-sm text-navy-500">
          <span>Based in {COMPANY.location}</span>
          <span className="hidden text-navy-200 sm:inline">•</span>
          <span>Serving Maryland small businesses</span>
          <span className="hidden text-navy-200 sm:inline">•</span>
          <span>Own client portal for every project</span>
        </div>
      </section>

      {/* ---- Services ---- */}
      <section className="container-x py-16 md:py-24">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-3">What I write</p>
            <h2 className="text-3xl font-700 text-navy sm:text-4xl">A focused menu, priced up front.</h2>
            <p className="mt-3 max-w-xl text-navy-600">
              Need something not listed? Ask — if it&apos;s words, it&apos;s probably a yes.
            </p>
          </div>
          <Link href="/services" className="btn-outline btn-sm">All services &amp; pricing</Link>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.slice(0, 6).map((s, i) => (
            <Reveal key={s.type} delay={(i % 3) * 80}>
              <Link
                href="/services"
                className="card card-hover group flex h-full flex-col p-6"
              >
                <h3 className="text-lg font-600 text-navy">{s.name}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-navy-600">{s.blurb}</p>
                <p className="mt-4 flex items-center justify-between text-sm font-semibold text-accent-hover">
                  {s.startingPrice}
                  <span className="translate-x-0 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" aria-hidden>→</span>
                </p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section className="relative border-y border-navy-100 bg-navy-50/40">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" aria-hidden />
        <div className="container-x relative py-16 md:py-24">
          <div className="mb-12 max-w-xl">
            <p className="eyebrow mb-3">How it works</p>
            <h2 className="text-3xl font-700 text-navy sm:text-4xl">Four steps, no mystery.</h2>
            <p className="mt-3 text-navy-600">
              You always know where your project stands — and the portal keeps you posted automatically.
            </p>
          </div>
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 90}>
                <li className="card relative h-full p-6">
                  <span
                    className="absolute -top-3 left-6 flex h-8 w-8 items-center justify-center rounded-full bg-accent font-heading text-sm font-700 text-white shadow-soft"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <h3 className="mt-3 text-lg font-600 text-navy">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-navy-600">{step.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- Why Rowan Copy ---- */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 hero-glow opacity-60" aria-hidden />
        <div className="container-x relative py-16 md:py-24">
          <p className="eyebrow mb-3">Why Rowan Copy</p>
          <h2 className="max-w-2xl text-3xl font-700 text-white sm:text-4xl">
            Agency-grade writing, without the agency runaround.
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map((item, i) => (
              <Reveal key={item.title} delay={(i % 4) * 80}>
                <div>
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 font-700 text-accent" aria-hidden>
                    ✓
                  </div>
                  <h3 className="text-lg font-600 text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-navy-200">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Testimonials ---- */}
      <section className="container-x py-16 md:py-24">
        <p className="eyebrow mb-8 justify-center text-center">In their words</p>
        {featured.length > 0 ? (
          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
            {featured.map((r) => (
              <Reveal key={r.id}>
                <figure className="card h-full p-8">
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
              </Reveal>
            ))}
          </div>
        ) : (
          <figure className="mx-auto max-w-3xl rounded-2xl border border-dashed border-navy-200 bg-navy-50/40 p-10 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">
              [Placeholder — testimonial to be supplied]
            </p>
            <blockquote className="mt-4 font-heading text-2xl font-500 leading-snug text-navy">
              &ldquo;A short, specific quote from a happy client goes here — what they needed,
              what they got, and why it mattered.&rdquo;
            </blockquote>
            <figcaption className="mt-4 text-sm text-navy-500">
              First Last — Business Name, Maryland
            </figcaption>
          </figure>
        )}
      </section>

      {/* ---- Closing CTA ---- */}
      <section className="container-x pb-12">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-navy-600 px-8 py-16 text-center text-white">
          <div className="pointer-events-none absolute inset-0 hero-glow opacity-70" aria-hidden />
          <div className="relative">
            <h2 className="text-3xl font-700 text-white sm:text-4xl">Tell me what you need written.</h2>
            <p className="mx-auto mt-4 max-w-xl text-navy-200">
              Send a few details and I&apos;ll come back with a quote, a timeline, and a plan.
              No pressure, no jargon.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/contact" className="btn-primary">Get a quote</Link>
              <a href={`mailto:${COMPANY.email}`} className="btn-outline border-white/30 bg-transparent text-white hover:bg-white/10">
                Email me
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
