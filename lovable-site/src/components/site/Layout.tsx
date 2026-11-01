import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export function Logo({ dark }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-navy font-serif text-xl font-semibold text-copper shadow-soft">
        R
      </span>
      <span className={`font-serif text-lg font-semibold tracking-tight ${dark ? "text-navy-50" : "text-navy"}`}>
        Rowan Copy
      </span>
    </span>
  );
}

const nav = [
  { to: "/services", label: "Services" },
  { to: "/work", label: "Work" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setCompact(v > 40));

  return (
    <>
      <motion.div style={{ scaleX: progress }} className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-copper" />
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
          compact ? "border-b border-navy-100/70 bg-paper/75 py-2.5 backdrop-blur-xl" : "py-5"
        }`}
      >
        <div className="container-x flex items-center justify-between">
          <Link to="/" aria-label="Rowan Copy home" onClick={() => setOpen(false)}>
            <Logo />
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="text-sm font-medium text-navy-500 transition-colors hover:text-navy"
                activeProps={{ className: "text-navy" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <a href="/login.php" className="text-sm font-medium text-navy-500 hover:text-navy">
              Log in
            </a>
            <a href="/register.php" className="btn-copper !px-5 !py-2.5 text-sm">
              Start free
            </a>
          </div>
          <button className="md:hidden" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-b border-navy-100 bg-paper md:hidden"
            >
              <div className="container-x flex flex-col gap-1 py-4">
                {nav.map((n) => (
                  <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="py-2 font-serif text-2xl">
                    {n.label}
                  </Link>
                ))}
                <div className="mt-4 flex gap-3">
                  <a href="/login.php" className="btn-ghost flex-1">Log in</a>
                  <a href="/register.php" className="btn-copper flex-1">Start free</a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="surface-navy">
      <div className="container-x grid gap-12 py-16 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo dark />
          <p className="mt-5 max-w-xs font-serif text-2xl text-navy-50">Clean copy for small businesses.</p>
          <p className="mt-3 text-sm text-navy-200">Howard County, Maryland</p>
        </div>
        <div>
          <p className="eyebrow mb-4 !text-copper">Explore</p>
          <ul className="space-y-2.5 text-sm text-navy-200">
            {nav.map((n) => (
              <li key={n.to}>
                <Link to={n.to} className="hover:text-navy-50">{n.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4 !text-copper">Get in touch</p>
          <ul className="space-y-2.5 text-sm text-navy-200">
            <li><a href="mailto:landen@rowancopy.com" className="hover:text-navy-50">landen@rowancopy.com</a></li>
            <li><Link to="/contact" className="hover:text-navy-50">Get a quote</Link></li>
            <li><a href="/login.php" className="hover:text-navy-50">Customer login</a></li>
          </ul>
        </div>
      </div>
      <div className="container-x flex flex-col justify-between gap-3 border-t border-navy-50/10 py-6 text-xs text-navy-200 sm:flex-row">
        <span>© {new Date().getFullYear()} Rowan Copy. All rights reserved.</span>
        <span>
          <a href="/terms.php" className="hover:text-navy-50">Terms</a> ·{" "}
          <a href="/privacy.php" className="hover:text-navy-50">Privacy</a>
        </span>
      </div>
    </footer>
  );
}

export function PageHero({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <section className="relative overflow-hidden pt-36 pb-16 md:pt-44 md:pb-24">
      <div className="grain pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="pointer-events-none absolute -top-40 right-[-10%] h-[28rem] w-[28rem] rounded-full bg-copper-soft blur-3xl" />
      <div className="container-x relative">
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="eyebrow mb-5">
          {eyebrow}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-3xl text-5xl leading-[1.02] text-navy md:text-7xl"
        >
          {title}
        </motion.h1>
        {lead && (
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.15 }}
            className="mt-6 max-w-2xl text-lg leading-relaxed text-navy-500"
          >
            {lead}
          </motion.p>
        )}
      </div>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className="container-x py-24">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="surface-navy relative overflow-hidden rounded-[2rem] px-6 py-16 text-center md:px-16 md:py-24"
      >
        <div className="pointer-events-none absolute -bottom-32 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-copper/25 blur-3xl" />
        <p className="eyebrow relative mb-4 !text-copper">Let's get started</p>
        <h2 className="relative text-4xl text-navy-50 md:text-6xl">Tell us what you need.</h2>
        <p className="relative mx-auto mt-5 max-w-lg text-navy-200">
          A page, a policy, a batch of captions or a whole website. You'll hear back within one business day.
        </p>
        <div className="relative mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/contact" className="btn-copper">Get a quote</Link>
          <a href="/register.php" className="btn-ghost-dark">Build your website</a>
        </div>
      </motion.div>
    </section>
  );
}
