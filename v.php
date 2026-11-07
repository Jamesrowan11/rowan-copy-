<?php
// Visit counter for customer sites served as static files (see build_site_page()).
// Returns a 1x1 transparent GIF and never caches, so each page view is counted.
require __DIR__ . '/lib/bootstrap.php';

$slug = is_string($_GET['s'] ?? null) ? $_GET['s'] : '';
if (valid_slug($slug)) {
    $stmt = db()->prepare('SELECT s.id FROM sites s JOIN users u ON u.id = s.user_id
        WHERE s.slug = ? AND s.published_version_id IS NOT NULL AND s.taken_down = 0 AND u.suspended = 0');
    $stmt->execute([$slug]);
    if ($id = $stmt->fetchColumn()) {
        count_site_view((int) $id);
    }
}
header('Content-Type: image/gif');
header('Cache-Control: no-store, max-age=0');
header('Cross-Origin-Resource-Policy: cross-origin');
echo base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
