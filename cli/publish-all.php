<?php
// ============================================================================
// Publish (or take down) every customer site with its own domain, using the
// hosting provider in config.php. Run once after switching to 'files', and any
// time you want to rebuild /srv/sites from the database. Safe to run again.
//   sudo -u www-data RC_CONFIG=/etc/rowancopy/config.php php cli/publish-all.php
// ============================================================================
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../lib/bootstrap.php';

echo 'Hosting provider: ' . hosting_settings()['provider'] . "\n";
$rows = db()->query("SELECT id, custom_domain FROM sites WHERE custom_domain IS NOT NULL AND custom_domain != '' ORDER BY id")->fetchAll();
$bad = 0;
foreach ($rows as $r) {
    $err = sync_site_hosting((int) $r['id']);
    $live = domain_is_active((string) $r['custom_domain']);
    printf("%-6s %-40s %s\n", '#' . $r['id'], $r['custom_domain'], $err ? 'ERROR (see PHP error log)' : ($live ? 'published' : 'offline (not live or DNS not checked)'));
    $bad += $err ? 1 : 0;
}
echo count($rows) . " site(s), $bad error(s).\n";
exit($bad ? 1 : 0);
