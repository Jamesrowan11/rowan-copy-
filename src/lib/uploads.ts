import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Files are stored locally under /uploads (gitignored). The structure is ready
// to swap for cloud storage (S3, etc.) — only this module needs to change.
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "text/plain",
]);

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

export async function saveUpload(file: File): Promise<{
  storedName: string;
  originalName: string;
  mimeType: string;
  size: number;
}> {
  if (file.size > MAX_BYTES) {
    throw new Error("File is too large (max 15 MB).");
  }
  if (!isAllowedMime(file.type)) {
    throw new Error("Unsupported file type. Allowed: PDF, DOCX, images, TXT.");
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const ext = path.extname(file.name) || "";
  const storedName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, storedName), buffer);

  return {
    storedName,
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

export async function readUpload(storedName: string): Promise<Buffer> {
  // Prevent path traversal — only a bare filename is ever allowed.
  const safe = path.basename(storedName);
  return fs.readFile(path.join(UPLOAD_DIR, safe));
}
