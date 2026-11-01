import { createFileRoute, Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { ClosingCta, PageHero } from "@/components/site/Layout";
import { Reveal, Stagger, StaggerItem } from "@/components/site/motion";
import { copyServices } from "@/lib/site-data";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Services & starting prices — Rowan Copy" },
      { name: "description", content: "Website copy from $200/page, policy packages from $300, caption batches, emails, listing descriptions and websites from $15/month." },
      { property: "og:title", content: "Services & starting prices — Rowan Copy" },
      { property: "og:description", content: "Copywriting and websites for small businesses, priced up front." },
    ],
  }),
  component: Services,
});

function Services() {
  return (
    <>
      <PageHero eyebrow="Services" title="Words, priced up front." lead="Every service starts with a clear price. Tell us what you need and you'll get a firm quote within one business day." />
      <section className="container-x pb-16">
        <Stagger className="divide-y divide-navy-100 border-y border-navy-100">
          {copyServices.map((s, i) => (
            <StaggerItem key={s.name}>
              <div className="group grid gap-4 py-10 transition-colors md:grid-cols-[4rem_1fr_1fr_auto] md:items-center md:gap-8">
                <span className="font-serif text-copper">0{i + 1}</span>
                <h2 className="text-3xl text-navy transition-transform duration-500 group-hover:translate-x-2">{s.name}</h2>
                <p className="text-navy-500">{s.detail}</p>
                <p className="font-serif text-xl text-copper-hover md:text-right">{s.price}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal className="mt-10 flex items-start gap-3 rounded-2xl bg-navy-50 p-5 text-sm text-navy-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-copper-hover" />
          Policy wording is a plain-language starting point, not legal advice. Have an attorney review anything with legal consequences.
        </Reveal>
        <Reveal className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link to="/contact" className="btn-copper">Get a quote</Link>
          <Link to="/pricing" className="btn-ghost">See website plans</Link>
        </Reveal>
      </section>
      <ClosingCta />
    </>
  );
}
