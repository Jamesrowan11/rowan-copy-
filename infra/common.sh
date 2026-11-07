#!/usr/bin/env bash
# Shared helpers for the Rowan Copy droplet setup scripts. Sourced, not run.
set -euo pipefail

# Same user/group IDs on every droplet, so files on the shared NFS mount have
# the same owners everywhere (Caddy's certificates are written by "caddy").
CADDY_UID=2001
WEB_UID=33   # www-data on Ubuntu (the builder's PHP writes the sites as this user)

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mError: %s\033[0m\n' "$*" >&2; exit 1; }

require_root() { [ "$(id -u)" -eq 0 ] || die "Run this with sudo."; }

require_var() {
  local name=$1
  [ -n "${!name:-}" ] || die "Set $name first, e.g.  sudo $name=... $0   (see infra/README.md)"
}

install_caddy() {
  say "Installing Caddy (official package repository)"
  if ! getent group caddy >/dev/null; then groupadd --system --gid "$CADDY_UID" caddy; fi
  if ! id caddy >/dev/null 2>&1; then
    useradd --system --uid "$CADDY_UID" --gid caddy --home-dir /var/lib/caddy --create-home --shell /usr/sbin/nologin caddy
  fi
  [ "$(id -u caddy)" = "$CADDY_UID" ] || die "The caddy user exists with UID $(id -u caddy), not $CADDY_UID. Shared certificate storage needs the same UID on every droplet."
  apt-get update -q
  apt-get install -y -q debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
}

mount_nfs() {
  say "Mounting the shared NFS storage at /srv"
  apt-get install -y -q nfs-common
  mkdir -p /srv
  if ! grep -qs " /srv nfs" /etc/fstab; then
    echo "$NFS_SOURCE /srv nfs ${NFS_OPTIONS:-defaults,_netdev,nofail,noatime} 0 0" >> /etc/fstab
  fi
  systemctl daemon-reload
  mountpoint -q /srv || mount /srv
  mountpoint -q /srv || die "/srv did not mount. Check NFS_SOURCE against the mount instructions in the DigitalOcean console."
}

# Creates the shared folders (safe to run on every droplet; only the first run changes anything).
prepare_shared_folders() {
  say "Preparing shared folders on /srv"
  mkdir -p /srv/sites /srv/releases /srv/caddy/storage
  chown "$WEB_UID:$WEB_UID" /srv/sites /srv/releases || die "Could not set owners on /srv. The NFS share may squash root; see infra/README.md."
  chown -R "$CADDY_UID:$CADDY_UID" /srv/caddy
  chmod 755 /srv/sites /srv/releases
  chmod 700 /srv/caddy/storage
}

install_caddyfile() {
  local src=$1; shift
  local tmp; tmp=$(mktemp)
  cp "$src" "$tmp"
  # The Let's Encrypt contact address is optional.
  [ -n "${ACME_EMAIL:-}" ] || sed -i '/email __ACME_EMAIL__/d' "$tmp"
  while [ $# -gt 0 ]; do
    local key=$1 value=$2; shift 2
    sed -i "s#${key}#${value}#g" "$tmp"
  done
  if grep -q '__[A-Z_]*__' "$tmp"; then die "Unfilled placeholder in $src: $(grep -o '__[A-Z_]*__' "$tmp" | head -1)"; fi
  caddy validate --adapter caddyfile --config "$tmp" >/dev/null || die "The generated Caddyfile is invalid (see above)."
  [ -f /etc/caddy/Caddyfile ] && cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d%H%M%S)"
  install -m 644 "$tmp" /etc/caddy/Caddyfile
  rm -f "$tmp"
  systemctl enable caddy
  systemctl restart caddy
}
