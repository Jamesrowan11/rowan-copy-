import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useState, type FormEvent } from "react";
import { Check, Mail, MapPin, Sparkles } from "lucide-react";
import { PageHero } from "@/components/site/Layout";
import { Reveal } from "@/components/site/motion";
import { serviceOptions } from "@/lib/site-data";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Get a quote — Rowan Copy" },
      { name: "description", content: "Tell Rowan Copy what you need. Copy, policies, captions, emails or a website. Reply within one business day." },
      { property: "og:title", content: "Get a quote — Rowan Copy" },
      { property: "og:description", content: "Email landen@rowancopy.com or send the form. Howard County, Maryland." },
    ],
  }),
  component: Contact,
});

type Fields = { name: string; business: string; email: string; phone: string; service: string; budget: string; message: string; website: string };
const empty: Fields = { name: "", business: "", email: "", phone: "", service: "", budget: "", message: "", website: "" };

function validate(f: Fields) {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e["name"] = "Please tell us your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e["email"] = "Please enter a valid email.";
  if (!f.service) e["service"] = "Choose a service.";
  if (f.message.trim().length < 10) e["message"] = "A sentence or two helps us quote accurately.";
  if (f.message.length > 4000) e["message"] = "Please keep it under 4,000 characters.";
  return e;
}

function Contact() {
  const [f, setF] = useState<Fields>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const set = (k: keyof Fields) => (ev: { target: { value: string } }) => setF((p) => ({ ...p, [k]: ev.target.value }));

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate(f);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/inquiry.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...f, name: f.name.trim(), email: f.email.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (json?.ok) {
        setStatus("done");
        return;
      }
      setErrors(json?.errors ?? { form: "Something went wrong. Please email landen@rowancopy.com." });
    } catch {
      setErrors({ form: "Couldn't send right now. Please email landen@rowancopy.com." });
    }
    setStatus("idle");
  }

  const input = "w-full rounded-xl border border-input bg-card px-4 py-3 text-navy outline-none transition focus:border-copper focus:ring-2 focus:ring-copper/30";
  const Err = ({ k }: { k: string }) => (errors[k] ? <p className="mt-1.5 text-sm text-destructive">{errors[k]}</p> : null);

  return (
    <>
      <PageHero eyebrow="Contact" title="Get a quote" lead="Tell us what you need. You'll get a reply, and a clear price, within one business day." />
      <section className="container-x grid gap-12 pb-28 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-6">
          <Reveal className="space-y-5">
            <a href="mailto:landen@rowancopy.com" className="flex items-center gap-3 text-lg text-navy hover:text-copper-hover">
              <Mail className="h-5 w-5 text-copper" /> landen@rowancopy.com
            </a>
            <p className="flex items-start gap-3 text-navy-500">
              <MapPin className="mt-1 h-5 w-5 shrink-0 text-copper" /> Based in Howard County, Maryland. Serving local and remote clients.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="surface-navy rounded-3xl p-8">
              <Sparkles className="h-6 w-6 text-copper" />
              <h2 className="mt-5 text-2xl text-navy-50">Just need a website?</h2>
              <p className="mt-2 text-navy-200">Build it yourself in minutes. Describe your business and the builder does the rest.</p>
              <a href="/register.php" className="btn-copper mt-6">Build your website</a>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="rounded-3xl border border-navy-100 bg-card p-6 shadow-soft md:p-10">
            <AnimatePresence mode="wait">
              {status === "done" ? (
                <motion.div key="ok" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-16 text-center">
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-copper"><Check className="h-8 w-8 text-navy" /></span>
                  <h2 className="mt-6 text-3xl text-navy">Thanks, it's on its way.</h2>
                  <p className="mt-3 text-navy-500">You'll hear back within one business day.</p>
                </motion.div>
              ) : (
                <motion.form key="form" exit={{ opacity: 0 }} onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Name *</label>
                    <input className={input} value={f.name} onChange={set("name")} maxLength={100} />
                    <Err k="name" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Business</label>
                    <input className={input} value={f.business} onChange={set("business")} maxLength={150} />
                    <Err k="business" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Email *</label>
                    <input type="email" className={input} value={f.email} onChange={set("email")} maxLength={255} />
                    <Err k="email" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Phone</label>
                    <input type="tel" className={input} value={f.phone} onChange={set("phone")} maxLength={40} />
                    <Err k="phone" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Service *</label>
                    <select className={input} value={f.service} onChange={set("service")}>
                      <option value="">Choose one…</option>
                      {serviceOptions.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <Err k="service" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Budget</label>
                    <input className={input} value={f.budget} onChange={set("budget")} placeholder="e.g. $500" maxLength={60} />
                    <Err k="budget" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium">Message *</label>
                    <textarea rows={5} className={input} value={f.message} onChange={set("message")} maxLength={4000} placeholder="What do you need, and when?" />
                    <Err k="message" />
                  </div>
                  <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                    <label>Website <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label>
                  </div>
                  {errors["form"] && <p className="text-sm text-destructive sm:col-span-2">{errors["form"]}</p>}
                  <button type="submit" disabled={status === "sending"} className="btn-copper sm:col-span-2 disabled:opacity-60">
                    {status === "sending" ? "Sending…" : "Send inquiry"}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </Reveal>
      </section>
    </>
  );
}
