#!/usr/bin/env bash
# ============================================================================
# Runs on a TEMPORARY droplet made from a snapshot of the old Plesk server
# (never on the Plesk server itself). Finds the Rowan Copy app, and copies its
# database (consistent SQLite backup), uploads and config.php to the shared NFS
# storage for the builder to import. Writes a progress log without secrets.
#   NFS_SOURCE=10.x.x.x:/id/name STATUS_FILE=/path bash export-from-plesk.sh
# ============================================================================
set -uo pipefail
log() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$STATUS_FILE"; }
fail() { log "FAILED: $*"; exit 1; }

log "export: starting"
apt-get install -y -q nfs-common >/dev/null 2>&1 || log "warning: apt install nfs-common failed (may already be installed)"
mkdir -p /mnt/rc
mountpoint -q /mnt/rc || mount -t nfs "$NFS_SOURCE" /mnt/rc || fail "could not mount NFS $NFS_SOURCE"
log "export: NFS mounted"

app=""
for f in $(find /var/www/vhosts -maxdepth 5 -path '*/lib/bootstrap.php' 2>/dev/null); do
  if grep -q "ROWAN COPY: BOOTSTRAP" "$f"; then app=$(dirname "$(dirname "$f")"); break; fi
done
[ -n "$app" ] || fail "Rowan Copy app not found under /var/www/vhosts"
log "export: app found at $app"
[ -f "$app/config.php" ] || fail "no config.php in $app"

php=$(ls /opt/plesk/php/8.*/bin/php 2>/dev/null | sort -V | tail -1); [ -n "$php" ] || php=$(command -v php || true)
data_dir=""
[ -n "$php" ] && data_dir=$("$php" -r '$c = require $argv[1]; echo $c["data_dir"] ?? "";' "$app/config.php" 2>/dev/null)
if [ -z "$data_dir" ] || [ ! -f "$data_dir/rowancopy.sqlite" ]; then
  db=$(find /var/www/vhosts /var/lib -name rowancopy.sqlite 2>/dev/null | head -1)
  data_dir=$(dirname "$db")
fi
[ -f "$data_dir/rowancopy.sqlite" ] || fail "database rowancopy.sqlite not found"
log "export: database found"

out=/mnt/rc/migration
rm -rf "$out"; mkdir -p "$out"; chmod 700 "$out"
python3 - "$data_dir/rowancopy.sqlite" "$out/rowancopy.sqlite" <<'PY' || fail "database backup failed"
import sqlite3, sys
src = sqlite3.connect(sys.argv[1]); dst = sqlite3.connect(sys.argv[2])
src.backup(dst); dst.close()
PY
cp "$app/config.php" "$out/config.php"
[ -f "$data_dir/secrets.json" ] && cp "$data_dir/secrets.json" "$out/secrets.json"
mkdir -p "$out/uploads"
[ -d "$app/uploads" ] && cp -a "$app/uploads/." "$out/uploads/"
chmod -R go-rwx "$out"

counts=$(python3 - "$out/rowancopy.sqlite" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
q = lambda s: c.execute(s).fetchone()[0]
def safe(s):
    try: return q(s)
    except Exception: return "?"
print("users=%s sites=%s published=%s custom_domains=%s domain_orders=%s hosting_domains=%s" % (
    safe("select count(*) from users"), safe("select count(*) from sites"),
    safe("select count(*) from sites where published_version_id is not null"),
    safe("select count(*) from sites where custom_domain is not null and custom_domain != ''"),
    safe("select count(*) from domain_orders"), safe("select count(*) from hosting_domains")))
PY
)
log "export: copied database ($counts), $(find "$out/uploads" -type f | wc -l) upload files, config.php"
touch "$out/DONE"
log "export: DONE"
