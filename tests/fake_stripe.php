<?php
// A tiny Stripe stand-in for tests (php -S with FAKE_STRIPE_DIR set): products, prices,
// customers, checkout sessions and subscriptions, kept in FAKE_STRIPE_DIR/stripe.json.
if (PHP_SAPI !== 'cli-server') { http_response_code(404); exit; }
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$m = $_SERVER['REQUEST_METHOD'];
parse_str((string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY), $q);
parse_str(file_get_contents('php://input'), $body);
$file = getenv('FAKE_STRIPE_DIR') . '/stripe.json';
$db = is_file($file) ? json_decode(file_get_contents($file), true) : ['n' => 0, 'prices' => [], 'subs' => [], 'customers' => ['cus_1' => ['id' => 'cus_1', 'object' => 'customer', 'invoice_settings' => ['default_payment_method' => null]]], 'log' => []];
$db['log'][] = [$m, $path, $body];
$id = function (string $p) use (&$db) { return $p . '_' . (++$db['n']); };
$sub = function (array $s) use (&$db) {
    $items = [];
    foreach ($s['items'] as $it) { $items[] = ['id' => $it['id'], 'object' => 'subscription_item', 'quantity' => $it['quantity'], 'price' => $db['prices'][$it['price']]]; }
    return ['id' => $s['id'], 'object' => 'subscription', 'customer' => $s['customer'], 'status' => $s['status'], 'metadata' => $s['metadata'],
        'trial_end' => $s['trial_end'] ?? null, 'cancel_at_period_end' => false, 'pending_update' => $s['pending_update'] ?? null,
        'items' => ['object' => 'list', 'data' => $items]];
};
header('Content-Type: application/json');
$out = null;
if ($path === '/v1/prices' && $m === 'GET') {
    $found = array_values(array_filter($db['prices'], fn ($p) => in_array($p['lookup_key'], (array) ($q['lookup_keys'] ?? []), true)));
    $out = ['object' => 'list', 'data' => $found, 'has_more' => false];
} elseif ($path === '/v1/products' && $m === 'POST') {
    $out = ['id' => $id('prod'), 'object' => 'product', 'name' => $body['name']];
} elseif ($path === '/v1/prices' && $m === 'POST') {
    $p = ['id' => $id('price'), 'object' => 'price', 'unit_amount' => (int) $body['unit_amount'], 'lookup_key' => $body['lookup_key'], 'metadata' => $body['metadata'], 'product' => $body['product']];
    $db['prices'][$p['id']] = $p; $out = $p;
} elseif ($path === '/v1/customers' && $m === 'POST') {
    $out = ['id' => 'cus_1', 'object' => 'customer'];
} elseif (preg_match('#^/v1/customers/(\w+)$#', $path, $mm)) {
    $out = $db['customers'][$mm[1]];
} elseif ($path === '/v1/checkout/sessions' && $m === 'POST') {
    $cs = $id('cs');
    $db['checkouts'][$cs] = $body;
    $out = ['id' => $cs, 'object' => 'checkout.session', 'url' => 'https://checkout.stripe.test/' . $cs];
} elseif ($path === '/v1/subscriptions' && $m === 'POST') {
    $s = ['id' => $id('sub'), 'customer' => $body['customer'], 'status' => isset($body['trial_end']) ? 'trialing' : 'active', 'metadata' => $body['metadata'] ?? [], 'trial_end' => $body['trial_end'] ?? null, 'items' => []];
    foreach ($body['items'] as $it) { $s['items'][] = ['id' => $id('si'), 'price' => $it['price'], 'quantity' => (int) $it['quantity']]; }
    $db['subs'][$s['id']] = $s; $out = $sub($s);
} elseif (preg_match('#^/v1/subscriptions/(\w+)$#', $path, $mm)) {
    $s = &$db['subs'][$mm[1]];
    if ($m === 'DELETE') { $s['status'] = 'canceled'; }
    if ($m === 'POST') {
        $s['pending_update'] = null;
        if (!empty($db['decline']) && ($body['payment_behavior'] ?? '') === 'pending_if_incomplete') {
            $s['pending_update'] = ['expires_at' => 1]; // card declined: nothing changes
        } else {
            foreach ($body['items'] ?? [] as $it) {
                if (isset($it['id'])) {
                    foreach ($s['items'] as $k => $have) {
                        if ($have['id'] === $it['id']) {
                            if (!empty($it['deleted'])) { unset($s['items'][$k]); } else { $s['items'][$k]['quantity'] = (int) $it['quantity']; }
                        }
                    }
                    $s['items'] = array_values($s['items']);
                } else {
                    $s['items'][] = ['id' => $id('si'), 'price' => $it['price'], 'quantity' => (int) $it['quantity']];
                }
            }
        }
    }
    $out = $sub($s);
    unset($s);
}
file_put_contents($file, json_encode($db));
if ($out === null) { http_response_code(404); echo '{"error":{"message":"not found"}}'; return; }
echo json_encode($out);
