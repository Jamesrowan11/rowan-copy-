import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Check, Globe, Mail, MessageSquare, Sparkles, TrendingUp } from "lucide-react";

const steps = [
  { n: "01", title: "Describe it", body: "Tell the builder about your business in a few plain sentences. What you do, who you serve, where you are." },
  { n: "02", title: "Refine it", body: "Your first draft appears in minutes. Ask for changes in your own words: new photos, a warmer tone, an extra page." },
  { n: "03", title: "Publish it", body: "One click and it's live on a free rowancopy.com address, or your own domain on a paid plan." },
  { n: "04", title: "Run it", body: "Read messages from your contact form, watch visitors, and manage domain and email from your portal." },
];

const prompt = "We're a family-owned plumbing company in Ellicott City. Honest quotes, same-week repairs, licensed in Maryland.";

function Typing({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? prompt.length : 0);
  useEffect(() => {
    if (!active || reduce) return;
    setN(0);
    const id = setInterval(() => setN((v) => (v >= prompt.length ? v : v + 2)), 28);
    return () => clearInterval(id);
  }, [active, reduce]);
  return (
    <p className="text-sm leading-relaxed text-navy md:text-base">
      {prompt.slice(0, n)}
      <span className="caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-copper" />
    </p>
  );
}

function Screen({ step }: { step: number }) {
  const fade = {
    initial: { opacity: 0, y: 16, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    exit: { opacity: 0, y: -16, filter: "blur(6px)" },
    transition: { duration: 0.5 },
  };
  return (
    <AnimatePresence mode="wait">
      {step === 0 && (
        <motion.div key="s0" {...fade} className="flex h-full flex-col justify-center gap-5 p-6 md:p-10">
          <div className="flex items-center gap-2 text-sm font-medium text-navy-500">
            <Sparkles className="h-4 w-4 text-copper" /> Describe your business
          </div>
          <div className="rounded-2xl border border-navy-100 bg-navy-50 p-5">
            <Typing active={step === 0} />
          </div>
          <div className="self-end rounded-full bg-navy px-4 py-2 text-sm font-medium text-navy-50">Build my website →</div>
        </motion.div>
      )}
      {step === 1 && (
        <motion.div key="s1" {...fade} className="h-full p-4 md:p-6">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-navy-100 bg-card">
            <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
              <span className="font-serif text-sm font-semibold">Patapsco Plumbing</span>
              <div className="flex gap-3">
                {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-8 rounded bg-navy-100" />)}
              </div>
            </div>
            <div className="grid flex-1 grid-cols-5 gap-4 p-5">
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="col-span-3 flex flex-col justify-center gap-3">
                <p className="font-serif text-xl leading-tight md:text-2xl">Repairs done right, the first time.</p>
                <span className="h-2 w-full rounded bg-navy-100" />
                <span className="h-2 w-4/5 rounded bg-navy-100" />
                <span className="mt-2 w-fit rounded-full bg-copper px-3 py-1.5 text-xs font-semibold text-navy">Book an estimate</span>
              </motion.div>
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} className="col-span-2 rounded-lg bg-[image:var(--gradient-navy)]" />
              {[0, 1, 2].map((i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.1 }} className={`${i === 2 ? "col-span-1" : "col-span-2"} rounded-lg bg-navy-50 p-3`}>
                  <span className="block h-1.5 w-2/3 rounded bg-navy-200" />
                  <span className="mt-2 block h-1.5 w-1/2 rounded bg-navy-100" />
                </motion.div>
              ))}
            </div>
            <div className="m-4 mt-0 rounded-lg border border-copper/40 bg-copper-soft px-3 py-2 text-xs text-navy">
              ✎ “Make the tone warmer and add a page for water heaters.”
            </div>
          </div>
        </motion.div>
      )}
      {step === 2 && (
        <motion.div key="s2" {...fade} className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.15 }} className="grid h-20 w-20 place-items-center rounded-full bg-copper">
            <Check className="h-10 w-10 text-navy" strokeWidth={3} />
          </motion.div>
          <p className="font-serif text-3xl">Published</p>
          <div className="flex items-center gap-2 rounded-full border border-navy-100 bg-navy-50 px-4 py-2 text-sm text-navy-500">
            <Globe className="h-4 w-4" /> patapscoplumbing.com
          </div>
          <p className="text-xs text-navy-500">SSL on · Live worldwide</p>
        </motion.div>
      )}
      {step === 3 && (
        <motion.div key="s3" {...fade} className="grid h-full grid-cols-2 gap-3 p-4 md:p-6">
          <div className="col-span-2 flex items-center justify-between">
            <span className="font-serif text-lg">Your portal</span>
            <span className="rounded-full bg-copper-soft px-3 py-1 text-xs font-medium">Business plan</span>
          </div>
          <div className="rounded-xl border border-navy-100 bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-navy-500"><TrendingUp className="h-3.5 w-3.5" /> Visitors this week</div>
            <p className="mt-1 font-serif text-3xl">1,284</p>
            <div className="mt-3 flex h-12 items-end gap-1">
              {[30, 45, 38, 60, 52, 75, 90].map((h, i) => (
                <motion.span key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: 0.2 + i * 0.06 }} className="flex-1 rounded-sm bg-copper" />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-navy-100 bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-navy-500"><Mail className="h-3.5 w-3.5" /> Email</div>
            <p className="mt-1 text-sm font-medium">hello@patapsco…</p>
            <p className="text-xs text-navy-500">5 accounts · DNS ok</p>
          </div>
          <div className="col-span-2 rounded-xl border border-navy-100 bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-xs text-navy-500"><MessageSquare className="h-3.5 w-3.5" /> New messages</div>
            {["Leaking water heater, can you come Thursday?", "Quote for a bathroom rough-in", "Thanks for the fast fix!"].map((m, i) => (
              <motion.div key={m} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.12 }} className="flex items-center gap-3 border-t border-navy-50 py-2 text-xs md:text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full bg-copper" /> {m}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function BuilderPinned() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [step, setStep] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setStep(Math.min(3, Math.floor(v * 4))));

  if (reduce) {
    return (
      <section className="surface-navy py-24">
        <div className="container-x">
          <p className="eyebrow mb-4 !text-copper">The website builder</p>
          <h2 className="max-w-xl text-4xl text-navy-50 md:text-5xl">From a few sentences to a live website</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n}>
                <p className="font-serif text-copper">{s.n}</p>
                <h3 className="mt-2 text-2xl text-navy-50">{s.title}</h3>
                <p className="mt-2 text-sm text-navy-200">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="surface-navy relative h-[400vh]">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="pointer-events-none absolute -right-40 top-10 h-[30rem] w-[30rem] rounded-full bg-copper/15 blur-3xl" />
        <div className="container-x relative grid items-center gap-8 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
          <div>
            <p className="eyebrow mb-4 !text-copper">The website builder</p>
            <h2 className="text-3xl leading-[1.05] text-navy-50 md:text-5xl">From a few sentences to a live website</h2>
            <div className="mt-6 space-y-1 md:mt-10">
              {steps.map((s, i) => (
                <div key={s.n} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full transition-colors duration-500 ${i <= step ? "bg-copper" : "bg-navy-500"}`} />
                    {i < 3 && <span className="my-1 w-px flex-1 bg-navy-500/50" />}
                  </div>
                  <div className={`pb-3 transition-opacity duration-500 md:pb-5 ${i === step ? "opacity-100" : "opacity-40"}`}>
                    <p className="font-serif text-lg text-navy-50 md:text-2xl">
                      <span className="mr-2 text-sm text-copper">{s.n}</span>
                      {s.title}
                    </p>
                    <motion.p
                      initial={false}
                      animate={{ height: i === step ? "auto" : 0, opacity: i === step ? 1 : 0 }}
                      className="overflow-hidden text-sm leading-relaxed text-navy-200 md:text-base"
                    >
                      {s.body}
                    </motion.p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl bg-card text-navy shadow-lift ring-1 ring-navy-50/10">
            <div className="flex items-center gap-2 border-b border-navy-100 bg-navy-50 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
              <span className="ml-3 flex-1 truncate rounded-md bg-card px-3 py-1 text-xs text-navy-500">
                {step < 2 ? "rowancopy.com/builder" : step === 2 ? "patapscoplumbing.com" : "rowancopy.com/portal"}
              </span>
            </div>
            <div className="relative h-[19rem] md:h-[26rem]">
              <Screen step={step} />
            </div>
            <div className="h-1 bg-navy-50">
              <motion.div style={{ scaleX: scrollYProgress }} className="h-full origin-left bg-copper" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
