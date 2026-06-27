import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Manage subdomains and custom-domain aliases on the Plesk server from the
// portal. Mirrors the scoped-sudo `plesk bin` pattern (see DEPLOY-PLESK.md):
// the Node app user is granted sudoers rules for ONLY the whitelisted
// `plesk bin subdomain` / `plesk bin site-alias` actions. Inputs are validated
// and passed via execFile (no shell) so there is no injection surface.

const DOMAIN = process.env.DEMO_DOMAIN || "rowancopy.com";
const VHOST_ROOT = process.env.DEMO_VHOST_ROOT || `/var/www/vhosts/${DOMAIN}`;

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/i;

export function isValidLabel(label: string): boolean {
  return LABEL_RE.test(label);
}
export function isValidHostname(host: string): boolean {
  return HOSTNAME_RE.test(host) && !host.endsWith("-");
}

function assertLabel(label: string): void {
  if (!isValidLabel(label)) {
    throw new Error("Subdomain must be lowercase letters, numbers, and hyphens.");
  }
}
function assertHostname(host: string): void {
  if (!isValidHostname(host)) throw new Error("Enter a valid domain name.");
}

/** The parent domain new subdomains are created under (e.g. rowancopy.com). */
export function parentDomain(): string {
  return DOMAIN;
}

/**
 * List the subdomain labels that currently exist on the server under DOMAIN.
 * Read-only and best-effort: returns [] if the plesk CLI isn't available, so a
 * dev/sandbox host (or a transient error) degrades to an empty overview rather
 * than throwing. Output of `plesk bin subdomain --list` is one name per line;
 * we strip a trailing `.<DOMAIN>` when present so callers always get bare labels.
 */
export async function pleskListSubdomains(): Promise<string[]> {
  let stdout = "";
  try {
    ({ stdout } = await execFileAsync("sudo", ["plesk", "bin", "subdomain", "--list"]));
  } catch {
    return [];
  }
  const suffix = `.${DOMAIN}`;
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((name) => (name.endsWith(suffix) ? name.slice(0, -suffix.length) : name))
    .filter((name) => isValidLabel(name));
}

/**
 * Create a subdomain under DOMAIN and seed a minimal placeholder page so it
 * resolves cleanly. Wildcard DNS + Plesk auto-SSL cover resolution/HTTPS.
 */
export async function pleskCreateSubdomain(label: string, placeholderHtml?: string): Promise<string> {
  assertLabel(label);
  await execFileAsync("sudo", [
    "plesk", "bin", "subdomain", "--create", label,
    "-domain", DOMAIN, "-www-root", `/${label}`,
  ]);
  const webRoot = path.join(VHOST_ROOT, label);
  await fs.mkdir(webRoot, { recursive: true });
  await fs.writeFile(
    path.join(webRoot, "index.html"),
    placeholderHtml ?? defaultPlaceholder(label),
    "utf8",
  );
  return `https://${label}.${DOMAIN}`;
}

/** Remove a subdomain from the server. */
export async function pleskRemoveSubdomain(label: string): Promise<void> {
  assertLabel(label);
  await execFileAsync("sudo", [
    "plesk", "bin", "subdomain", "--remove", label, "-domain", DOMAIN,
  ]);
}

/** Remove a custom-domain site alias from the server. */
export async function pleskRemoveAlias(alias: string): Promise<void> {
  const a = alias.trim().toLowerCase();
  assertHostname(a);
  await execFileAsync("sudo", ["plesk", "bin", "site-alias", "--remove", a]);
}

function defaultPlaceholder(label: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${label}.${DOMAIN}</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}main{text-align:center}</style>
</head><body><main><h1>${label}.${DOMAIN}</h1><p>This subdomain is ready. Content coming soon.</p></main></body></html>`;
}
