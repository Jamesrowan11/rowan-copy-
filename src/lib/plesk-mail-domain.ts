import { execFile } from "child_process";
import { promisify } from "util";
import { promises as dns } from "dns";

const execFileAsync = promisify(execFile);

// Set a customer's OWN domain up for mail on the Plesk server, from the portal.
// We add it as an ADD-ON domain under the main subscription, so all customer
// domains live under one subscription (no service plans to manage). Mirrors the
// scoped-sudo `plesk bin` pattern (see DEPLOY-PLESK.md): the app user is granted
// a rule for ONLY `plesk bin domain --create/--list`. Inputs are validated and
// passed via execFile (no shell) so there is no injection surface.

const MAIN_DOMAIN = process.env.DEMO_DOMAIN || "rowancopy.com";
const SERVER_IP = process.env.DEMO_SERVER_IP || "3.151.16.78";

const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/i;

export function isValidDomain(domain: string): boolean {
  return HOSTNAME_RE.test(domain) && !domain.endsWith("-");
}
export function mailServerIp(): string {
  return SERVER_IP;
}

/**
 * Domains that currently exist on the Plesk server. Read-only, best-effort:
 * returns [] if the plesk CLI isn't available, so a dev/sandbox host degrades to
 * an empty list rather than throwing.
 */
export async function pleskListDomains(): Promise<string[]> {
  let stdout = "";
  try {
    ({ stdout } = await execFileAsync("sudo", ["plesk", "bin", "domain", "--list"]));
  } catch {
    return [];
  }
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => isValidDomain(l));
}

/**
 * Create the customer's domain as an add-on under the main subscription, with
 * mail service (enabled by default for new Plesk domains). Plesk also seeds the
 * domain's DNS zone (incl. MX) when it is the authoritative DNS for the domain.
 */
export async function pleskCreateMailDomain(domain: string): Promise<void> {
  const d = domain.trim().toLowerCase();
  if (!isValidDomain(d)) throw new Error("Enter a valid domain name.");
  if (d === MAIN_DOMAIN) throw new Error("That's the main domain — it already has mail.");
  await execFileAsync("sudo", [
    "plesk", "bin", "domain", "--create", d,
    "-webspace-name", MAIN_DOMAIN,
    "-ip", SERVER_IP,
  ]);
}

export type MailDomainStatus = {
  domain: string;
  inPlesk: boolean;       // the domain exists on the Plesk server
  mx: string[];           // public MX hostnames the world currently sees
  mxPointsHere: boolean;  // an MX target resolves to our server IP
  ready: boolean;         // set up on the server AND mail routes to us
  advice: string;         // plain-English next step
};

async function resolveMxSafe(host: string): Promise<{ exchange: string; priority: number }[]> {
  try {
    return await dns.resolveMx(host);
  } catch {
    return [];
  }
}
async function resolve4Safe(host: string): Promise<string[]> {
  try {
    return await dns.resolve4(host);
  } catch {
    return [];
  }
}

/**
 * Real-world readiness for mail on a domain: is it set up in Plesk, and does
 * public DNS route mail to us? Combines the Plesk domain list with live DNS
 * lookups. Never throws.
 */
export async function mailDomainStatus(domain: string, knownDomains?: string[]): Promise<MailDomainStatus> {
  const d = domain.trim().toLowerCase();
  const domains = knownDomains ?? (await pleskListDomains());
  const inPlesk = domains.includes(d);

  const mxRecords = await resolveMxSafe(d);
  const mx = mxRecords.map((r) => r.exchange.replace(/\.$/, "")).filter(Boolean);
  // Does any MX target resolve to our server IP?
  const targets = await Promise.all(mx.map((h) => resolve4Safe(h)));
  const mxPointsHere = targets.some((ips) => ips.includes(SERVER_IP));

  const ready = inPlesk && mxPointsHere;
  let advice: string;
  if (!inPlesk) {
    advice = `Click "Set up mail" to add ${d} to the server. Then point its MX record here.`;
  } else if (mx.length === 0) {
    advice = `${d} is set up on the server. Add an MX record at your DNS host pointing to ${d} (which must resolve to ${SERVER_IP}), or move the domain's DNS to Plesk and it's handled automatically.`;
  } else if (!mxPointsHere) {
    advice = `${d} is set up on the server, but its MX currently points elsewhere (${mx.join(", ")}). Update the MX to route mail to this server (${SERVER_IP}).`;
  } else {
    advice = `Mail is set up and routing here. You're good to go.`;
  }

  return { domain: d, inPlesk, mx, mxPointsHere, ready, advice };
}
