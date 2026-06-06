// Startup file for the Next.js standalone server (output: 'standalone').
//
// Works on Windows (IIS HttpPlatformHandler, NSSM, PM2, or a plain console) and
// on Linux. Run it with:  node server.js
//
// Port resolution (in priority order):
//   1. HTTP_PLATFORM_PORT  — set by IIS HttpPlatformHandler
//   2. PORT                — set by NSSM/PM2/your service or shell
//   3. 3000                — default
//
// Make sure you've run `npm run build` first so .next/standalone exists, and
// that the postbuild step copied static assets into it (npm run build does this).
const path = require("path");
const fs = require("fs");

// --- Port: honor IIS HttpPlatformHandler's dynamic port ---------------------
if (process.env.HTTP_PLATFORM_PORT && !process.env.PORT) {
  process.env.PORT = process.env.HTTP_PLATFORM_PORT;
}

// --- Load a .env file from the app root, if present -------------------------
// Real environment variables (set in the service/IIS config or system-wide)
// always win — this only fills in anything not already set. This lets a simple
// .env file in the application root work even though we run from a subfolder.
function loadDotEnv(file) {
  try {
    if (!fs.existsSync(file)) return;
    const text = fs.readFileSync(file, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (err) {
    console.error("[server] Could not read .env:", err.message);
  }
}

loadDotEnv(path.join(__dirname, ".env"));

// --- Boot the standalone server ---------------------------------------------
const standaloneDir = path.join(__dirname, ".next", "standalone");
// The standalone server resolves .next/ and public/ relative to its own
// directory, so run with that as the working directory.
process.chdir(standaloneDir);

const standaloneServer = path.join(standaloneDir, "server.js");

try {
  require(standaloneServer);
} catch (err) {
  console.error(
    "Could not start the Next.js standalone server. Did you run `npm run build`?",
  );
  console.error(err);
  process.exit(1);
}
