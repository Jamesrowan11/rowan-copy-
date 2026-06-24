import Anthropic from "@anthropic-ai/sdk";

// Lead Generator AI layer. ANTHROPIC_API_KEY is read from the server environment
// only (by the SDK) and is never exposed to the browser — all of this runs in
// the secured /api/demos/[id]/run route.

export type ResearchResult = {
  foundExistingSite: boolean;
  researchSummary: string;
  html: string;
};

const RESEARCH_SYSTEM = `You are a senior web designer and copywriter for Rowan Copy, a small Maryland web + copywriting studio. You research a local business online, then build a sample one-page website that is clearly better than what they currently have.

Process:
1. If a current website URL is provided, study it. Otherwise, search the web for the business by name + city to find their website, Google Business listing, and social profiles.
2. Summarize what the business actually does and the state of their current online presence (1 short paragraph).
3. Generate a complete, self-contained, modern, mobile-friendly one-page HTML website personalized with their REAL services, name, and city. Use only inline <style> (no external CSS/JS frameworks, no external requests). Clean typography, a hero, services, an about blurb, and a contact/call-to-action. Tasteful, professional, fast. Write real, specific copy in a warm human voice — no Lorem Ipsum, no clichés, no invented awards or fake reviews.

If you cannot find any real online presence, build from the provided details and note that nothing was found.

Output EXACTLY in this format and nothing else:
<<<FOUND>>>true|false
<<<SUMMARY>>>
(your 1-paragraph summary)
<<<HTML>>>
(the full HTML document starting with <!doctype html>)`;

function textFrom(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function parseResearch(raw: string): ResearchResult {
  const foundMatch = /<<<FOUND>>>\s*(true|false)/i.exec(raw);
  const foundExistingSite = foundMatch ? foundMatch[1].toLowerCase() === "true" : false;

  let summary = "";
  let html = "";
  const sumIdx = raw.indexOf("<<<SUMMARY>>>");
  const htmlIdx = raw.indexOf("<<<HTML>>>");
  if (sumIdx !== -1 && htmlIdx !== -1) {
    summary = raw.slice(sumIdx + "<<<SUMMARY>>>".length, htmlIdx).trim();
    html = raw.slice(htmlIdx + "<<<HTML>>>".length).trim();
  } else {
    // Fallback: treat any html-looking content as the page.
    const docIdx = raw.toLowerCase().indexOf("<!doctype");
    if (docIdx !== -1) {
      summary = raw.slice(0, docIdx).trim();
      html = raw.slice(docIdx).trim();
    } else {
      summary = raw.trim();
    }
  }

  // Strip code fences if the model wrapped the HTML.
  html = html.replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/, "").trim();
  return { foundExistingSite, researchSummary: summary, html };
}

export async function researchAndBuild(input: {
  businessName: string;
  city: string;
  industry: string;
  currentWebsite?: string | null;
}): Promise<ResearchResult> {
  const client = new Anthropic();

  const userPrompt = [
    `Business name: ${input.businessName}`,
    `City: ${input.city}`,
    `Industry: ${input.industry}`,
    input.currentWebsite
      ? `Current website: ${input.currentWebsite}`
      : "Current website: (none provided — search for them)",
  ].join("\n");

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  // Manual loop: the web_search tool runs server-side. Re-send on pause_turn
  // until the model produces its final answer. Capped at 8 iterations.
  let last: Anthropic.Message | null = null;
  for (let i = 0; i < 8; i++) {
    last = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: [
        { type: "text", text: RESEARCH_SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages,
    });
    messages.push({ role: "assistant", content: last.content });
    if (last.stop_reason !== "pause_turn") break;
  }

  if (!last) throw new Error("No response from the model.");
  const parsed = parseResearch(textFrom(last.content));
  if (!parsed.html || !/<.*html|<!doctype/i.test(parsed.html)) {
    throw new Error("The model did not return a usable HTML page.");
  }
  return parsed;
}

const EDIT_SYSTEM = `You revise an existing one-page marketing website for a small business. You are given the CURRENT full HTML and an edit instruction. Apply ONLY what the instruction asks; keep everything else exactly as it is (copy, structure, sections, styling that wasn't mentioned). The result must remain a complete, self-contained, modern, mobile-friendly HTML document with inline <style> only (no external CSS/JS frameworks, no external requests). Do not add tracking, forms that post anywhere real, or external links you can't verify.

Output ONLY the full revised HTML document, starting with <!doctype html>. No explanation, no code fences.`;

/** Pull a full HTML document out of a model response (handles code fences / preamble). */
function extractHtml(raw: string): string {
  let html = raw.trim();
  const fenced = /```(?:html)?\s*([\s\S]*?)```/i.exec(html);
  if (fenced) html = fenced[1].trim();
  const docIdx = html.toLowerCase().indexOf("<!doctype");
  const htmlIdx = html.toLowerCase().indexOf("<html");
  const start = docIdx !== -1 ? docIdx : htmlIdx;
  if (start > 0) html = html.slice(start).trim();
  return html.replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/, "").trim();
}

/**
 * Revise an existing site's HTML per a freeform instruction and return the FULL
 * revised HTML document. Throws if the model doesn't return a usable page.
 */
export async function reviseSiteHtml(currentHtml: string, instruction: string): Promise<string> {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    system: [{ type: "text", text: EDIT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Edit instruction:\n${instruction}\n\nCURRENT HTML:\n${currentHtml}`,
      },
    ],
  });

  const raw = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const html = extractHtml(raw);
  if (!html || !/<!doctype|<html/i.test(html)) {
    throw new Error("The model did not return a usable HTML page.");
  }
  return html;
}

export type EmailDraft = { subject: string; body: string };

const EMAIL_SYSTEM = `You write short, warm, genuinely helpful cold outreach emails for Rowan Copy, a small Maryland web + copywriting studio. Never salesy, never pushy, no hype, no clichés. Under 120 words. Mention that you built them a free sample website and include the link. Sound like a real person who took the time to look at their business.

Output EXACTLY:
SUBJECT: (one line)
BODY:
(the email body)`;

export async function draftOutreachEmail(input: {
  businessName: string;
  city: string;
  researchSummary: string;
  liveUrl: string;
}): Promise<EmailDraft> {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: EMAIL_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          `Business: ${input.businessName} (${input.city})`,
          `What they do: ${input.researchSummary}`,
          input.liveUrl
            ? `Free sample site URL (include it verbatim): ${input.liveUrl}`
            : `No sample URL is available yet — say the sample is on its way.`,
        ].join("\n"),
      },
    ],
  });

  const raw = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const subjMatch = /SUBJECT:\s*(.+)/i.exec(raw);
  const bodyIdx = raw.search(/BODY:/i);
  const subject = subjMatch ? subjMatch[1].trim() : `A quick gift for ${input.businessName}`;
  let body = bodyIdx !== -1 ? raw.slice(bodyIdx + 5).trim() : raw.trim();
  // Make sure the link actually made it in.
  if (input.liveUrl && !body.includes(input.liveUrl)) {
    body += `\n\nHere's the sample: ${input.liveUrl}`;
  }
  return { subject, body };
}

// businessName -> "clean-business-name-ab12" (lowercase, a-z0-9 + hyphen).
export function slugifyLabel(businessName: string): string {
  const base = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
    .replace(/-$/, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base || "demo"}-${rand}`;
}
