export type Plan = {
  key: string;
  name: string;
  price: number;
  price_yearly: number;
  features: string[];
  popular?: boolean;
};

export const fallbackPlans: Plan[] = [
  {
    key: "free",
    name: "Free",
    price: 0,
    price_yearly: 0,
    features: [
      "1 website",
      "5 AI designs or edits a month",
      "Free rowancopy.com web address",
      "Contact-form inbox and visitor stats",
      "Email support",
    ],
  },
  {
    key: "starter",
    name: "Starter",
    price: 15,
    price_yearly: 150,
    features: ["1 website", "30 AI edits a month", "Your own domain", "No Rowan Copy badge", "1 email account on your domain"],
  },
  {
    key: "business",
    name: "Business",
    price: 30,
    price_yearly: 300,
    popular: true,
    features: [
      "3 websites",
      "75 AI edits a month",
      "Your own domain",
      "No Rowan Copy badge",
      "5 email accounts",
      "DNS management in your portal",
      "Priority support",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: 69,
    price_yearly: 690,
    features: [
      "10 websites",
      "200 AI edits a month",
      "Your own domain",
      "No Rowan Copy badge",
      "20 email accounts",
      "DNS management",
      "Priority support and a monthly check-in",
    ],
  },
];

export async function loadPlans(): Promise<Plan[]> {
  try {
    const res = await fetch("/api/plans.php", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("bad");
    const json = await res.json();
    if (!Array.isArray(json?.plans) || json.plans.length === 0) throw new Error("bad");
    return json.plans.map((p: Plan) => ({
      ...p,
      price: Number(p.price),
      price_yearly: Number(p.price_yearly),
      popular: p.popular ?? p.key === "business",
    }));
  } catch {
    return fallbackPlans;
  }
}

export const copyServices = [
  { name: "Website copy", price: "from $200/page", detail: "$200 per page, or $500 for a full 4-page site." },
  { name: "Policy & agreement packages", price: "from $300", detail: "Privacy policy, terms of service, waivers and service agreements." },
  { name: "Social media caption batches", price: "$150 for 15", detail: "Or $250 for 30. Written in your voice, ready to schedule." },
  { name: "Marketing & business emails", price: "from $75/email", detail: "Single emails, or sequences quoted as a batch." },
  { name: "Business listing descriptions", price: "quoted per listing", detail: "Google Business Profile, Yelp and directories." },
  { name: "Websites, hosting & email", price: "from $15/month", detail: "Built with our AI builder, hosted and managed in your portal." },
];

export const serviceOptions = [
  "Website copy",
  "Policy & agreement package",
  "Social media caption batch",
  "Marketing/business email",
  "Business listing description",
  "Website built for me",
  "Website hosting & email",
  "Other",
];
