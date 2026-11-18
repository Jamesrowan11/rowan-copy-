<?php
// The current draft of one of the customer's sites, for the thumbnails on
// My sites. Owner only; sandboxed so the page can't touch Rowan Copy.
require __DIR__ . '/lib/bootstrap.php';

$user = require_login();
$site = owned_site((int) ($_GET['id'] ?? 0), $user);
if (!$site['current_version_id']) {
    http_response_code(404);
    exit;
}
$stmt = db()->prepare('SELECT html FROM versions WHERE id = ?');
$stmt->execute([$site['current_version_id']]);

header('Content-Type: text/html; charset=utf-8');
header("Content-Security-Policy: sandbox allow-scripts; frame-ancestors 'self'");
header('Cache-Control: private, max-age=60');
header('X-Robots-Tag: noindex');
echo render_site_html((string) $stmt->fetchColumn(), $site);
