import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Provision mailboxes on the Plesk mail server from the portal. Mirrors the
// scoped-sudo `plesk bin` pattern used for subdomains/aliases: the Node app user
// is granted a sudoers rule for ONLY `plesk bin mail` (see DEPLOY-PLESK.md).
// Inputs are validated and passed via execFile (no shell) so there is no
// injection surface.

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

function assertEmail(address: string): void {
  if (!EMAIL_RE.test(address)) throw new Error("Invalid email address.");
}
function assertPassword(password: string): void {
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");
}

/** Create a real mailbox account on the Plesk mail server. */
export async function pleskCreateMailbox(address: string, password: string): Promise<void> {
  assertEmail(address);
  assertPassword(password);
  await execFileAsync("sudo", [
    "plesk", "bin", "mail", "--create", address, "-mailbox", "true", "-passwd", password,
  ]);
}

/** Set/reset the password of an existing Plesk mailbox. */
export async function pleskSetPassword(address: string, password: string): Promise<void> {
  assertEmail(address);
  assertPassword(password);
  await execFileAsync("sudo", [
    "plesk", "bin", "mail", "--update", address, "-passwd", password,
  ]);
}

/** Remove a mailbox account from the Plesk mail server. */
export async function pleskRemoveMailbox(address: string): Promise<void> {
  assertEmail(address);
  await execFileAsync("sudo", ["plesk", "bin", "mail", "--remove", address]);
}
