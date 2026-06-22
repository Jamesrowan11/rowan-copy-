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
