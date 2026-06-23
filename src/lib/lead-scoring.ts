// Pure lead-scoring logic for the Lead Generator. scoreLead() takes the fields
// of a Demo and returns a 0-100 score, a tier, and human-readable reasons. It is
// deliberately dependency-free and side-effect-free so it can run at create time,
// after research, and in backfills without touching the DB.

export type LeadTier = "Hot" | "Warm" | "Cold";

export type LeadScore = {
  score: number;
  tier: LeadTier;
  reasons: string[];
};

// Only the fields scoring needs — a subset of Demo, so any caller (create,
// import, post-research, backfill) can pass what it has.
export type ScoreableDemo = {
  businessName?: string | null;
  city?: string | null;
  industry?: string | null;
  email?: string | null;
  currentWebsite?: string | null;
  foundExistingSite?: boolean | null;
  researchSummary?: string | null;
};

export function tierFor(score: number): LeadTier {
  if (score >= 70) return "Hot";
  if (score >= 40) return "Warm";
  return "Cold";
}

// Words in a research summary that suggest the current site is weak/basic (a
// positive sell signal) vs. modern/strong (a negative signal).
const WEAK_SITE_HINTS = [
  "no website",
  "outdated",
  "out of date",
  "dated",
  "basic",
  "simple",
  "minimal",
  "template",
  "facebook page",
  "google business",
  "google listing",
  "social media only",
  "only social",
  "no online presence",
  "poorly",
  "old",
  "needs work",
  "could be improved",
  "lacks",
  "broken",
  "not mobile",
  "no real website",
];
const STRONG_SITE_HINTS = [
  "modern",
  "well-designed",
  "well designed",
  "professional website",
  "polished",
  "strong online presence",
  "responsive",
  "recently redesigned",
  "high-quality",
  "sleek",
  "robust",
];

function isBlank(v?: string | null): boolean {
  return !v || v.trim() === "";
}

/**
 * Score a lead 0-100 on signals that predict a web-design sale. Higher = a
 * better prospect to generate a sample for and pitch first.
 */
export function scoreLead(demo: ScoreableDemo): LeadScore {
  let score = 30; // neutral baseline
  const reasons: string[] = [];

  const hasWebsite = !isBlank(demo.currentWebsite);
  const summary = (demo.researchSummary || "").toLowerCase();
  const weakSignals = WEAK_SITE_HINTS.filter((h) => summary.includes(h));
  const strongSignals = STRONG_SITE_HINTS.filter((h) => summary.includes(h));

  // 1. No existing website — the strongest positive signal.
  if (!hasWebsite) {
    score += 35;
    reasons.push("No current website on file — strong opportunity for a first site.");
  } else {
    reasons.push("Already has a website listed — sell an upgrade, not a first site.");
  }

  // 2. Reachable by email.
  if (!isBlank(demo.email)) {
    score += 12;
    reasons.push("Contact email present — reachable for outreach.");
  } else {
    score -= 8;
    reasons.push("No contact email — harder to reach.");
  }

  // 3 & 4. What research found about their current presence.
  if (demo.foundExistingSite === true && weakSignals.length > 0) {
    score += 18;
    reasons.push(`Research found a weak/basic existing presence (${weakSignals.slice(0, 3).join(", ")}) — easy to beat.`);
  } else if (demo.foundExistingSite === true && strongSignals.length > 0) {
    score -= 18;
    reasons.push(`Research found an apparently strong existing site (${strongSignals.slice(0, 3).join(", ")}) — harder to win.`);
  } else if (demo.foundExistingSite === true) {
    // Found something, quality unclear.
    score += 4;
    reasons.push("Research found an existing presence of unclear quality.");
  } else if (demo.foundExistingSite === false) {
    score += 10;
    reasons.push("Research found little or no online presence — wide open.");
  }

  // 5. More fields filled in = more to personalize a pitch with.
  const hasCity = !isBlank(demo.city);
  const hasIndustry = !isBlank(demo.industry);
  if (hasCity && hasIndustry) {
    score += 8;
    reasons.push("City and industry known — easy to personalize the pitch.");
  } else if (hasCity || hasIndustry) {
    score += 4;
    reasons.push("Partial location/industry detail to personalize with.");
  } else {
    reasons.push("Missing city and industry — less to personalize.");
  }

  // Clamp and tier.
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, tier: tierFor(score), reasons };
}
