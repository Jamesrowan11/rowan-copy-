#!/usr/bin/env bash
# Build the Lovable marketing site into site/ as plain HTML, CSS and JS.
# Run this after changing anything in lovable-site/, then commit site/.
# Needs Node.js 20+ (only on the computer that builds, not on the web server).
set -euo pipefail
cd "$(dirname "$0")/lovable-site"
npm ci --no-audit --no-fund --loglevel=error || npm install --no-audit --no-fund --loglevel=error
rm -rf .output
npm run build:static
cd ..
rm -rf site
mkdir site
cp -R lovable-site/.output/public/. site/
rm -f site/_headers
echo "Built $(find site -name index.html | wc -l) pages into site/"
