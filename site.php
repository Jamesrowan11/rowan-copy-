<?php
// ============================================================================
// Public customer websites: /s/{slug}  (rewritten to site.php?s={slug})
// ============================================================================

require __DIR__ . '/lib/bootstrap.php';

$slug = strtolower((string) ($_GET['s'] ?? ''));
$stmt = db()->prepare(
    'SELECT s.*, v.html FROM sites s JOIN versions v ON v.id = s.published_version_id WHERE s.slug = ?'
);
$stmt->execute([$slug]);
$site = $stmt->fetch();

if (!$site) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Site not found</title>'
        . '<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#333;background:#faf8f5;margin:0">'
        . '<div style="text-align:center;padding:16px"><h1>This website isn’t available</h1><p>It may not be published yet.</p>'
        . '<p><a href="' . h(base_url()) . '">Build your own with Rowan Copy</a></p></div>';
    exit;
}

// Customer pages run in a browser sandbox: their scripts can't read Rowan Copy
// cookies or act as the logged-in customer, even though they share our domain.
header('Content-Type: text/html; charset=utf-8');
header('Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox');
header('Cache-Control: public, max-age=60');
echo render_site_html($site['html'], $site);
