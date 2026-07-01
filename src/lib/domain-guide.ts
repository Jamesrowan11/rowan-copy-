import { lookupDns, SERVER_IP } from "./dns-preflight";

// Builds the plain-English "point your domain at us" guide for a Project, plus a
// live status from real DNS lookups. Shown to BOTH the admin and the customer so
// everyone sees exactly which records to add and whether it's pointing here yet.

export type DomainRecord = { type: string; host: string; value: string; label: string };
export type DomainGuideStatus = "Live" | "Partial" | "NotPointing";

export type DomainGuide = {
  domain: string;
  serverIp: string;
  records: DomainRecord[];
  rootOk: boolean;
  wwwOk: boolean;
  status: DomainGuideStatus;
  currentRootIps: string[];
  steps: string[];
};

export async function buildDomainGuide(domain: string): Promise<DomainGuide> {
  const facts = await lookupDns(domain);
  const rootOk = facts.root.pointsToUs;
  const wwwOk = facts.www.pointsToUs;

  const records: DomainRecord[] = [
    { type: "A", host: "@", value: SERVER_IP, label: "Root domain" },
    { type: "A", host: "www", value: SERVER_IP, label: "www subdomain" },
  ];

  const status: DomainGuideStatus = rootOk ? (wwwOk ? "Live" : "Partial") : "NotPointing";

  const steps = [
    `Sign in to the account where the domain ${facts.domain} was purchased (the registrar — e.g. GoDaddy, Namecheap, Squarespace/Google, Cloudflare).`,
    `Open its DNS settings (often labeled "DNS", "DNS Management", or "Manage DNS").`,
    `Add or edit an A record for the root — host "@" — pointing to ${SERVER_IP}.` +
      (facts.root.otherIps.length ? ` (It currently points to ${facts.root.otherIps.join(", ")} — change it.)` : ""),
    `Add or edit an A record for "www" pointing to ${SERVER_IP} (so both www and non-www work).`,
    `Save. DNS changes can take from a few minutes up to 24–48 hours to fully take effect.`,
    `Once it points here, Rowan Copy finishes connecting it and secures it with HTTPS — nothing more for you to do.`,
  ];

  return {
    domain: facts.domain,
    serverIp: SERVER_IP,
    records,
    rootOk,
    wwwOk,
    status,
    currentRootIps: facts.root.ips,
    steps,
  };
}
