// Discover a business's contact email by reading its own website (homepage +
// common contact pages). Deterministic and free — no external services. Used by
// the AI board's Outreach director so found leads don't stall waiting for a
// human to type in an email address.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const SKIP_DOMAINS = ["example.com", "sentry.io", "wixpress.com", "sentry-next.wixpress.com"];
const SKIP_PREFIXES = ["noreply", "no-reply", "donotreply", "postmaster", "mailer-daemon"];
const SKIP_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js"];

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; RowanCopyBot/1.0)" },
    });
    if (!res.ok) return "";
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("text/plain")) return "";
    // Cap the read so a huge page can't balloon memory.
    return (await res.text()).slice(0, 500_000);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function pickEmail(html: string): string | null {
  const found = html.match(EMAIL_RE) ?? [];
  const clean = found
    .map((e) => e.toLowerCase().replace(/^mailto:/, ""))
    .filter((e) => !SKIP_EXTENSIONS.some((ext) => e.endsWith(ext)))
    .filter((e) => !SKIP_DOMAINS.some((d) => e.endsWith(`@${d}`) || e.endsWith(`.${d}`)))
    .filter((e) => !SKIP_PREFIXES.some((p) => e.startsWith(p)));
  if (clean.length === 0) return null;
  // Prefer the classics; otherwise take the most frequent address on the page.
  const preferred = clean.find((e) => /^(info|contact|hello|office|admin|sales)@/.test(e));
  if (preferred) return preferred;
  const counts = new Map<string, number>();
  for (const e of clean) counts.set(e, (counts.get(e) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Try to find a contact email on the business's website. Checks the homepage,
 * then /contact and /contact-us. Returns null when the site is unreachable or
 * simply doesn't publish an address. Never throws.
 */
export async function findContactEmail(website: string): Promise<string | null> {
  let base: URL;
  try {
    base = new URL(website.startsWith("http") ? website : `https://${website}`);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(base.protocol)) return null;

  const pages = [base.href, new URL("/contact", base).href, new URL("/contact-us", base).href];
  for (const page of pages) {
    const html = await fetchText(page);
    if (!html) continue;
    const email = pickEmail(html);
    if (email) return email;
  }
  return null;
}
