#!/usr/bin/env bash
# Turns on automatic deploys for the builder: checks GitHub every 3 minutes.
#   sudo bash infra/builder/install-autodeploy.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
install -m 755 "$here/deploy.sh" /usr/local/sbin/rowancopy-deploy
cat > /etc/systemd/system/rowancopy-deploy.service <<'UNIT'
[Unit]
Description=Deploy Rowan Copy from GitHub when main changes
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/rowancopy-deploy
UNIT
cat > /etc/systemd/system/rowancopy-deploy.timer <<'UNIT'
[Unit]
Description=Check GitHub for Rowan Copy updates every 3 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=3min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now rowancopy-deploy.timer
echo "Automatic deploys are on (every 3 minutes from main)."
