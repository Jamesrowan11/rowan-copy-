<?php
// /sitemap.xml: the public pages Google should index. Submit it in Google Search Console.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/marketing.php';

$pages = [
    // path => [how often it changes, priority]
    '' => ['weekly', '1.0'],
    'services' => ['monthly', '0.9'],
    'pricing' => ['monthly', '0.9'],
    'work' => ['monthly', '0.7'],
    'about' => ['monthly', '0.7'],
    'contact' => ['yearly', '0.8'],
    'register.php' => ['yearly', '0.6'],
    'terms.php' => ['yearly', '0.2'],
    'privacy.php' => ['yearly', '0.2'],
];
// Without the Lovable site, the marketing pages live at their .php addresses.
$installed = lovable_site_installed();

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($pages as $path => [$freq, $priority]) {
    if (!$installed && in_array($path, ['services', 'pricing', 'work', 'about', 'contact'], true)) {
        $path .= '.php';
    }
    $file = $installed && isset(PUBLIC_NAV[$path]) ? RC_ROOT . "/site/$path/index.html"
        : RC_ROOT . '/' . ($path === '' ? ($installed ? 'site/index.html' : 'index.php') : $path);
    $lastmod = is_file($file) ? gmdate('Y-m-d', (int) filemtime($file)) : gmdate('Y-m-d');
    echo '  <url><loc>' . htmlspecialchars(base_url($path), ENT_XML1) . "</loc><lastmod>$lastmod</lastmod>"
        . "<changefreq>$freq</changefreq><priority>$priority</priority></url>\n";
}
echo "</urlset>\n";
