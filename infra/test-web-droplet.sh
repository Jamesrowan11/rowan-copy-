#!/usr/bin/env bash
# ============================================================================
# Rowan Copy: check a web droplet (or the load balancer) behaves safely.
# Run from anywhere with curl, against a LIVE customer domain:
#   bash infra/test-web-droplet.sh <droplet-or-load-balancer-IP> <live-customer-domain>
# ============================================================================
set -uo pipefail
ip=${1:?usage: $0 <ip> <live-customer-domain>}
domain=${2:?usage: $0 <ip> <live-customer-domain>}
fail=0
bogus="rc-unapproved-$RANDOM$RANDOM.invalid"
c() { curl -s -k --max-time 15 --resolve "$domain:443:$ip" --resolve "www.$domain:443:$ip" --resolve "$bogus:443:$ip" "$@"; }
expect() { # name expected actual
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1 (expected $2, got $3)"; fail=1; fi
}

expect "health check on port 80" 200 "$(curl -s -o /dev/null -w '%{http_code}' "http://$ip/health")"
expect "http redirects to https" 308 "$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $domain" "http://$ip/")"
expect "customer site loads" 200 "$(c -o /dev/null -w '%{http_code}' "https://$domain/")"
csp=$(c -D - -o /dev/null "https://$domain/" | grep -ci '^content-security-policy: sandbox')
expect "sandbox header present" 1 "$csp"
expect "www redirects to bare domain" 308 "$(c -o /dev/null -w '%{http_code}' "https://www.$domain/")"
# The important ones: nothing outside the site's own folder is reachable.
expect "Host '..' can't reach certificate storage" 421 "$(c -o /dev/null -w '%{http_code}' -H 'Host: ..' "https://$domain/caddy/storage/")"
expect "another Host over this domain's connection is refused" 421 "$(c -o /dev/null -w '%{http_code}' -H 'Host: example.com' "https://$domain/")"
code=$(c -o /dev/null -w '%{http_code}' "https://$bogus/" 2>/dev/null)
expect "no certificate for an unapproved domain" 000 "$code"

[ $fail = 0 ] && echo -e "\nAll checks passed." || { echo -e "\nSome checks FAILED. Don't send customers here until they pass."; exit 1; }
