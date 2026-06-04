import type { Metadata } from "next";
import { ContactForm } from "./ContactForm";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Tell Rowan Copy what you need written and get a quote. Based in Howard County, Maryland.",
};

export default function ContactPage() {
  return (
    <div className="container-x py-16 md:py-20">
      <div className="grid gap-12 md:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-hover">
            Contact
          </p>
          <h1 className="mt-2 text-4xl font-700 text-navy sm:text-5xl">
            Get a quote
          </h1>
          <p className="mt-4 text-lg text-navy-600">
            Fill out the form and I&apos;ll come back with a price, a timeline,
            and any questions I have. The more you tell me, the sharper the
            quote.
          </p>

          <div className="mt-8 space-y-4 text-sm">
            <div>
              <p className="font-600 text-navy">Email</p>
              <a href={`mailto:${COMPANY.email}`} className="link">
                {COMPANY.email}
              </a>
            </div>
            <div>
              <p className="font-600 text-navy">Based in</p>
              <p className="text-navy-600">{COMPANY.location}</p>
            </div>
            <div>
              <p className="font-600 text-navy">Serving</p>
              <p className="text-navy-600">
                Local Maryland businesses and remote clients across the U.S.
              </p>
            </div>
          </div>
        </div>

        <ContactForm />
      </div>
    </div>
  );
}
