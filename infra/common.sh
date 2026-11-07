#!/usr/bin/env bash
# Shared helpers for the Rowan Copy droplet setup scripts. Sourced, not run.
set -euo pipefail
# First-boot scripts (cloud-init) run without HOME, and Composer refuses to run without it.
export HOME=${HOME:-/root}
export COMPOSER_HOME=${COMPOSER_HOME:-$HOME/.composer}

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
# DigitalOcean's NFS maps root to "nobody" (root squash), so root can't chown on the share.
# Each folder is therefore created by the user who owns it.
prepare_shared_folders() {
  say "Preparing shared folders on /srv"
  # Empty folders left by an earlier attempt that ran as root ("nobody") are removed and remade.
  for d in /srv/caddy/storage /srv/caddy /srv/sites /srv/releases; do
    if [ -d "$d" ] && [ "$(stat -c %u "$d")" = "65534" ]; then rmdir "$d" 2>/dev/null || true; fi
  done
  # The users below must be able to create their folders at the top of the share.
  if ! sudo -u www-data test -w /srv || ! sudo -u caddy test -w /srv; then
    chmod 1777 /srv || die "Can't make /srv writable for the web server. Check the NFS share's permissions."
  fi
  ensure_owned_dir /srv/sites www-data 755
  ensure_owned_dir /srv/releases www-data 755
  ensure_owned_dir /srv/caddy caddy 755
  ensure_owned_dir /srv/caddy/storage caddy 700
}

ensure_owned_dir() {
  local path=$1 user=$2 mode=$3
  [ -d "$path" ] || sudo -u "$user" mkdir "$path" || die "Could not create $path as $user."
  [ "$(stat -c %u "$path")" = "$(id -u "$user")" ] || die "$path exists but isn't owned by $user (owner uid $(stat -c %u "$path"))."
  sudo -u "$user" chmod "$mode" "$path"
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
  # Comment lines may mention placeholders; only real settings must be filled in.
  if grep -v '^[[:space:]]*#' "$tmp" | grep -q '__[A-Z_]*__'; then
    die "Unfilled placeholder in $src: $(grep -v '^[[:space:]]*#' "$tmp" | grep -o '__[A-Z_]*__' | head -1)"
  fi
  caddy validate --adapter caddyfile --config "$tmp" >/dev/null || die "The generated Caddyfile is invalid (see above)."
  [ -f /etc/caddy/Caddyfile ] && cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d%H%M%S)"
  install -m 644 "$tmp" /etc/caddy/Caddyfile
  rm -f "$tmp"
  systemctl enable caddy
  systemctl restart caddy
}
