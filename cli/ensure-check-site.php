<?php
// ============================================================================
// Creates (or refreshes) a tiny "status check" site on a domain you control, so
// infra/test-web-droplet.sh can test the web droplets and load balancer end to
// end without touching a customer's site. Owned by a locked system account.
//   sudo -u www-data RC_CONFIG=/etc/rowancopy/config.php php cli/ensure-check-site.php check.rowancopy.com
// ============================================================================
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../lib/bootstrap.php';

$domain = site_host(normalize_domain((string) ($argv[1] ?? '')));
if ($domain === '') {
    fwrite(STDERR, "Usage: php cli/ensure-check-site.php <domain>\n");
    exit(1);
}
$pdo = db();
$email = 'status-check@' . (parse_url((string) cfg('base_url'), PHP_URL_HOST) ?: 'localhost');
$stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$stmt->execute([$email]);
$uid = (int) $stmt->fetchColumn();
if (!$uid) {
    // Random password nobody knows: this account can't be logged into.
    $pdo->prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
        ->execute([$email, 'Status check (system)', password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT)]);
    $uid = (int) $pdo->lastInsertId();
}
$stmt = $pdo->prepare('SELECT id FROM sites WHERE user_id = ? AND slug = ?');
$stmt->execute([$uid, 'rc-status-check']);
$siteId = (int) $stmt->fetchColumn();
if (!$siteId) {
    $pdo->prepare('INSERT INTO sites (user_id, name, slug) VALUES (?, ?, ?)')->execute([$uid, 'Status check', 'rc-status-check']);
    $siteId = (int) $pdo->lastInsertId();
}
$html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    . '<meta name="robots" content="noindex"><title>Rowan Copy status check</title></head><body><p>rc-status-check-ok</p></body></html>';
$pdo->prepare('INSERT INTO versions (site_id, html, instruction) VALUES (?, ?, ?)')->execute([$siteId, $html, 'Status check page']);
$vid = (int) $pdo->lastInsertId();
$pdo->prepare('UPDATE sites SET current_version_id = ?, published_version_id = ?, custom_domain = ?, domain_connected_at = CURRENT_TIMESTAMP, taken_down = 0 WHERE id = ?')
    ->execute([$vid, $vid, $domain, $siteId]);
$err = sync_site_hosting($siteId);
echo $err ? "Error: $err\n" : "Status check site live on $domain (site #$siteId).\n";
exit($err ? 1 : 0);
