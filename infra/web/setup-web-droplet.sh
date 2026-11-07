#!/usr/bin/env bash
# ============================================================================
# Rowan Copy: set up ONE web droplet (run the same thing on all 3).
# Installs Caddy, mounts the shared NFS storage at /srv, installs the Caddyfile,
# removes Nginx, and turns on the firewall. Safe to run again.
#
#   sudo NFS_SOURCE='10.124.0.9:/1234567/rowan-sites' \
#        ASK_URL='http://10.124.0.5:8080/caddy/domain-check' \
#        ACME_EMAIL='you@rowancopy.com' \
#        bash infra/web/setup-web-droplet.sh
#
# NFS_SOURCE: from the DigitalOcean console (your NFS share -> mount instructions).
# ASK_URL:    the builder droplet's PRIVATE (VPC) IP, port 8080.
# Optional:   NFS_OPTIONS (default defaults,_netdev,nofail,noatime), VPC_CIDR (default 10.0.0.0/8).
# ============================================================================
here=$(cd "$(dirname "$0")" && pwd)
source "$here/../common.sh"

require_root
require_var NFS_SOURCE
require_var ASK_URL
ACME_EMAIL=${ACME_EMAIL:-}

if systemctl list-unit-files nginx.service >/dev/null 2>&1 && systemctl list-unit-files nginx.service | grep -q nginx; then
  say "Stopping and removing Nginx (Caddy takes over ports 80 and 443)"
  systemctl disable --now nginx || true
  apt-get purge -y -q nginx nginx-common nginx-core || true
fi

install_caddy
mount_nfs
prepare_shared_folders

say "Checking the builder's domain check is reachable"
code=$(curl -s -o /dev/null -w '%{http_code}' "$ASK_URL?domain=example.invalid" || true)
[ "$code" = "404" ] || die "$ASK_URL answered '$code' (expected 404). Is the builder droplet set up, and is port 8080 open to the VPC?"

say "Installing the Caddyfile"
install_caddyfile "$here/Caddyfile" __ASK_URL__ "$ASK_URL" __ACME_EMAIL__ "$ACME_EMAIL"

say "Firewall: SSH, HTTP and HTTPS"
apt-get install -y -q ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

say "Checking the health endpoint"
sleep 2
curl -fsS http://127.0.0.1/health >/dev/null && echo "Health check OK." || die "http://127.0.0.1/health did not answer. See: journalctl -u caddy -n 50"

say "Done. Next: add this droplet to the load balancer, then run infra/test-web-droplet.sh against it."
