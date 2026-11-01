import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ClosingCta, PageHero } from "@/components/site/Layout";
import { Reveal, Stagger, StaggerItem } from "@/components/site/motion";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Landen Rowan — Rowan Copy" },
      { name: "description", content: "Rowan Copy is a one-person copywriting and web studio in Howard County, Maryland. Plain, honest writing for small businesses." },
      { property: "og:title", content: "About Landen Rowan — Rowan Copy" },
      { property: "og:description", content: "A one-person studio. No account managers, no hand-offs." },
    ],
  }),
  component: About,
});

function About() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);
  return (
    <>
      <PageHero eyebrow="About" title="Hi, I'm Landen Rowan." lead="Rowan Copy is a one-person studio. I write plain, honest words for small businesses, and I build the websites they live on." />
      <section ref={ref} className="container-x grid gap-14 pb-24 md:grid-cols-[0.8fr_1.2fr]">
        <motion.div style={reduce ? {} : { y }} className="surface-navy relative aspect-[4/5] overflow-hidden rounded-3xl p-8">
          <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-copper/30 blur-3xl" />
          <span className="font-serif text-[9rem] leading-none text-copper">R</span>
          <p className="absolute bottom-8 left-8 right-8 font-serif text-2xl text-navy-50">“Say it plainly. Say it well. Then get out of the way.”</p>
        </motion.div>
        <div className="space-y-6 text-lg leading-relaxed text-navy-500">
          <Reveal><p>Most small businesses don't need clever. They need clear: a homepage that says what you do, a policy people actually read, an email that gets a reply. That's the work I love.</p></Reveal>
          <Reveal><p>I also built the Rowan Copy website builder for people who don't need a writer for every page. Describe your business, get a website in minutes, and run it from one simple portal.</p></Reveal>
          <Reveal><p>I'm based in Howard County, Maryland, and work remotely with businesses across the U.S.</p></Reveal>
          <Stagger className="grid gap-4 pt-6 sm:grid-cols-3">
            {["No account managers", "No hand-offs", "You talk to the writer"].map((t) => (
              <StaggerItem key={t}>
                <div className="rounded-2xl border border-navy-100 bg-card p-5 font-serif text-lg text-navy">{t}</div>
              </StaggerItem>
            ))}
          </Stagger>
          <Reveal className="pt-4"><Link to="/contact" className="btn-copper">Work with me</Link></Reveal>
        </div>
      </section>
      <ClosingCta />
    </>
  );
}
