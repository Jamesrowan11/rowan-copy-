import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Deploys generated demo sites to subdomains on this same Plesk server. The Node
// app user is granted a scoped sudoers rule allowing ONLY `plesk bin subdomain`
// (see DEPLOY-PLESK.md). Wildcard DNS (*.rowancopy.com) + Plesk "keep websites
// secured" handle resolution and SSL automatically.

const DOMAIN = process.env.DEMO_DOMAIN || "rowancopy.com";
const VHOST_ROOT = process.env.DEMO_VHOST_ROOT || `/var/www/vhosts/${DOMAIN}`;

/**
 * Create the subdomain and write the generated index.html into its web root.
 * Returns the live URL. Throws on Plesk error (caller marks DeployFailed).
 */
export async function deploySubdomain(label: string, html: string): Promise<string> {
  // label is already slugified to [a-z0-9-]; execFile (no shell) avoids injection.
  await execFileAsync("sudo", [
    "plesk",
    "bin",
    "subdomain",
    "--create",
    label,
    "-domain",
    DOMAIN,
    "-www-root",
    `/${label}`,
  ]);

  const webRoot = path.join(VHOST_ROOT, label);
  await fs.mkdir(webRoot, { recursive: true });
  await fs.writeFile(path.join(webRoot, "index.html"), html, "utf8");

  return `https://${label}.${DOMAIN}`;
}

/**
 * Redeploy to an EXISTING subdomain: write a new index.html into its web root
 * WITHOUT creating a new subdomain (so subdomainLabel and liveUrl don't change).
 * Writes to a temp file then atomically renames, so a failed write can never
 * leave the live site half-written — the previous version stays intact.
 */
export async function redeploySubdomain(label: string, html: string): Promise<void> {
  const webRoot = path.join(VHOST_ROOT, label);
  await fs.mkdir(webRoot, { recursive: true });
  const target = path.join(webRoot, "index.html");
  const tmp = path.join(webRoot, `.index.html.${process.pid}.tmp`);
  await fs.writeFile(tmp, html, "utf8");
  await fs.rename(tmp, target); // atomic on the same filesystem
}

/** Read the currently deployed index.html for a subdomain, or null if unavailable. */
export async function readDeployedHtml(label: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(VHOST_ROOT, label, "index.html"), "utf8");
  } catch {
    return null;
  }
}

/**
 * Point a client's custom domain at an EXISTING demo subdomain's docroot by
 * creating a Plesk site alias of `<label>.<DOMAIN>` (additive — the subdomain
 * keeps working; both root and www are aliased; Plesk auto-SSL covers the alias).
 * Needs a scoped sudoers rule for `plesk bin site-alias` (see DEPLOY-PLESK.md).
 * `customDomain` is validated (hostname) by the caller; execFile uses no shell.
 */
export async function addCustomDomainAlias(
  customDomain: string,
  subdomainLabel: string,
): Promise<string> {
  const fqdn = `${subdomainLabel}.${DOMAIN}`;
  await execFileAsync("sudo", [
    "plesk",
    "bin",
    "site-alias",
    "--create",
    customDomain,
    "-domain",
    fqdn,
    "-www",
    "true",
  ]);
  return `https://${customDomain}`;
}

/** Remove the subdomain (best-effort teardown). */
export async function teardownSubdomain(label: string): Promise<void> {
  await execFileAsync("sudo", [
    "plesk",
    "bin",
    "subdomain",
    "--remove",
    label,
    "-domain",
    DOMAIN,
  ]);
}
