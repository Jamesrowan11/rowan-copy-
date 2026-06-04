import Link from "next/link";
import { COMPANY } from "@/lib/constants";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t border-navy-100 bg-navy-50/60">
      <div className="container-x grid gap-10 py-14 md:grid-cols-3">
        <div>
          <p className="font-heading text-lg font-700 text-navy">
            Rowan<span className="text-accent"> Copy</span>
          </p>
          <p className="mt-2 text-sm text-navy-600">{COMPANY.tagline}.</p>
          <p className="mt-4 max-w-xs text-sm text-navy-500">
            Based in {COMPANY.location}, serving local and remote clients across
            the U.S.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-600 uppercase tracking-wide text-navy-500">
            Explore
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/services" className="text-navy-600 hover:text-navy">Services</Link></li>
            <li><Link href="/work" className="text-navy-600 hover:text-navy">Work</Link></li>
            <li><Link href="/about" className="text-navy-600 hover:text-navy">About</Link></li>
            <li><Link href="/pricing" className="text-navy-600 hover:text-navy">Pricing</Link></li>
            <li><Link href="/contact" className="text-navy-600 hover:text-navy">Contact</Link></li>
            <li><Link href="/login" className="text-navy-600 hover:text-navy">Portal Login</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-600 uppercase tracking-wide text-navy-500">
            Get in touch
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a href={`mailto:${COMPANY.email}`} className="text-navy-600 hover:text-navy">
                {COMPANY.email}
              </a>
            </li>
            <li>
              <Link href="/contact" className="link">
                Get a quote →
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-navy-100">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-5 text-xs text-navy-500 sm:flex-row">
          <p>
            © {year} {COMPANY.name}. {COMPANY.tagline}.
          </p>
          <a href="#top" className="font-medium text-navy-600 hover:text-navy">
            Back to top ↑
          </a>
        </div>
      </div>
    </footer>
  );
}
