import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ClosingCta, PageHero } from "@/components/site/Layout";
import { Stagger, StaggerItem } from "@/components/site/motion";

export const Route = createFileRoute("/work")({
  head: () => ({
    meta: [
      { title: "Selected work — Rowan Copy" },
      { name: "description", content: "Case studies: website rewrites, salon policies, social captions, re-engagement emails, listing descriptions and one-page sites." },
      { property: "og:title", content: "Selected work — Rowan Copy" },
      { property: "og:description", content: "Real projects for Maryland small businesses." },
    ],
  }),
  component: Work,
});

type Visual = "site" | "doc" | "grid" | "mail" | "pin" | "page";

const cases: { tag: string; title: string; body: string; visual: Visual; dark?: boolean }[] = [
  { tag: "Website copy", title: "Home services company", body: "A full site rewrite: five pages turned from jargon into plain answers customers actually search for.", visual: "site", dark: true },
  { tag: "Policy package", title: "Salon policies & client waiver", body: "Cancellation, booking and color-service policies plus a client waiver written in friendly plain language.", visual: "doc" },
  { tag: "Social captions", title: "Coffee roaster", body: "A batch of 30 captions in the roaster's warm, nerdy voice, scheduled a month ahead.", visual: "grid" },
  { tag: "Email", title: "Boutique gym", body: "One re-engagement email to lapsed members that booked 14 trials in a week.", visual: "mail", dark: true },
  { tag: "Listings", title: "Restaurant", body: "Google Business Profile and Yelp descriptions that lead with the dishes regulars rave about.", visual: "pin" },
  { tag: "Website", title: "Consultant", body: "A focused one-page site with copy and build, live on their own domain in under a week.", visual: "page" },
];

function Art({ v, dark }: { v: Visual; dark?: boolean }) {
  const line = dark ? "bg-navy-500" : "bg-navy-200";
  const card = dark ? "bg-navy-50/10" : "bg-card";
  const hover = { whileHover: { scale: 1.04, rotate: -1 }, transition: { duration: 0.6 } };
  return (
    <div className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl ${dark ? "surface-navy" : "bg-navy-50"}`}>
      <div className="grain absolute inset-0 opacity-50" />
      <motion.div {...hover} className="relative w-3/4">
        {v === "site" && (
          <div className={`rounded-xl ${card} p-4 shadow-lift`}>
            <div className="mb-3 flex gap-1">{[0, 1, 2].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${line}`} />)}</div>
            <p className={`font-serif text-lg ${dark ? "text-navy-50" : "text-navy"}`}>Fixed right. Priced fair.</p>
            <span className={`mt-2 block h-1.5 w-3/4 rounded ${line}`} />
            <span className="mt-3 block h-5 w-20 rounded-full bg-copper" />
          </div>
        )}
        {v === "doc" && (
          <div className="mx-auto w-2/3 rotate-2 rounded-lg bg-card p-5 shadow-lift">
            <p className="font-serif text-sm text-navy">Client Waiver</p>
            {[90, 75, 85, 60, 80].map((w, i) => <span key={i} style={{ width: `${w}%` }} className="mt-2 block h-1 rounded bg-navy-100" />)}
            <span className="mt-4 block h-px w-1/2 bg-copper" />
          </div>
        )}
        {v === "grid" && (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className={`aspect-square rounded-lg ${i % 4 === 0 ? "bg-copper" : i % 3 === 0 ? "bg-navy" : "bg-copper-soft"}`} />
            ))}
          </div>
        )}
        {v === "mail" && (
          <div className="rounded-xl bg-card p-5 shadow-lift">
            <p className="text-xs text-navy-500">Subject</p>
            <p className="font-serif text-navy">We saved your spot.</p>
            <span className="mt-3 block h-1 w-full rounded bg-navy-100" />
            <span className="mt-2 block h-1 w-2/3 rounded bg-navy-100" />
            <p className="mt-4 font-serif text-3xl text-copper-hover">+14 <span className="text-sm text-navy-500">trials</span></p>
          </div>
        )}
        {v === "pin" && (
          <div className="mx-auto w-4/5 rounded-xl bg-card p-4 shadow-lift">
            <div className="flex items-center gap-2"><span className="h-6 w-6 rounded-full bg-copper" /><p className="font-serif text-sm text-navy">Ellicott Kitchen</p></div>
            <p className="mt-2 text-sm text-copper">★★★★★</p>
            <span className="mt-2 block h-1 w-full rounded bg-navy-100" />
            <span className="mt-2 block h-1 w-3/5 rounded bg-navy-100" />
          </div>
        )}
        {v === "page" && (
          <div className="mx-auto w-1/2 rounded-xl bg-card p-3 shadow-lift">
            <span className="block h-14 rounded-md bg-navy" />
            {[80, 60, 90].map((w, i) => <span key={i} style={{ width: `${w}%` }} className="mt-2 block h-1 rounded bg-navy-100" />)}
            <span className="mt-3 block h-3 w-12 rounded-full bg-copper" />
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Work() {
  return (
    <>
      <PageHero eyebrow="Work" title="Selected work" lead="A few recent projects for small businesses. Names kept private, results kept honest." />
      <section className="container-x pb-16">
        <Stagger className="grid gap-x-6 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => (
            <StaggerItem key={c.title}>
              <article className="group">
                <Art v={c.visual} dark={!!c.dark} />
                <p className="eyebrow mt-6">{c.tag}</p>
                <h2 className="mt-2 text-2xl text-navy">{c.title}</h2>
                <p className="mt-2 leading-relaxed text-navy-500">{c.body}</p>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
      <ClosingCta />
    </>
  );
}
