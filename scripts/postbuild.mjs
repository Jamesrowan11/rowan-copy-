// After `next build` with output: 'standalone', Next produces a self-contained
// server at .next/standalone/server.js but does NOT copy static assets or the
// public/ folder into it. This script copies them so the standalone server
// (booted by server.js in production) can serve everything.
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.log("[postbuild] No standalone output found — skipping asset copy.");
  process.exit(0);
}

async function copyIfExists(from, to) {
  if (!existsSync(from)) return;
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
  console.log(`[postbuild] Copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

await copyIfExists(
  path.join(root, ".next", "static"),
  path.join(standalone, ".next", "static"),
);
await copyIfExists(path.join(root, "public"), path.join(standalone, "public"));

console.log("[postbuild] Standalone assets ready.");
