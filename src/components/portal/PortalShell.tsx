"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { ROLE_LABELS, type Role } from "@/lib/constants";

export type NavItem = {
  href: string;
  label: string;
  badge?: number;
};

export function PortalShell({
  user,
  nav,
  children,
}: {
  user: { name: string; email: string; role: Role };
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const sidebar = (
    <nav className="flex flex-col gap-1" aria-label="Portal">
      {nav.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/admin" &&
            item.href !== "/staff" &&
            item.href !== "/client" &&
            pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-navy text-white"
                : "text-navy-600 hover:bg-navy-50"
            }`}
          >
            <span>{item.label}</span>
            {item.badge ? (
              <span
                className={`badge ${
                  active ? "bg-white/20 text-white" : "bg-accent text-white"
                }`}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-navy-50/40">
      {/* Topbar */}
      <header className="sticky top-0 z-40 border-b border-navy-100 bg-white">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-ghost lg:hidden"
              aria-label="Toggle menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <Wordmark />
            <span className="badge ml-1 hidden bg-navy-100 text-navy-600 sm:inline-flex">
              {ROLE_LABELS[user.role]} portal
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-600 text-navy">{user.name}</p>
              <p className="text-xs text-navy-400">{user.email}</p>
            </div>
            <Link href="/logout" className="btn-outline btn-sm" prefetch={false}>
              Log out
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 sm:px-6">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-24">{sidebar}</div>
        </aside>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-30 lg:hidden">
            <div
              className="absolute inset-0 bg-navy-900/30"
              onClick={() => setOpen(false)}
            />
            <div className="absolute left-0 top-16 h-full w-64 border-r border-navy-100 bg-white p-4">
              {sidebar}
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
