// Startup file for Plesk (Phusion Passenger).
//
// Set this file as the "Application Startup File" in the Plesk Node.js UI.
// It boots the Next.js standalone server produced by `next build`
// (output: 'standalone'). Passenger provides the PORT to listen on.
//
// Make sure you've run `npm run build` so .next/standalone exists, and that the
// postbuild step copied static assets into it (npm run build does this).
const path = require("path");

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
