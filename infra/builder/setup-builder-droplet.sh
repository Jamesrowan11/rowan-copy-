#!/usr/bin/env bash
# ============================================================================
# Rowan Copy: set up the builder droplet (the rowancopy.com app).
# Installs PHP-FPM + Caddy, mounts the shared NFS storage at /srv, clones the
# app, and installs the Caddyfile. Your config.php goes in /etc/rowancopy/
# (outside the app folder). Safe to run again. Does NOT copy any data from
# Plesk; see infra/README.md for the move.
#
#   sudo NFS_SOURCE='10.124.0.9:/1234567/rowan-sites' \
#        PRIVATE_IP='10.124.0.5' \
#        ACME_EMAIL='you@rowancopy.com' \
#        bash infra/builder/setup-builder-droplet.sh
#
# PRIVATE_IP: this droplet's VPC address (ip -4 addr show eth1).
# Optional:   APP_DOMAIN (rowancopy.com), APP_DIR (/var/www/rowancopy),
#             REPO_URL (https://github.com/Jamesrowan11/rowan-copy-.git), BRANCH (main),
#             VPC_CIDR (10.0.0.0/8), NFS_OPTIONS.
# ============================================================================
here=$(cd "$(dirname "$0")" && pwd)
source "$here/../common.sh"

require_root
require_var NFS_SOURCE
require_var PRIVATE_IP
require_var ACME_EMAIL
APP_DOMAIN=${APP_DOMAIN:-rowancopy.com}
APP_DIR=${APP_DIR:-/var/www/rowancopy}
REPO_URL=${REPO_URL:-https://github.com/Jamesrowan11/rowan-copy-.git}
BRANCH=${BRANCH:-main}
VPC_CIDR=${VPC_CIDR:-10.0.0.0/8}
PHP_VERSION=8.3

say "Installing PHP $PHP_VERSION, Composer and Git"
apt-get update -q
apt-get install -y -q git unzip sqlite3 "php$PHP_VERSION-fpm" "php$PHP_VERSION-cli" "php$PHP_VERSION-sqlite3" \
  "php$PHP_VERSION-curl" "php$PHP_VERSION-mbstring" "php$PHP_VERSION-xml" "php$PHP_VERSION-gd" "php$PHP_VERSION-intl" composer

install_caddy
mount_nfs
prepare_shared_folders

say "Getting the app into $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only
fi
cd "$APP_DIR"
COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction
mkdir -p uploads /var/lib/rowancopy /etc/rowancopy
chown -R www-data:www-data uploads /var/lib/rowancopy
chmod 700 /var/lib/rowancopy

if [ ! -f /etc/rowancopy/config.php ]; then
  cp config.sample.php /etc/rowancopy/config.php
  echo "Created /etc/rowancopy/config.php from the sample. Fill it in (or copy your Plesk config.php over it)."
fi
chown root:www-data /etc/rowancopy/config.php
chmod 640 /etc/rowancopy/config.php

say "PHP-FPM: point the app at its config and secrets"
touch /etc/rowancopy/secrets.env
chmod 600 /etc/rowancopy/secrets.env
bash "$here/load-secrets.sh"

say "Installing the Caddyfile"
install_caddyfile "$here/Caddyfile" __ACME_EMAIL__ "$ACME_EMAIL" __APP_DOMAIN__ "$APP_DOMAIN" \
  __APP_DIR__ "$APP_DIR" __PRIVATE_IP__ "$PRIVATE_IP" __PHP_VERSION__ "$PHP_VERSION"

say "Firewall: SSH, HTTP, HTTPS; the domain check (8080) only from the private network"
apt-get install -y -q ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow from "$VPC_CIDR" to any port 8080 proto tcp
ufw --force enable

say "Checking the domain check endpoint"
sleep 2
code=$(curl -s -o /dev/null -w '%{http_code}' "http://$PRIVATE_IP:8080/caddy/domain-check?domain=example.invalid" || true)
[ "$code" = "404" ] && echo "Domain check OK (answers 404 for unknown domains)." || echo "Warning: the domain check answered '$code' (expected 404). Is config.php filled in? See: journalctl -u caddy -n 50"

cat <<NEXT

Done. Next steps (infra/README.md has the details):
  1. Fill in /etc/rowancopy/config.php: data_dir => '/var/lib/rowancopy',
     'hosting' => ['provider' => 'files', 'lb_ip' => '<load balancer IP>'].
  2. Put secrets in /etc/rowancopy/secrets.env, then run: sudo $here/load-secrets.sh
  3. Point rowancopy.com's DNS at THIS droplet's public IP (not the load balancer) when you're ready to switch.
NEXT
