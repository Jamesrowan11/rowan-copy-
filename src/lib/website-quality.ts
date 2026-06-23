// Pure website-quality heuristic — no server deps, so it is safe to import from
// both server actions and client components. We don't crawl sites; we judge from
// the URL alone. A "weak" site is a social page, directory listing, or free
// site-builder / Google-Business page — i.e. the business effectively has no
// real custom website, so our demo is a clear upgrade.

const WEAK_HOSTS = [
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "linktr.ee",
  "linktree.com",
  "yelp.com",
  "nextdoor.com",
  "business.site", // Google Business profile sites
  "sites.google.com",
  "wixsite.com",
  "wix.com",
  "weebly.com",
  "wordpress.com",
  "blogspot.com",
  "godaddysites.com",
  "square.site",
  "squareup.com",
  "strikingly.com",
  "jimdo.com",
  "webnode.com",
  "vagaro.com",
  "booksy.com",
  "glossgenius.com",
  "tumblr.com",
];

export type WebsiteStatus = "none" | "weak" | "site";

export function websiteStatus(url: string): WebsiteStatus {
  if (!url || !url.trim()) return "none";
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "site";
  }
  const weak = WEAK_HOSTS.some((w) => host === w || host.endsWith(`.${w}`));
  return weak ? "weak" : "site";
}

/** A "best target" for our demo: no website at all, or only a weak/basic one. */
export function isBestTarget(url: string): boolean {
  return websiteStatus(url) !== "site";
}
