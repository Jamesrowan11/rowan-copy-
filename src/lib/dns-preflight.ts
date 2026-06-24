import { promises as dns } from "dns";
import Anthropic from "@anthropic-ai/sdk";

// Pre-flight DNS check for "Go Live on Custom Domain". We gather REAL facts via
// Node's DNS resolver first, then (optionally) ask the model to explain them in
// plain English. The model only INTERPRETS the facts below — it never performs
// lookups or invents DNS data.

export const SERVER_IP = process.env.DEMO_SERVER_IP || "3.151.16.78";

export type DnsFacts = {
  domain: string;
  serverIp: string;
  root: { ips: string[]; pointsToUs: boolean; otherIps: string[] };
  www: { ips: string[]; cnames: string[]; pointsToUs: boolean };
};

export type PreflightResult = {
  facts: DnsFacts;
  rootOk: boolean;
  wwwOk: boolean;
  ready: boolean; // root points to us (www is a "should", not a hard requirement)
  report: string;
};

async function resolve4Safe(host: string): Promise<string[]> {
  try {
    return await dns.resolve4(host);
  } catch {
    return [];
  }
}
async function resolveCnameSafe(host: string): Promise<string[]> {
  try {
    return await dns.resolveCname(host);
  } catch {
    return [];
  }
}

/** Perform the real DNS lookups for a domain. Never throws. */
export async function lookupDns(domain: string): Promise<DnsFacts> {
  const root = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").trim().toLowerCase();
  const wwwHost = `www.${root}`;

  const [rootIps, wwwIps, wwwCnames] = await Promise.all([
    resolve4Safe(root),
    resolve4Safe(wwwHost),
    resolveCnameSafe(wwwHost),
  ]);

  const rootPointsToUs = rootIps.includes(SERVER_IP);
  // www points to us if it has our A record, OR it CNAMEs to the root/our subdomain
  // and the root already points to us.
  const wwwCnameToUs = wwwCnames.some(
    (c) => c.replace(/\.$/, "").toLowerCase() === root || c.toLowerCase().includes(".rowancopy.com"),
  );
  const wwwPointsToUs = wwwIps.includes(SERVER_IP) || (wwwCnameToUs && rootPointsToUs);

  return {
    domain: root,
    serverIp: SERVER_IP,
    root: {
      ips: rootIps,
      pointsToUs: rootPointsToUs,
      otherIps: rootIps.filter((ip) => ip !== SERVER_IP),
    },
    www: { ips: wwwIps, cnames: wwwCnames, pointsToUs: wwwPointsToUs },
  };
}

// Deterministic fallback report (used when no ANTHROPIC_API_KEY, or the model
// call fails) so the pre-flight always works.
function deterministicReport(f: DnsFacts): string {
  const lines: string[] = [];
  if (f.root.pointsToUs) {
    lines.push(`✅ Your domain ${f.domain} points to our server (${f.serverIp}). The root is ready.`);
  } else if (f.root.otherIps.length > 0) {
    lines.push(`❌ ${f.domain} currently points to ${f.root.otherIps.join(", ")} — that's your old host. Change the A record for the root (@) to ${f.serverIp}.`);
  } else if (f.root.ips.length === 0) {
    lines.push(`❌ We couldn't find any A record for ${f.domain}. Add an A record for the root (@) pointing to ${f.serverIp}.`);
  } else {
    lines.push(`❌ ${f.domain} doesn't point to us yet. Set its A record (@) to ${f.serverIp}.`);
  }

  if (f.www.pointsToUs) {
    lines.push(`✅ www.${f.domain} also resolves to us.`);
  } else {
    lines.push(`⚠️ www.${f.domain} isn't pointing here yet. Add a second A record for "www" pointing to ${f.serverIp} (or a CNAME for "www" to ${f.domain}). Recommended so both www and non-www work.`);
  }

  lines.push(
    f.root.pointsToUs
      ? `\nNext step: you're clear to go live. (DNS changes can take up to an hour to fully propagate.)`
      : `\nNext step: update the A record above, wait a few minutes for it to propagate, then run the check again.`,
  );
  return lines.join("\n");
}

const SYSTEM = `You are a friendly hosting assistant explaining a DNS readiness check to a NON-technical small-business owner who wants to point their custom domain at our website. You are given ONLY the factual results of real DNS lookups. Interpret and explain them plainly. Do NOT invent any DNS facts beyond what's provided, and do NOT claim to change anything — a human will click "Go Live".

Write a short report (a few lines): what's already correct, what (if anything) still needs fixing, and the EXACT next step in concrete terms (which record to add/change and to what value). If everything points to us, say they're ready to go live and mention DNS can take up to an hour to propagate. Use simple language; a couple of check/✗ marks are fine. No preamble.`;

/** Ask the model to explain the facts. Falls back to a deterministic report. */
async function explainReadiness(facts: DnsFacts): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return deterministicReport(facts);
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `Here are the real DNS lookup results (the only facts you may use):\n${JSON.stringify(facts, null, 2)}`,
        },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || deterministicReport(facts);
  } catch {
    return deterministicReport(facts);
  }
}

/** Full pre-flight: real lookups -> AI explanation -> readiness verdict. */
export async function runPreflight(domain: string): Promise<PreflightResult> {
  const facts = await lookupDns(domain);
  const report = await explainReadiness(facts);
  const rootOk = facts.root.pointsToUs;
  const wwwOk = facts.www.pointsToUs;
  return { facts, rootOk, wwwOk, ready: rootOk, report };
}
