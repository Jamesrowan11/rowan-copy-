import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Manage DNS records on the Plesk server from the portal. Mirrors the
// scoped-sudo `plesk bin` pattern (see DEPLOY-PLESK.md): the Node app user is
// granted a sudoers rule for ONLY `plesk bin dns`. Inputs are validated and
// passed via execFile (no shell) so there is no injection surface.
//
// IMPORTANT: this only affects what the world resolves if Plesk is the
// AUTHORITATIVE DNS server for the domain. If DNS is hosted elsewhere (Route 53,
// the registrar, Cloudflare, …), these records are local-only and have no public
// effect — the UI says as much, and the listing reflects whatever the zone holds.

// We deliberately support only low-risk record types. MX/NS/SOA/SRV are excluded
// to avoid foot-guns (a bad MX/NS can break mail or delegate the whole zone).
export const DNS_TYPES = ["A", "AAAA", "CNAME", "TXT"] as const;
export type DnsType = (typeof DNS_TYPES)[number];

export type DnsRecord = {
  id: string | null; // present only when Plesk's output exposes a per-record id
  host: string;
  type: string;
  value: string;
};

const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})*\.?$/i;
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6_RE = /^[0-9a-f:]+$/i;

export function isDnsType(t: string): t is DnsType {
  return (DNS_TYPES as readonly string[]).includes(t);
}

function assertDomain(domain: string): void {
  if (!HOSTNAME_RE.test(domain)) throw new Error("Enter a valid domain name.");
}

/**
 * List the DNS records Plesk holds for a domain. Read-only and best-effort:
 * returns [] if the plesk CLI isn't available or the domain isn't hosted here,
 * so a dev/sandbox host (or a domain whose DNS lives elsewhere) degrades to an
 * empty list rather than throwing.
 *
 * Plesk's `dns --info` output format varies by version. We parse it defensively:
 * a per-record numeric `id` is captured ONLY when the format clearly exposes one
 * (so the UI can offer a precise delete); otherwise the record is read-only.
 */
export async function pleskListDns(domain: string): Promise<DnsRecord[]> {
  if (!HOSTNAME_RE.test(domain)) return [];
  let stdout = "";
  try {
    ({ stdout } = await execFileAsync("sudo", ["plesk", "bin", "dns", "--info", domain]));
  } catch {
    return [];
  }
  return parseDnsInfo(stdout);
}

// Exported for unit-level reasoning/tests; pure string parsing, no I/O.
export function parseDnsInfo(stdout: string): DnsRecord[] {
  const records: DnsRecord[] = [];
  const lines = stdout.split("\n");

  // Labeled/blocked format:  "id: 12", "host: www.x.com.", "type: A", "value: 1.2.3.4"
  let cur: Partial<DnsRecord> = {};
  let sawLabeled = false;
  const flush = () => {
    if (cur.type && (cur.host || cur.value)) {
      records.push({
        id: cur.id ?? null,
        host: (cur.host || "").trim(),
        type: (cur.type || "").trim().toUpperCase(),
        value: (cur.value || "").trim(),
      });
    }
    cur = {};
  };
  for (const raw of lines) {
    const m = raw.match(/^\s*(id|host|source|type|record\s*type|value|destination|dst)\s*:\s*(.+?)\s*$/i);
    if (!m) continue;
    sawLabeled = true;
    const key = m[1].toLowerCase().replace(/\s+/g, "");
    const val = m[2].trim();
    if (key === "id") {
      if (cur.type || cur.host || cur.value) flush();
      if (/^\d+$/.test(val)) cur.id = val;
    } else if (key === "host" || key === "source") {
      cur.host = val;
    } else if (key === "type" || key === "recordtype") {
      cur.type = val;
    } else if (key === "value" || key === "destination" || key === "dst") {
      cur.value = val;
    }
  }
  flush();
  if (sawLabeled && records.length) return records;

  // Columnar format:  "<host>   <type>   <value>"  (no ids in this format)
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/\s{2,}|\t+/).map((c) => c.trim()).filter(Boolean);
    if (cols.length < 3) continue;
    const type = cols[1].toUpperCase();
    if (!/^[A-Z]{1,10}$/.test(type)) continue;
    records.push({ id: null, host: cols[0], type, value: cols.slice(2).join(" ") });
  }
  return records;
}

/** Add a DNS record. Validates per type and passes args via execFile (no shell). */
export async function pleskAddDns(
  domain: string,
  type: DnsType,
  host: string,
  value: string,
): Promise<void> {
  assertDomain(domain);
  const h = host.trim();
  const v = value.trim();
  if (!isDnsType(type)) throw new Error("Unsupported record type.");

  // `host` is the record name (e.g. "www" or "@" for the root). Allow a bare
  // label, a FQDN, or "@"/empty for the zone root.
  if (h && h !== "@" && !HOSTNAME_RE.test(h)) throw new Error("Enter a valid host/subdomain.");
  const name = h === "@" ? domain : h || domain;

  let args: string[];
  switch (type) {
    case "A":
      if (!IPV4_RE.test(v)) throw new Error("Enter a valid IPv4 address.");
      args = ["plesk", "bin", "dns", "--add", domain, "-a", name, "-ip", v];
      break;
    case "AAAA":
      if (!IPV6_RE.test(v) || v.length > 45) throw new Error("Enter a valid IPv6 address.");
      args = ["plesk", "bin", "dns", "--add", domain, "-aaaa", name, "-ip", v];
      break;
    case "CNAME":
      if (!HOSTNAME_RE.test(v)) throw new Error("Enter a valid canonical hostname.");
      args = ["plesk", "bin", "dns", "--add", domain, "-cname", name, "-canonical", v];
      break;
    case "TXT":
      if (!v || v.length > 1024) throw new Error("Enter TXT content (max 1024 chars).");
      args = ["plesk", "bin", "dns", "--add", domain, "-txt", v, "-domain", name];
      break;
  }
  await execFileAsync("sudo", args);
}

/**
 * Delete a DNS record by its Plesk record id. The id MUST come from a prior
 * pleskListDns() that exposed it (numeric); we re-validate it here so a bad id
 * can never reach the CLI. Records without a parsed id are not deletable.
 */
export async function pleskDeleteDns(domain: string, id: string): Promise<void> {
  assertDomain(domain);
  if (!/^\d+$/.test(id)) throw new Error("Invalid record id.");
  await execFileAsync("sudo", ["plesk", "bin", "dns", "--del", domain, "-id", id]);
}
