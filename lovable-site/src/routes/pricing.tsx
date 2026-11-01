import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { ClosingCta, PageHero } from "@/components/site/Layout";
import { Reveal, SectionHeading, Stagger, StaggerItem } from "@/components/site/motion";
import { copyServices, fallbackPlans, loadPlans, type Plan } from "@/lib/site-data";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Website plans & copywriting | Rowan Copy" },
      { name: "description", content: "Website plans from free to $69/month with hosting, domains and email, plus up-front copywriting prices." },
      { property: "og:title", content: "Pricing — Rowan Copy" },
      { property: "og:description", content: "Free, Starter, Business and Pro website plans. Monthly or yearly with 2 months free." },
    ],
  }),
  component: Pricing,
});

const faqs = [
  ["How fast will I get my copy?", "You'll hear back within one business day. Most single pages, emails and caption batches are delivered within a week; larger projects get a date in your quote."],
  ["What if I don't like the first draft?", "Every project includes a round of edits. Tell me what's off and I'll rework it until it sounds like you."],
  ["How does the website builder work?", "Describe your business in a few sentences, and the builder creates a first draft in minutes. Ask for changes in plain English, then publish with one click."],
  ["How do payments work?", "Payments are handled securely by Stripe. Pay monthly or yearly, and cancel anytime from Billing in your portal."],
  ["Can I use my own domain and email?", "Yes. Paid plans let you connect your own domain and create email accounts on it, all managed in your portal."],
  ["Do you work outside Maryland?", "Yes. I'm based in Howard County, Maryland, and work remotely with small businesses across the U.S."],
];

function Pricing() {
  const [plans, setPlans] = useState<Plan[]>(fallbackPlans);
  const [yearly, setYearly] = useState(false);
  useEffect(() => {
    loadPlans().then(setPlans);
  }, []);

  return (
    <>
      <PageHero eyebrow="Pricing" title="Simple plans. No surprises." lead="Start free, upgrade when you want your own domain and email." />
      <section className="container-x pb-24">
        <Reveal className="mb-10 flex justify-center">
          <div className="relative inline-flex rounded-full border border-navy-100 bg-navy-50 p-1 text-sm font-medium">
            {[false, true].map((y) => (
              <button key={String(y)} onClick={() => setYearly(y)} className={`relative z-10 rounded-full px-5 py-2 transition-colors ${yearly === y ? "text-navy-50" : "text-navy-500"}`}>
                {yearly === y && <motion.span layoutId="toggle" className="absolute inset-0 -z-10 rounded-full bg-navy" />}
                {y ? <>Yearly <span className="ml-1 rounded-full bg-copper px-2 py-0.5 text-[10px] text-navy">2 months free</span></> : "Monthly"}
              </button>
            ))}
          </div>
        </Reveal>
        <Stagger className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => {
            const price = yearly ? p.price_yearly : p.price;
            const pop = p.popular;
            return (
              <StaggerItem key={p.key}>
                <div className={`relative flex h-full flex-col rounded-3xl p-7 ${pop ? "surface-navy shadow-lift lg:-translate-y-3" : "border border-navy-100 bg-card shadow-soft"}`}>
                  {pop && <span className="absolute -top-3 left-7 rounded-full bg-copper px-3 py-1 text-xs font-semibold text-navy">Most popular</span>}
                  <h2 className={`text-2xl ${pop ? "text-navy-50" : "text-navy"}`}>{p.name}</h2>
                  <p className="mt-5 flex items-baseline gap-1">
                    <motion.span key={`${p.key}${yearly}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`font-serif text-5xl ${pop ? "text-navy-50" : "text-navy"}`}>${price}</motion.span>
                    <span className={pop ? "text-navy-200" : "text-navy-500"}>{price === 0 ? "forever" : yearly ? "/year" : "/month"}</span>
                  </p>
                  <ul className="mt-7 flex-1 space-y-3 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className={`flex gap-2.5 ${pop ? "text-navy-100" : "text-navy-500"}`}>
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-copper" /> {f}
                      </li>
                    ))}
                  </ul>
                  <a href={price === 0 ? "/register.php" : "/billing.php"} className={`mt-8 ${pop ? "btn-copper" : "btn-ghost"}`}>
                    {price === 0 ? "Start free" : `Choose ${p.name}`}
                  </a>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      <section className="bg-navy-50 py-24">
        <div className="container-x">
          <SectionHeading eyebrow="Copywriting" title="Starting prices for written work" />
          <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {copyServices.map((s) => (
              <StaggerItem key={s.name}>
                <div className="h-full rounded-2xl bg-card p-6">
                  <p className="font-serif text-xl text-copper-hover">{s.price}</p>
                  <h3 className="mt-2 text-lg text-navy">{s.name}</h3>
                  <p className="mt-1 text-sm text-navy-500">{s.detail}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="container-x max-w-3xl py-24">
        <SectionHeading eyebrow="FAQ" title="Questions, answered." />
        <Reveal className="mt-10">
          <Accordion type="single" collapsible>
            {faqs.map(([q = "", a = ""]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="text-left font-serif text-xl text-navy hover:no-underline">{q}</AccordionTrigger>
                <AccordionContent className="text-base leading-relaxed text-navy-500">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </section>
      <ClosingCta />
    </>
  );
}
