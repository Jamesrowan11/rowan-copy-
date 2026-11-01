// Rowan Copy: build the site as plain HTML files for our own (PHP/Plesk) server.
// Every page is pre-rendered at build time, so no Node.js server is needed in production.
// Used by `npm run build:static` (see build-site.sh). Not used by Lovable.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    prerender: { enabled: true, crawlLinks: false },
    pages: ["/", "/services", "/work", "/about", "/pricing", "/contact"].map((path) => ({ path })),
  },
  vite: {
    // Keep the build's files apart from the PHP app's own assets/ folder.
    build: { assetsDir: "static" },
  },
});
