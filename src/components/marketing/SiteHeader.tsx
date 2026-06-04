"use client";

import { useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

const NAV = [
  { href: "/services", label: "Services" },
  { href: "/work", label: "Work" },
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-navy-100 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Wordmark />

        <nav
          className="hidden items-center gap-7 md:flex"
          aria-label="Primary"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-navy-600 hover:text-navy"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login" className="btn-ghost btn-sm">
            Portal Login
          </Link>
          <Link href="/contact" className="btn-primary btn-sm">
            Get a quote
          </Link>
        </div>

        <button
          type="button"
          className="btn-ghost md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            {open ? (
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="border-t border-navy-100 bg-white md:hidden">
          <nav className="container-x flex flex-col py-3" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-2 py-2.5 text-sm font-medium text-navy-600 hover:bg-navy-50"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-3 px-2 pb-2">
              <Link href="/login" className="btn-outline btn-sm flex-1" onClick={() => setOpen(false)}>
                Portal Login
              </Link>
              <Link href="/contact" className="btn-primary btn-sm flex-1" onClick={() => setOpen(false)}>
                Get a quote
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
