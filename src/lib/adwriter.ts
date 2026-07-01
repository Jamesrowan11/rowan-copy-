import Anthropic from "@anthropic-ai/sdk";

// AI ad-copy generation for the campaign workbench. Reads ANTHROPIC_API_KEY from
// the server environment (never exposed to the browser). Produces platform-ready
// assets that respect Google/Meta character limits, returned as structured JSON.

export type AdPlatform = "Google" | "Meta" | "Both";

export type BrandVoice = {
  tone?: string | null;
  keyTerms?: string | null;
  bannedCliches?: string | null;
  notes?: string | null;
};

export type AdInput = {
  businessName: string;
  platform: AdPlatform;
  offer: string; // the product/service/offer being advertised
  objective?: string;
  audience?: string;
  keyPoints?: string;
  cta?: string;
  brandVoice?: BrandVoice | null;
};

export type GoogleAds = {
  headlines: string[]; // <=30 chars each
  descriptions: string[]; // <=90 chars each
  keywords: string[];
  notes?: string;
};
export type MetaAds = {
  primaryTexts: string[]; // ~125 chars
  headlines: string[]; // <=40 chars
  descriptions: string[]; // <=30 chars
  creativeIdeas?: string[]; // visual/creative suggestions
  notes?: string;
};
export type AdContent = { google?: GoogleAds; meta?: MetaAds };

const SYSTEM = `You are an expert direct-response advertising copywriter who writes high-converting, platform-compliant ads for Google Ads and Meta (Facebook/Instagram) Ads.

Rules:
- Respect platform character limits STRICTLY.
  Google: headlines <= 30 characters; descriptions <= 90 characters.
  Meta: headline <= 40 characters; link description <= 30 characters; primary text ~125 characters (keep punchy).
- Write specific, benefit-led copy — no empty hype. Vary angles across variations.
- If a brand voice is provided, match its tone and key terms, and avoid its banned clichés.
- Output ONLY valid minified JSON, no markdown, no commentary.`;

function buildUserPrompt(input: AdInput): string {
  const bv = input.brandVoice;
  const brand = bv
    ? `\nBrand voice:\n- Tone: ${bv.tone || "n/a"}\n- Key terms: ${bv.keyTerms || "n/a"}\n- Banned clichés (do NOT use): ${bv.bannedCliches || "n/a"}\n- Notes: ${bv.notes || "n/a"}`
    : "";

  const wantGoogle = input.platform === "Google" || input.platform === "Both";
  const wantMeta = input.platform === "Meta" || input.platform === "Both";

  const shape: string[] = [];
  if (wantGoogle) {
    shape.push(
      `"google": { "headlines": [12 strings <=30 chars], "descriptions": [4 strings <=90 chars], "keywords": [15-20 relevant search keywords], "notes": "1 short tip" }`,
    );
  }
  if (wantMeta) {
    shape.push(
      `"meta": { "primaryTexts": [4 strings ~125 chars], "headlines": [5 strings <=40 chars], "descriptions": [3 strings <=30 chars], "creativeIdeas": [3 short visual/creative suggestions], "notes": "1 short tip" }`,
    );
  }

  return `Business: ${input.businessName}
Advertising: ${input.offer}
Objective: ${input.objective || "drive qualified leads/sales"}
Target audience: ${input.audience || "the business's ideal local customers"}
Key selling points: ${input.keyPoints || "(use your judgment based on the offer)"}
Call to action: ${input.cta || "(choose a strong, relevant CTA)"}${brand}

Return JSON with exactly these keys: { ${shape.join(", ")} }`;
}

/** Pull the first {...} JSON object out of a model response and parse it. */
function parseJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("The AI response wasn't valid JSON.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export async function generateAdCampaign(input: AdInput): Promise<AdContent> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Ad generation needs ANTHROPIC_API_KEY set on the server.");
  }
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const parsed = parseJsonObject(text) as AdContent;
  // Normalize so the UI never crashes on a missing array.
  const content: AdContent = {};
  if (parsed.google) {
    content.google = {
      headlines: parsed.google.headlines ?? [],
      descriptions: parsed.google.descriptions ?? [],
      keywords: parsed.google.keywords ?? [],
      notes: parsed.google.notes,
    };
  }
  if (parsed.meta) {
    content.meta = {
      primaryTexts: parsed.meta.primaryTexts ?? [],
      headlines: parsed.meta.headlines ?? [],
      descriptions: parsed.meta.descriptions ?? [],
      creativeIdeas: parsed.meta.creativeIdeas ?? [],
      notes: parsed.meta.notes,
    };
  }
  if (!content.google && !content.meta) {
    throw new Error("The AI didn't return any ad content — try again.");
  }
  return content;
}
