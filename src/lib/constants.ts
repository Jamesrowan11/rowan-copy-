// Shared constants. Because the Prisma schema uses String fields instead of
// native enums (for SQLite/Postgres portability), these constants are the
// single source of truth for allowed values and are enforced in app code.

export const ROLES = ["CLIENT", "EMPLOYEE", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  CLIENT: "Client",
  EMPLOYEE: "Employee",
  ADMIN: "Admin",
};

// Service / project types — mirror the public Services page.
export const SERVICE_TYPES = [
  "Website copy",
  "Policy & agreement package",
  "Social media caption batch",
  "Marketing/business email",
  "Business listing description",
  "Website hosting + upkeep",
  "Other",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

// Project status pipeline.
export const PROJECT_STATUSES = [
  "Inquiry",
  "Quote Sent",
  "Accepted",
  "In Progress",
  "Draft Delivered",
  "Revisions",
  "Approved",
  "Closed",
  "Cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// Statuses that count as "active" work for the team.
export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  "Quote Sent",
  "Accepted",
  "In Progress",
  "Draft Delivered",
  "Revisions",
];

export const IN_REVIEW_STATUSES: ProjectStatus[] = [
  "Draft Delivered",
  "Revisions",
];

export const INQUIRY_STATUSES = [
  "New",
  "Reviewed",
  "Converted",
  "Archived",
] as const;

export const PAYMENT_STATUSES = ["Sent", "Paid"] as const;

export const QUOTE_STATUSES = ["Draft", "Sent", "Accepted", "Declined"] as const;

export const TEMPLATE_CATEGORIES = [
  "caption",
  "email",
  "policy",
  "website",
  "other",
] as const;

// Published pricing — used by the Services/Pricing pages and the quote builder.
export const SERVICES: {
  type: ServiceType;
  name: string;
  startingPrice: string;
  priceValue: number | null;
  blurb: string;
  details?: string[];
}[] = [
  {
    type: "Website copy",
    name: "Website copy",
    startingPrice: "from $200/page",
    priceValue: 200,
    blurb:
      "Clear, persuasive pages that sound like you and tell visitors exactly what to do next.",
    details: ["$200 per page", "$500 for a full 4-page site"],
  },
  {
    type: "Policy & agreement package",
    name: "Policy & agreement packages",
    startingPrice: "from $300",
    priceValue: 300,
    blurb:
      "Privacy policies, terms of service, customer waivers, and service agreements in plain, readable language.",
    details: ["Privacy policy", "Terms of service", "Waivers & service agreements"],
  },
  {
    type: "Social media caption batch",
    name: "Social media caption batches",
    startingPrice: "$150 for 15",
    priceValue: 150,
    blurb:
      "A month of captions written in your voice, ready to schedule and post.",
    details: ["$150 for 15 captions", "$250 for 30 captions"],
  },
  {
    type: "Marketing/business email",
    name: "Marketing & business emails",
    startingPrice: "from $75 per email",
    priceValue: 75,
    blurb:
      "Announcements, newsletters, and promos that get opened and actually read.",
    details: ["$75 per email", "Sequences quoted as a batch"],
  },
  {
    type: "Business listing description",
    name: "Business listing descriptions",
    startingPrice: "Quoted per listing",
    priceValue: null,
    blurb:
      "Google, Yelp, and directory descriptions that help the right people find you.",
    details: ["Google Business Profile", "Yelp & directories"],
  },
  {
    type: "Website hosting + upkeep",
    name: "Ongoing hosting + upkeep",
    startingPrice: "$30/month",
    priceValue: 30,
    blurb:
      "Hosting, your domain, and minor content updates handled so you never think about it.",
    details: ["Hosting + domain", "Minor content updates", "Billed monthly"],
  },
];

export const COMPANY = {
  name: "Rowan Copy",
  tagline: "Clean copy for small businesses",
  owner: "Landen Rowan",
  email: "landen@rowancopy.com",
  location: "Howard County, Maryland",
};

export const DEFAULT_SIGNATURE_TEXT = `Rowan Copy
Clean copy for small businesses
Landen Rowan
landen@rowancopy.com
Howard County, Maryland`;

export const MAX_EMAIL_RECIPIENTS = 25;
