<?php
// Tests paid email accounts (lib/mailbilling.php) against a fake Stripe server on localhost.
// Run: php tests/mailbilling_test.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$tmp = sys_get_temp_dir() . '/rc-mailbill-test-' . bin2hex(random_bytes(4));
mkdir($tmp, 0700, true);
$port = random_int(20000, 40000);
file_put_contents("$tmp/config.php", '<?php return ' . var_export(['base_url' => 'https://rowancopy.test', 'data_dir' => "$tmp/data",
    'stripe' => ['secret_key' => 'sk_test_x', 'api_base' => "http://127.0.0.1:$port"],
    'plans' => ['free' => ['name' => 'Free'], 'starter' => ['name' => 'Starter', 'features' => ['1 website', 'Use your own domain', '1 email account on your domain', 'Email support']]]], true) . ';');

// A tiny in-memory-on-disk Stripe: products, prices, customers, checkout sessions, subscriptions.
file_put_contents("$tmp/fake.php", <<<'PHP'
<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$m = $_SERVER['REQUEST_METHOD'];
parse_str((string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY), $q);
parse_str(file_get_contents('php://input'), $body);
$file = __DIR__ . '/stripe.json';
$db = is_file($file) ? json_decode(file_get_contents($file), true) : ['n' => 0, 'prices' => [], 'subs' => [], 'customers' => ['cus_1' => ['id' => 'cus_1', 'object' => 'customer', 'invoice_settings' => ['default_payment_method' => null]]], 'log' => []];
$db['log'][] = [$m, $path, $body];
$id = function (string $p) use (&$db) { return $p . '_' . (++$db['n']); };
$sub = function (array $s) use (&$db) {
    $items = [];
    foreach ($s['items'] as $it) { $items[] = ['id' => $it['id'], 'object' => 'subscription_item', 'quantity' => $it['quantity'], 'price' => $db['prices'][$it['price']]]; }
    return ['id' => $s['id'], 'object' => 'subscription', 'customer' => $s['customer'], 'status' => $s['status'], 'metadata' => $s['metadata'],
        'trial_end' => $s['trial_end'] ?? null, 'pending_update' => $s['pending_update'] ?? null,
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
PHP);
$server = proc_open(['php', '-S', "127.0.0.1:$port", "$tmp/fake.php"], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
usleep(500000);
putenv("RC_CONFIG=$tmp/config.php");
require __DIR__ . '/../lib/bootstrap.php';

$failed = 0;
function check(string $name, bool $ok): void
{
    global $failed;
    echo ($ok ? 'ok   ' : 'FAIL ') . $name . "\n";
    $failed += $ok ? 0 : 1;
}
function fake(string $tmp): array
{
    return json_decode((string) file_get_contents("$tmp/stripe.json"), true);
}
function fake_set(string $tmp, string $k, $v): void
{
    $db = fake($tmp);
    $db[$k] = $v;
    file_put_contents("$tmp/stripe.json", json_encode($db));
}
function user(int $id): array
{
    $s = db()->prepare('SELECT * FROM users WHERE id = ?');
    $s->execute([$id]);
    return $s->fetch();
}
function add_account(int $uid, string $email, string $tier, int $billed): void
{
    db()->prepare("INSERT INTO mail_accounts (user_id, mail_domain_id, email, tier, billed) VALUES (?, 1, ?, ?, ?)")->execute([$uid, $email, $tier, $billed]);
}

db()->exec("INSERT INTO users (id, email, name, password_hash, stripe_customer_id) VALUES (1, 'maria@example.com', 'Maria', 'x', 'cus_1')");
db()->exec("INSERT INTO mail_domains (id, user_id, domain, verified) VALUES (1, 1, 'maria.test', 1)");

// Prices
check('price text', mail_tier_price('lite') === '$3/month' && mail_tier_price('premium') === '$7/month');
$lite = mail_price_id('lite');
check('Lite price created at $3 a month', fake($tmp)['prices'][$lite]['unit_amount'] === 300);
db()->exec('DELETE FROM kv');
check('price found again by lookup key, not duplicated', mail_price_id('lite') === $lite && count(fake($tmp)['prices']) === 1);
$premium = mail_price_id('premium');

// First account: no subscription yet, so Checkout.
$url = mail_buy_seat(user(1), 'lite', 'email.php');
check('first account goes to Stripe Checkout', str_starts_with((string) $url, 'https://checkout.stripe.test/'));
$cs = end(fake($tmp)['checkouts']);
check('checkout: 1 Lite, charged now, tagged as mail', $cs['line_items'][0]['quantity'] === '1' && $cs['line_items'][0]['price'] === $lite
    && $cs['subscription_data']['metadata']['rc_kind'] === 'mail' && !isset($cs['subscription_data']['trial_end']));

// Stripe creates the subscription; webhook syncs it.
$s = stripe()->subscriptions->create(['customer' => 'cus_1', 'items' => [['price' => $lite, 'quantity' => 1]], 'metadata' => ['rc_kind' => 'mail']]);
sync_subscription($s);
check('webhook routes mail subscriptions and stores them', user(1)['mail_subscription_id'] === $s->id && user(1)['mail_subscription_status'] === 'active');
check('plan untouched by the mail subscription', user(1)['plan'] === 'free');
check('the paid seat is used without charging again', mail_buy_seat(user(1), 'lite', 'email.php') === null && count(fake($tmp)['subs'][$s->id]['items']) === 1
    && fake($tmp)['subs'][$s->id]['items'][0]['quantity'] === 1);
add_account(1, 'hello@maria.test', 'lite', 1);

// Second account (Premium): added to the subscription, charged now.
check('Premium account added to the subscription', mail_buy_seat(user(1), 'premium', 'email.php') === null);
$items = array_column(fake($tmp)['subs'][$s->id]['items'], 'quantity', 'price');
check('subscription now 1 Lite + 1 Premium', $items === [$lite => 1, $premium => 1]);
$last = end(fake($tmp)['log']);
check('charged now, only if the payment succeeds', $last[2]['proration_behavior'] === 'always_invoice' && $last[2]['payment_behavior'] === 'pending_if_incomplete');
add_account(1, 'boss@maria.test', 'premium', 1);

// Declined card: nothing changes.
fake_set($tmp, 'decline', true);
$threw = false;
try { mail_buy_seat(user(1), 'lite', 'email.php'); } catch (RuntimeException $e) { $threw = str_contains($e->getMessage(), 'declined'); }
check('declined card: error and no change', $threw && array_column(fake($tmp)['subs'][$s->id]['items'], 'quantity', 'price') === [$lite => 1, $premium => 1]);
fake_set($tmp, 'decline', false);

// Downgrade Premium -> Lite: credit, not charged now.
check('switch to Lite', mail_change_tier(user(1), 'premium', 'lite'));
db()->exec("UPDATE mail_accounts SET tier = 'lite' WHERE email = 'boss@maria.test'");
$last = end(fake($tmp)['log']);
check('downgrade: 2 Lite, Premium item removed, credited', array_column(fake($tmp)['subs'][$s->id]['items'], 'quantity', 'price') === [$lite => 2]
    && $last[2]['proration_behavior'] === 'create_prorations');
check('downgrade leaves a Zoho change for staff', (int) db()->query("SELECT COUNT(*) FROM mail_accounts WHERE tier != zoho_tier")->fetchColumn() === 0);
db()->exec("UPDATE mail_accounts SET tier = 'premium' WHERE email = 'boss@maria.test'");
check('upgraded accounts show up for staff to set in Zoho', (int) db()->query("SELECT COUNT(*) FROM mail_accounts WHERE tier != zoho_tier")->fetchColumn() === 1);
db()->exec("UPDATE mail_accounts SET tier = 'lite' WHERE email = 'boss@maria.test'");

// Delete one: quantity follows, with credit.
db()->exec("DELETE FROM mail_accounts WHERE email = 'boss@maria.test'");
mail_release_seat(user(1), 'lite');
check('deleting an account lowers the bill', array_column(fake($tmp)['subs'][$s->id]['items'], 'quantity', 'price') === [$lite => 1]);
db()->exec("DELETE FROM mail_accounts WHERE email = 'hello@maria.test'");
mail_release_seat(user(1), 'lite');
check('last account deleted: subscription cancelled', fake($tmp)['subs'][$s->id]['status'] === 'canceled');
$sync = stripe()->subscriptions->retrieve($s->id);
sync_subscription($sync);
check('cancelled status stored', user(1)['mail_subscription_status'] === 'canceled' && mail_subscription(user(1)) === null);

// Older free accounts: a customer with a card on file.
db()->exec("INSERT INTO users (id, email, name, password_hash, stripe_customer_id) VALUES (2, 'old@example.com', 'Old', 'x', 'cus_2')");
$f = fake($tmp);
$f['customers']['cus_2'] = ['id' => 'cus_2', 'object' => 'customer', 'invoice_settings' => ['default_payment_method' => 'pm_card']];
file_put_contents("$tmp/stripe.json", json_encode($f));
add_account(2, 'a@old.test', 'lite', 0);
add_account(2, 'b@old.test', 'lite', 0);
add_account(2, 'c@old.test', 'premium', 0);
check('older accounts listed as unbilled', mail_unbilled_customers()[2] === ['lite' => 2, 'premium' => 1]);
$starts = time() + 30 * 86400;
$note = mail_start_billing_old_accounts(2, $starts);
$new = end(fake($tmp)['subs']);
check('card on file: subscription with a free period until the start date', str_contains($note, 'subscription created') && $new['status'] === 'trialing'
    && (int) $new['trial_end'] === $starts && array_column($new['items'], 'quantity', 'price') === [$lite => 2, $premium => 1]);
check('their accounts are now billed', !isset(mail_unbilled_customers()[2]) && user(2)['mail_subscription_id'] === $new['id']);

// Older free accounts: no card on file -> they add one through Checkout.
db()->exec("INSERT INTO users (id, email, name, password_hash) VALUES (3, 'nocard@example.com', 'NoCard', 'x')");
add_account(3, 'x@nocard.test', 'lite', 0);
$note = mail_start_billing_old_accounts(3, $starts);
check('no card: asked to add one, accounts stay unbilled until then', $note === 'asked to add a card' && isset(mail_unbilled_customers()[3]));
$url = mail_buy_seat(user(3), 'premium', 'email.php');
$cs = end(fake($tmp)['checkouts']);
check('new account first sends them to add a card for the older ones (free until the date)', str_starts_with((string) $url, 'https://checkout')
    && $cs['line_items'][0]['price'] === $lite && (int) $cs['subscription_data']['trial_end'] === $starts && count($cs['line_items']) === 1);
db()->exec("UPDATE users SET stripe_customer_id = 'cus_3' WHERE id = 3");
$s3 = stripe()->subscriptions->create(['customer' => 'cus_3', 'items' => [['price' => $lite, 'quantity' => 1]], 'trial_end' => $starts, 'metadata' => ['rc_kind' => 'mail']]);
sync_subscription($s3);
check('after Checkout the older account is billed', !isset(mail_unbilled_customers()[3]));

// A customer whose billing isn't scheduled keeps older accounts free even after buying a new one.
db()->exec("INSERT INTO users (id, email, name, password_hash, stripe_customer_id) VALUES (4, 'mixed@example.com', 'Mixed', 'x', 'cus_4')");
add_account(4, 'old@mixed.test', 'lite', 0);
$url = mail_buy_seat(user(4), 'lite', 'email.php');
$cs = end(fake($tmp)['checkouts']);
check('unscheduled older accounts are not added to a new checkout', $cs['line_items'][0]['quantity'] === '1' && !isset($cs['subscription_data']['trial_end']));
$s4 = stripe()->subscriptions->create(['customer' => 'cus_4', 'items' => [['price' => $lite, 'quantity' => 1]], 'metadata' => ['rc_kind' => 'mail']]);
sync_subscription($s4);
check('the new seat is not used up by an older free account', isset(mail_unbilled_customers()[4]) && mail_buy_seat(user(4), 'lite', 'email.php') === null);

// Plans no longer list included email accounts.
$f = plan_features('starter', plans()['starter']);
check('plan features: email line replaced by the price', !in_array('1 email account on your domain', $f, true) && in_array('Email accounts from $3/month each', $f, true));
check('free plan gets no email line', !preg_grep('/email/i', plan_features('free', ['features' => ['1 website']])));

proc_terminate($server);
exec('rm -rf ' . escapeshellarg($tmp));
echo $failed ? "\n$failed FAILED\n" : "\nAll passed\n";
exit($failed ? 1 : 0);
