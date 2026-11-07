#!/usr/bin/env bash
# ============================================================================
# Runs on the builder after setup-builder-droplet.sh. Waits for the export from
# the Plesk snapshot (/srv/migration/DONE), installs the database, uploads and
# config (adjusted for DigitalOcean), publishes every site, then deletes the
# export from the shared storage (it contains secrets).
#   LB_IP=1.2.3.4 CHECK_DOMAIN=check.rowancopy.com bash import-from-plesk.sh
# ============================================================================
set -uo pipefail
APP_DIR=${APP_DIR:-/var/www/rowancopy}
src=/srv/migration
log() { echo "$(date -u +%H:%M:%S) import: $*"; }
die() { log "FAILED: $* (the export is kept in $src so this can be run again)"; exit 1; }

# Only import onto a finished builder.
[ -f /etc/rowancopy/config.php ] && [ -d /var/lib/rowancopy ] && [ -f "$APP_DIR/vendor/autoload.php" ] \
  || die "the builder isn't fully set up (run setup-builder-droplet.sh first)"

for i in $(seq 1 180); do [ -f "$src/DONE" ] && break; sleep 20; done
[ -f "$src/DONE" ] || die "no export arrived after 60 minutes"
log "export found"

systemctl stop php8.3-fpm
install -o www-data -g www-data -m 600 "$src/rowancopy.sqlite" /var/lib/rowancopy/rowancopy.sqlite || die "could not install the database"
rm -f /var/lib/rowancopy/rowancopy.sqlite-wal /var/lib/rowancopy/rowancopy.sqlite-shm
[ -f "$src/secrets.json" ] && install -o www-data -g www-data -m 600 "$src/secrets.json" /var/lib/rowancopy/secrets.json
cp -a "$src/uploads/." "$APP_DIR/uploads/" && chown -R www-data:www-data "$APP_DIR/uploads"

# The old config, with paths and hosting changed for DigitalOcean. Secrets are kept as they are.
php -r '
$c = require $argv[1];
$c["data_dir"] = "/var/lib/rowancopy";
$c["hosting"] = ["provider" => "files", "sites_root" => "/srv/sites", "releases_root" => "/srv/releases", "lb_ip" => $argv[2]];
$c["php_mail"] = false;          // DigitalOcean blocks direct email; email goes through ZeptoMail (Admin -> Email)
unset($c["plesk"]);              // no Plesk any more
file_put_contents($argv[3], "<?php\n// Imported from the old Plesk server and adjusted for DigitalOcean.\nreturn " . var_export($c, true) . ";\n");
' "$src/config.php" "$LB_IP" /etc/rowancopy/config.php.new || die "could not convert config.php"
mv /etc/rowancopy/config.php.new /etc/rowancopy/config.php
chown root:www-data /etc/rowancopy/config.php; chmod 640 /etc/rowancopy/config.php
systemctl start php8.3-fpm
log "database, uploads and config installed"

cd "$APP_DIR"
run() { sudo -u www-data RC_CONFIG=/etc/rowancopy/config.php php "$@"; }
run -r 'require "lib/bootstrap.php"; db(); echo "database migrations OK\n";' || die "the app can't open the imported database"
[ -n "${CHECK_DOMAIN:-}" ] && { run cli/ensure-check-site.php "$CHECK_DOMAIN" || log "WARNING: status check site failed"; }
run cli/publish-all.php || log "WARNING: some sites failed to publish"

rm -rf "$src"
log "export removed from shared storage"
log "DONE"
