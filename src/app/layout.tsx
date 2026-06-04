import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { COMPANY } from "@/lib/constants";

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const heading = Fraunces({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const appUrl = process.env.APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Rowan Copy — Clean copy for small businesses",
    template: "%s · Rowan Copy",
  },
  description:
    "Rowan Copy is a freelance copywriting and web studio in Howard County, Maryland. Website copy, policies, social captions, and emails — clean, clear, and copy-and-paste ready.",
  openGraph: {
    title: "Rowan Copy — Clean copy for small businesses",
    description:
      "Website copy, policies, social captions, and emails for small businesses. Based in Howard County, Maryland; serving clients across the U.S.",
    url: appUrl,
    siteName: COMPANY.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rowan Copy — Clean copy for small businesses",
    description:
      "Website copy, policies, social captions, and emails for small businesses.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable}`}>
      <body>{children}</body>
    </html>
  );
}
