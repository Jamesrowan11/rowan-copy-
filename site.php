<?php
// ============================================================================
// Public customer websites: /s/{slug}  (rewritten to site.php?s={slug})
// ============================================================================

require __DIR__ . '/lib/bootstrap.php';

$stmt = db()->prepare(SITE_SERVE_SQL . ' WHERE s.slug = ?');
$stmt->execute([strtolower((string) ($_GET['s'] ?? ''))]);
serve_site($stmt->fetch() ?: null);
