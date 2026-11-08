#!/usr/bin/env bash
# ============================================================================
# Rowan Copy builder: deploy the latest code from GitHub. Runs every 3 minutes
# from rowancopy-deploy.timer and does nothing unless main has new commits.
# If any PHP file fails a syntax check, it goes back to the previous commit,
# so a bad push can't take the site down.
#   sudo /usr/local/sbin/rowancopy-deploy           # deploy if there are changes
#   sudo /usr/local/sbin/rowancopy-deploy --force   # redeploy now
# ============================================================================
set -uo pipefail
export HOME=${HOME:-/root} COMPOSER_HOME=${COMPOSER_HOME:-/root/.composer} COMPOSER_ALLOW_SUPERUSER=1
APP_DIR=${APP_DIR:-/var/www/rowancopy}
BRANCH=${BRANCH:-main}
PHP_VERSION=${PHP_VERSION:-8.3}
exec 9>/run/rowancopy-deploy.lock
flock -n 9 || { echo "A deploy is already running."; exit 0; }
log() { echo "$(date -u +%FT%TZ) deploy: $*"; }

cd "$APP_DIR" || exit 1
git fetch -q origin "$BRANCH" || { log "git fetch failed"; exit 1; }
current=$(git rev-parse HEAD)
target=$(git rev-parse FETCH_HEAD)
[ "${1:-}" != "--force" ] && [ "$current" = "$target" ] && exit 0

log "deploying ${target:0:7} (was ${current:0:7})"
git reset -q --hard "$target"
bad=$(find . -path ./vendor -prune -o -path ./lovable-site -prune -o -name '*.php' -print0 | xargs -0 -n1 -P4 php -l 2>&1 | grep -v '^No syntax errors' || true)
if [ -n "$bad" ]; then
  log "PHP syntax errors, staying on ${current:0:7}: $bad"
  git reset -q --hard "$current"
  exit 1
fi
if ! git diff --quiet "$current" "$target" -- composer.json composer.lock; then
  composer install --no-dev --optimize-autoloader --no-interaction --quiet || { log "composer failed, back to ${current:0:7}"; git reset -q --hard "$current"; composer install --no-dev --no-interaction --quiet; exit 1; }
fi
chown -R www-data:www-data uploads
systemctl reload "php$PHP_VERSION-fpm"
install -m 755 infra/builder/deploy.sh /usr/local/sbin/rowancopy-deploy
log "live on ${target:0:7}"
