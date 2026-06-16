import crypto from "crypto";

// Symmetric encryption (AES-256-GCM) for secrets at rest — specifically the
// per-employee mailbox passwords. The key is derived from MAIL_CRYPTO_SECRET if
// set, otherwise from AUTH_SECRET (which always exists in a real deployment),
// so this works with no extra configuration.
//
// Stored format: base64( iv[12] | authTag[16] | ciphertext ), prefixed "v1:".

const PREFIX = "v1:";

function getKey(): Buffer {
  const secret =
    process.env.MAIL_CRYPTO_SECRET || process.env.AUTH_SECRET || "";
  if (!secret) {
    throw new Error(
      "Cannot encrypt mailbox secrets: set MAIL_CRYPTO_SECRET or AUTH_SECRET.",
    );
  }
  // Derive a stable 32-byte key from the secret.
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) {
    throw new Error("Malformed encrypted secret.");
  }
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
