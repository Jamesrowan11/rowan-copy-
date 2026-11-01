import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useReducedMotion, useScroll, useTransform, type MotionStyle } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Check, Clock, FileText, Globe, PenLine, ShieldCheck, Sparkles, User } from "lucide-react";
import { CountUp, Reveal, SectionHeading, Stagger, StaggerItem, WordReveal } from "@/components/site/motion";
import { BuilderPinned } from "@/components/site/BuilderPinned";
import { HorizontalServices } from "@/components/site/HorizontalServices";
import { ClosingCta } from "@/components/site/Layout";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rowan Copy — Clean copy for small businesses | Howard County, MD" },
      { name: "description", content: "Human-written copy, an AI website builder and managed hosting, domains and email for small businesses in Howard County, Maryland." },
      { property: "og:title", content: "Rowan Copy — Clean copy for small businesses" },
      { property: "og:description", content: "Website copy, policies, captions and emails, plus AI websites and hosting from a Howard County studio." },
    ],
  }),
  component: Home,
});

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBlob = useTransform(scrollYProgress, [0, 1], [0, 220]);
  const yCard = useTransform(scrollYProgress, [0, 1], [0, -140]);
  const yTag = useTransform(scrollYProgress, [0, 1], [0, -260]);
  const yText = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const rot = useTransform(scrollYProgress, [0, 1], [-2, 4]);
  const m = (v: MotionStyle): MotionStyle => (reduce ? {} : v);

  return (
    <section ref={ref} className="relative overflow-hidden pt-32 pb-20 md:pt-44 md:pb-32">
      <motion.div style={m({ y: yBlob })} className="grain pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <motion.div style={m({ y: yBlob })} className="pointer-events-none absolute -top-32 right-[-15%] h-[34rem] w-[34rem] rounded-full bg-copper-soft blur-3xl" />
      <motion.div style={m({ y: yTag })} className="pointer-events-none absolute left-[-10%] top-1/2 h-72 w-72 rounded-full bg-navy-100 blur-3xl" />

      <div className="container-x relative grid items-center gap-14 lg:grid-cols-[1.15fr_0.85fr]">
        <motion.div style={m({ y: yText, opacity: fade })}>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="eyebrow mb-6">
            Copywriting, websites & hosting · Howard County, Maryland
          </motion.p>
          <h1 className="text-[3.2rem] leading-[0.98] text-navy sm:text-7xl lg:text-[5.5rem]">
            <WordReveal text="Clean copy for" delay={0.1} />{" "}
            <WordReveal text="small businesses." delay={0.35} className="italic text-copper-hover" />
          </h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.8 }} className="mt-7 max-w-xl text-lg leading-relaxed text-navy-500">
            Words are the part of your business people judge first. We write the website pages, policies, captions and emails that make small businesses sound as good as they are, and we build and host the websites they live on.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85, duration: 0.8 }} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="/register.php" className="btn-copper">Build your website <ArrowRight className="h-4 w-4" /></a>
            <Link to="/contact" className="btn-ghost">Get a quote</Link>
          </motion.div>
          <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="mt-14 grid grid-cols-3 gap-4 border-t border-navy-100 pt-8">
            {[
              { k: <><CountUp to={1} /> day</>, v: "First reply, guaranteed" },
              { k: "Minutes", v: "To a first website draft" },
              { k: <CountUp to={100} suffix="%" />, v: "Copy-and-paste ready" },
            ].map((s, i) => (
              <div key={i}>
                <dt className="font-serif text-2xl text-navy md:text-4xl">{s.k}</dt>
                <dd className="mt-1 text-xs text-navy-500 md:text-sm">{s.v}</dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>

        <div className="relative mx-auto w-full max-w-md">
          <motion.div style={m({ y: yCard, rotate: rot })} initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
            <div className="rounded-3xl border border-navy-100 bg-card p-7 shadow-lift md:p-9">
              <div className="mb-6 flex items-center justify-between text-xs font-medium text-navy-500">
                <span className="flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> Homepage draft · v2</span>
                <span className="flex gap-1"><span className="h-1.5 w-1.5 rounded-full bg-copper" /><span className="h-1.5 w-1.5 rounded-full bg-navy-200" /></span>
              </div>
              <p className="font-serif text-3xl leading-tight text-navy">Repairs done right, the first time.</p>
              <p className="mt-4 text-sm leading-relaxed text-navy-500">
                Family-owned and licensed in Maryland. Tell us what's wrong and we'll give you a straight answer and a fair price. No upsell, no surprises.
              </p>
              <span className="mt-6 inline-block rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-navy-50">Book an estimate</span>
            </div>
          </motion.div>
          <motion.div style={m({ y: yTag })} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.2, type: "spring" }} className="absolute -bottom-6 -left-4 flex items-center gap-2 rounded-full bg-copper-soft px-4 py-2.5 text-sm font-medium text-navy shadow-soft md:-left-10">
            <Check className="h-4 w-4 text-copper-hover" /> Delivered copy-and-paste ready
          </motion.div>
          <motion.div style={m({ y: yBlob })} className="absolute -right-3 -top-8 hidden rounded-2xl bg-navy px-4 py-3 text-xs text-navy-50 shadow-lift sm:block">
            <span className="font-serif text-copper">✎</span> “Warmer, less salesy.”
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  const items = ["Based in Howard County, Maryland", "Serving Maryland small businesses", "Your own customer portal"];
  return (
    <div className="border-y border-navy-100 bg-navy-50">
      <div className="container-x flex flex-col items-center justify-center gap-3 py-5 text-sm text-navy-500 sm:flex-row sm:gap-10">
        {items.map((t, i) => (
          <Reveal key={t} delay={i * 0.1} y={10} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-copper" /> {t}
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function ThreeWays() {
  const ways = [
    { icon: PenLine, title: "We write it", body: "Website pages, policies, captions, emails and listings, written by a person who reads your business first.", cta: <Link to="/services" className="font-medium text-copper-hover">See services →</Link> },
    { icon: Sparkles, title: "Build your website with AI", body: "Describe your business in a few sentences and get a real website in minutes. Edit it in plain English.", featured: true, cta: <a href="/register.php" className="btn-copper !py-2.5 text-sm">Start free</a> },
    { icon: Globe, title: "Hosting, domain & email", body: "Your site, your domain and your business email, all managed from one simple customer portal.", cta: <Link to="/pricing" className="font-medium text-copper-hover">See plans →</Link> },
  ];
  return (
    <section className="container-x py-24 md:py-32">
      <SectionHeading eyebrow="What we do" title="Three ways we help" lead="Pick the one you need, or let them work together." />
      <Stagger className="mt-14 grid gap-5 md:grid-cols-3">
        {ways.map((w) => (
          <StaggerItem key={w.title}>
            <div className={`flex h-full flex-col rounded-3xl p-8 transition-transform duration-500 hover:-translate-y-1.5 ${w.featured ? "surface-navy shadow-lift md:-translate-y-4" : "border border-navy-100 bg-card shadow-soft"}`}>
              <span className={`grid h-12 w-12 place-items-center rounded-2xl ${w.featured ? "bg-copper text-navy" : "bg-copper-soft text-copper-hover"}`}>
                <w.icon className="h-5 w-5" />
              </span>
              <h3 className={`mt-8 text-2xl ${w.featured ? "text-navy-50" : "text-navy"}`}>{w.title}</h3>
              <p className={`mt-3 flex-1 leading-relaxed ${w.featured ? "text-navy-200" : "text-navy-500"}`}>{w.body}</p>
              <div className="mt-8">{w.cta}</div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

function Why() {
  const items = [
    { icon: ShieldCheck, t: "A clear process", d: "Quote up front, one draft, one round of edits. You always know what's next." },
    { icon: Clock, t: "Fast turnaround", d: "A reply within one business day, and most copy delivered within the week." },
    { icon: Check, t: "Copy-and-paste ready", d: "Formatted for your site, inbox or social tool. No cleanup required." },
    { icon: User, t: "Real human writing", d: "Written by Landen, not a template. Plain, honest, and in your voice." },
  ];
  return (
    <section className="container-x py-24 md:py-32">
      <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionHeading eyebrow="Why Rowan Copy" title="Agency-grade work, without the agency runaround." />
        </div>
        <Stagger className="grid gap-5 sm:grid-cols-2">
          {items.map((it) => (
            <StaggerItem key={it.t}>
              <div className="h-full rounded-3xl border border-navy-100 bg-card p-7">
                <it.icon className="h-6 w-6 text-copper" />
                <h3 className="mt-6 text-xl text-navy">{it.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-500">{it.d}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function Home() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <ThreeWays />
      <section className="pb-24 md:pb-32">
        <div className="container-x mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <SectionHeading eyebrow="Copywriting services" title="Words, priced up front." lead="Every service has a starting price, so you know where you stand before we begin." />
          <Reveal><Link to="/services" className="btn-ghost">All services</Link></Reveal>
        </div>
        <HorizontalServices />
      </section>
      <BuilderPinned />
      <Why />
      <ClosingCta />
    </>
  );
}
