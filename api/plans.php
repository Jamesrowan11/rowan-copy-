<?php
// Public plan list for the marketing site's Pricing page, straight from config.php.
require __DIR__ . '/../lib/bootstrap.php';

$plans = [];
foreach (plans() as $key => $p) {
    $plans[] = ['key' => $key, 'name' => $p['name'], 'price' => $p['price'] ?? '', 'price_yearly' => $p['price_yearly'] ?? '',
        'features' => array_values((array) ($p['features'] ?? []))];
}
header('Cache-Control: public, max-age=300');
json_out(['plans' => $plans]);
