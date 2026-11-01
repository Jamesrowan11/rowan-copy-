<?php
// /robots.txt: let search engines index the public site, keep them out of private portal pages.
require __DIR__ . '/lib/bootstrap.php';

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: public, max-age=3600');
$private = ['/api/', '/admin', '/dashboard.php', '/editor.php', '/billing.php', '/account.php', '/domain.php',
    '/inbox.php', '/download.php', '/reset.php', '/verify.php', '/forgot.php', '/logout.php', '/form.php', '/r/', '/uploads/'];
echo "User-agent: *\n";
foreach ($private as $p) {
    echo "Disallow: $p\n";
}
echo "\nSitemap: " . base_url('sitemap.xml') . "\n";
