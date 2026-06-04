import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "About",
  description:
    "Rowan Copy is a one-person copywriting and web studio run by Landen Rowan in Howard County, Maryland.",
};

export default function AboutPage() {
  return (
    <div className="container-x py-16 md:py-20">
      <div className="grid gap-12 md:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="card overflow-hidden">
            <div className="flex aspect-[4/5] items-center justify-center bg-navy-50/70 text-xs font-medium uppercase tracking-wide text-navy-400">
              [Photo / logo placeholder]
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-navy-100 bg-white p-5 text-sm">
            <p className="font-600 text-navy">Rowan Copy</p>
            <p className="mt-1 text-navy-600">{COMPANY.tagline}</p>
            <p className="mt-3 text-navy-500">{COMPANY.location}</p>
            <a href={`mailto:${COMPANY.email}`} className="link mt-1 inline-block">
              {COMPANY.email}
            </a>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-hover">
            About
          </p>
          <h1 className="mt-2 text-4xl font-700 text-navy sm:text-5xl">
            Hi, I&apos;m Landen Rowan.
          </h1>
          <div className="prose-narrow mt-6">
            <p>
              Rowan Copy is my copywriting and web studio. I work with small
              businesses — the kind run by people who are great at what they do
              and would rather not spend a weekend wrestling with the words on
              their website.
            </p>
            <p>
              That&apos;s the whole job: take what makes your business good and
              say it plainly, so the right customers get it in about three
              seconds. I write website pages, the policies and agreements
              nobody enjoys writing, social captions, and the emails that
              actually get opened. Then I hand it over formatted and ready to
              use — not a pile of edits for you to sort out.
            </p>
            <p>
              I&apos;m based in Howard County, Maryland, and I love working with
              local businesses here. I also work remotely with clients all over
              the U.S., so where you are doesn&apos;t matter much. What matters
              is that you get copy that sounds like a real person wrote it,
              because one did.
            </p>
            <p>
              No account managers, no hand-offs, no mystery. You talk to me, I
              do the writing, and you always know where things stand. If
              that&apos;s the kind of help you&apos;ve been looking for,
              let&apos;s talk.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contact" className="btn-primary">
              Start a project
            </Link>
            <Link href="/services" className="btn-outline">
              See services
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
