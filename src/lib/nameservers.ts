import { promises as dns } from "dns";

// Detect whether a domain's nameservers actually point at our server, so the DNS
// pages can tell people what to switch their nameservers to when they don't.
// Editing DNS in the portal only affects the world if WE are the authoritative
// DNS for the domain — i.e. the registrar delegates to our nameservers.

const SERVER_IP = process.env.DEMO_SERVER_IP || "3.151.16.78";
const DOMAIN = process.env.DEMO_DOMAIN || "rowancopy.com";

/**
 * The nameservers customers should delegate to. Set PORTAL_NAMESERVERS (comma-
 * separated) to whatever Plesk shows under Tools & Settings → DNS; otherwise we
 * fall back to ns1/ns2 of the main domain.
 */
export function expectedNameservers(): string[] {
  const raw = process.env.PORTAL_NAMESERVERS;
  if (raw) return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [`ns1.${DOMAIN}`, `ns2.${DOMAIN}`];
}

export type NameserverStatus = {
  domain: string;
  current: string[];   // the domain's current NS delegation (public DNS)
  expected: string[];  // what they should be set to
  pointsHere: boolean; // delegation matches us (by name or by IP)
  checked: boolean;    // false if the NS lookup didn't resolve
};

async function resolveNsSafe(host: string): Promise<string[]> {
  try {
    return await dns.resolveNs(host);
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

/** Look up a domain's nameservers and decide whether they point at us. Never throws. */
export async function nameserverStatus(domain: string): Promise<NameserverStatus> {
  const d = domain.trim().toLowerCase();
  const expected = expectedNameservers();
  const current = (await resolveNsSafe(d)).map((n) => n.replace(/\.$/, "").toLowerCase());

  if (current.length === 0) {
    return { domain: d, current: [], expected, pointsHere: false, checked: false };
  }

  // Match by hostname first, then fall back to "does an NS resolve to our IP".
  const expectedSet = new Set(expected);
  let pointsHere = current.some((ns) => expectedSet.has(ns));
  if (!pointsHere) {
    const ipLists = await Promise.all(current.map((ns) => resolve4Safe(ns)));
    pointsHere = ipLists.some((ips) => ips.includes(SERVER_IP));
  }

  return { domain: d, current, expected, pointsHere, checked: true };
}
