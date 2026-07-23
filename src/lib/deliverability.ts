import { promises as dns } from "dns";
import { SERVER_IP } from "@/lib/dns-preflight";

// Email deliverability auditor — the checks that decide inbox vs. spam folder:
// SPF, DKIM, DMARC, MX, reverse DNS (PTR + forward-confirm), and DNS blocklist
// status. Pure DNS lookups: free, fast, no external services. Used by the AI
// board's Deliverability director (which PAUSES outreach when a critical check
// fails, protecting sender reputation automatically) and by the health panel
// on the AI board page.

const MAIL_DOMAIN = process.env.DEMO_DOMAIN || "rowancopy.com";

export type DeliverabilityCheck = {
  name: string;
  ok: boolean;
  critical: boolean; // a failing critical check pauses autonomous outreach
  detail: string;
};
export type DeliverabilityReport = {
  domain: string;
  serverIp: string;
  checks: DeliverabilityCheck[];
  healthy: boolean; // no critical failures
};

async function resolveTxtSafe(host: string): Promise<string[]> {
  try {
    return (await dns.resolveTxt(host)).map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

async function checkSpf(): Promise<DeliverabilityCheck> {
  const txts = await resolveTxtSafe(MAIL_DOMAIN);
  const spf = txts.filter((t) => t.toLowerCase().startsWith("v=spf1"));
  if (spf.length === 0) {
    return { name: "SPF", ok: false, critical: true, detail: `No SPF record on ${MAIL_DOMAIN}. Add TXT: "v=spf1 a mx ~all".` };
  }
  if (spf.length > 1) {
    return { name: "SPF", ok: false, critical: true, detail: "Multiple SPF records found — receivers treat that as a permanent error. Merge them into one." };
  }
  const record = spf[0].toLowerCase();
  const coversServer = record.includes(" a") || record.includes("+a") || record.includes("mx");
  const note = record.includes("amazonses.com") ? " (includes SES)" : "";
  return coversServer
    ? { name: "SPF", ok: true, critical: true, detail: `${spf[0]}${note}` }
    : { name: "SPF", ok: false, critical: true, detail: `SPF exists but doesn't authorize this server — add "a mx" mechanisms: ${spf[0]}` };
}

async function checkDkim(): Promise<DeliverabilityCheck> {
  const txts = await resolveTxtSafe(`default._domainkey.${MAIL_DOMAIN}`);
  const key = txts.find((t) => t.toLowerCase().includes("v=dkim1") || t.includes("p="));
  return key
    ? { name: "DKIM", ok: true, critical: true, detail: "Signing key published (default._domainkey)." }
    : { name: "DKIM", ok: false, critical: true, detail: `No DKIM key at default._domainkey.${MAIL_DOMAIN}. Enable DKIM in Plesk → Mail Settings.` };
}

async function checkDmarc(): Promise<DeliverabilityCheck> {
  const txts = await resolveTxtSafe(`_dmarc.${MAIL_DOMAIN}`);
  const rec = txts.find((t) => t.toLowerCase().startsWith("v=dmarc1"));
  return rec
    ? { name: "DMARC", ok: true, critical: false, detail: rec }
    : { name: "DMARC", ok: false, critical: false, detail: `No DMARC record. Add TXT on _dmarc.${MAIL_DOMAIN}: "v=DMARC1; p=none; rua=mailto:landen@${MAIL_DOMAIN}".` };
}

async function checkMx(): Promise<DeliverabilityCheck> {
  try {
    const mx = await dns.resolveMx(MAIL_DOMAIN);
    if (mx.length === 0) return { name: "MX", ok: false, critical: true, detail: "No MX record — replies to your outreach will bounce." };
    const hosts = mx.map((m) => m.exchange.replace(/\.$/, ""));
    const ips = (await Promise.all(hosts.map(async (h) => { try { return await dns.resolve4(h); } catch { return []; } }))).flat();
    return ips.includes(SERVER_IP)
      ? { name: "MX", ok: true, critical: true, detail: `Mail routes here (${hosts.join(", ")}).` }
      : { name: "MX", ok: false, critical: true, detail: `MX points elsewhere (${hosts.join(", ")}) — replies won't reach this server.` };
  } catch {
    return { name: "MX", ok: false, critical: true, detail: "MX lookup failed." };
  }
}

// PTR must be measured from the OUTSIDE: this server is its own authoritative
// DNS and can hold a stale local copy of its reverse record, while receiving
// mail servers only ever see the public answer. Ask Google/Cloudflare directly
// (fall back to the system resolver if they're unreachable).
async function reversePublic(ip: string): Promise<string[]> {
  const resolver = new dns.Resolver();
  resolver.setServers(["8.8.8.8", "1.1.1.1"]);
  try {
    return await resolver.reverse(ip);
  } catch {
    return dns.reverse(ip);
  }
}
async function resolve4Public(host: string): Promise<string[]> {
  const resolver = new dns.Resolver();
  resolver.setServers(["8.8.8.8", "1.1.1.1"]);
  try {
    return await resolver.resolve4(host);
  } catch {
    return dns.resolve4(host);
  }
}

async function checkPtr(): Promise<DeliverabilityCheck> {
  let names: string[] = [];
  try {
    names = await reversePublic(SERVER_IP);
  } catch {
    return { name: "Reverse DNS (PTR)", ok: false, critical: true, detail: `No PTR record for ${SERVER_IP}. Set it to mail.${MAIL_DOMAIN} in EC2 → Elastic IPs → Update reverse DNS.` };
  }
  const ptr = names[0]?.replace(/\.$/, "") ?? "";
  const matchesDomain = names.some((n) => n.replace(/\.$/, "").endsWith(MAIL_DOMAIN));
  if (!matchesDomain) {
    return { name: "Reverse DNS (PTR)", ok: false, critical: true, detail: `PTR is "${ptr}" — a generic host name. Set it to mail.${MAIL_DOMAIN} (EC2 → Elastic IPs → Update reverse DNS); big providers spam-filter mismatched PTRs.` };
  }
  // Forward-confirm: the PTR name should resolve back to the IP.
  try {
    const back = await resolve4Public(ptr);
    if (!back.includes(SERVER_IP)) {
      return { name: "Reverse DNS (PTR)", ok: false, critical: true, detail: `PTR "${ptr}" doesn't resolve back to ${SERVER_IP} — add that A record.` };
    }
  } catch {
    return { name: "Reverse DNS (PTR)", ok: false, critical: true, detail: `PTR "${ptr}" doesn't resolve back to ${SERVER_IP} — add that A record.` };
  }
  return { name: "Reverse DNS (PTR)", ok: true, critical: true, detail: `${ptr} ⇄ ${SERVER_IP} (forward-confirmed).` };
}

// DNS blocklists. NXDOMAIN = clean; 127.0.0.x = listed. Spamhaus returns
// 127.255.255.x when the query itself is refused (open resolver) — treat that
// as "unknown", not "listed".
const BLOCKLISTS = ["zen.spamhaus.org", "bl.spamcop.net", "b.barracudacentral.org"];

async function checkBlocklists(): Promise<DeliverabilityCheck> {
  const reversed = SERVER_IP.split(".").reverse().join(".");
  const listed: string[] = [];
  const unknown: string[] = [];
  await Promise.all(
    BLOCKLISTS.map(async (bl) => {
      try {
        const answers = await dns.resolve4(`${reversed}.${bl}`);
        if (answers.some((a) => a.startsWith("127.255.255."))) unknown.push(bl);
        else if (answers.some((a) => a.startsWith("127."))) listed.push(bl);
      } catch {
        /* NXDOMAIN etc. = not listed */
      }
    }),
  );
  if (listed.length > 0) {
    return { name: "Blocklists", ok: false, critical: true, detail: `LISTED on ${listed.join(", ")} — outreach is paused; request delisting on the list's site before resuming.` };
  }
  const note = unknown.length > 0 ? ` (${unknown.join(", ")} couldn't be queried from this resolver)` : "";
  return { name: "Blocklists", ok: true, critical: true, detail: `Not listed on ${BLOCKLISTS.filter((b) => !unknown.includes(b)).join(", ")}${note}.` };
}

/** Run the full deliverability audit. Never throws. */
export async function checkDeliverability(): Promise<DeliverabilityReport> {
  const checks = await Promise.all([
    checkSpf(),
    checkDkim(),
    checkDmarc(),
    checkMx(),
    checkPtr(),
    checkBlocklists(),
  ]);
  return {
    domain: MAIL_DOMAIN,
    serverIp: SERVER_IP,
    checks,
    healthy: checks.every((c) => c.ok || !c.critical),
  };
}
