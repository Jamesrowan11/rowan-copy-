<?php
// Download the current version of a site as a single HTML file.
require __DIR__ . '/lib/bootstrap.php';

$user = require_login();
$site = owned_site((int) ($_GET['id'] ?? 0), $user);
if (!$site['current_version_id']) {
    http_response_code(404);
    exit('This site has no design yet.');
}
$stmt = db()->prepare('SELECT html FROM versions WHERE id = ?');
$stmt->execute([$site['current_version_id']]);

header('Content-Type: text/html; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $site['slug'] . '.html"');
header('Content-Security-Policy: sandbox');
echo render_site_html((string) $stmt->fetchColumn(), $site);
