<?php
// Public plan list for the marketing site's Pricing page, straight from config.php.
require __DIR__ . '/../lib/bootstrap.php';

$plans = [];
foreach (plans() as $key => $p) {
    // Prices as plain numbers (the marketing site formats them), plus the original labels.
    $num = fn ($label) => (float) preg_replace('/[^0-9.]/', '', explode('/', (string) $label)[0]);
    $plans[] = ['key' => $key, 'name' => $p['name'],
        'price' => $num($p['price'] ?? '0'), 'price_yearly' => $num($p['price_yearly'] ?? ($p['price'] ?? '0')),
        'price_label' => $p['price'] ?? '', 'price_yearly_label' => $p['price_yearly'] ?? '',
        'features' => array_values((array) ($p['features'] ?? [])), 'popular' => $key === 'business'];
}
header('Cache-Control: public, max-age=300');
json_out(['plans' => $plans]);
