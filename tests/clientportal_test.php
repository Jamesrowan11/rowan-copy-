<?php
// Tests the Portal add-on (lib/clientportal.php) against the fake Stripe.
// Run: php tests/clientportal_test.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$tmp = sys_get_temp_dir() . '/rc-portal-test-' . bin2hex(random_bytes(4));
mkdir($tmp, 0700, true);
$port = random_int(20000, 40000);
file_put_contents("$tmp/config.php", '<?php return ' . var_export(['base_url' => 'https://rowancopy.test', 'data_dir' => "$tmp/data",
    'stripe' => ['secret_key' => 'sk_test_x', 'api_base' => "http://127.0.0.1:$port"],
    'portal' => ['max_staff' => 2],
    'plans' => ['free' => ['name' => 'Free'], 'starter' => ['name' => 'Starter']]], true) . ';');
$server = proc_open(['php', '-S', "127.0.0.1:$port", __DIR__ . '/fake_stripe.php'], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes, null, ['FAKE_STRIPE_DIR' => $tmp] + getenv());
usleep(500000);
ob_start(); // sessions need headers not to be sent yet
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
function site(int $id): array
{
    $s = db()->prepare('SELECT s.*, u.plan AS owner_plan FROM sites s JOIN users u ON u.id = s.user_id WHERE s.id = ?');
    $s->execute([$id]);
    return $s->fetch();
}

db()->exec("INSERT INTO users (id, email, name, password_hash, stripe_customer_id, plan) VALUES (1, 'maria@example.com', 'Maria', 'x', 'cus_1', 'starter')");
db()->exec("INSERT INTO users (id, email, name, password_hash, stripe_customer_id, plan) VALUES (2, 'other@example.com', 'Other', 'x', 'cus_9', 'free')");
db()->exec("INSERT INTO sites (id, user_id, name, slug) VALUES (1, 1, 'Maple Street Bakery', 'maple'), (2, 2, 'Other Site', 'other')");
$maria = db()->query('SELECT * FROM users WHERE id = 1')->fetch();
$other = db()->query('SELECT * FROM users WHERE id = 2')->fetch();

check('paid plans can buy it, free can\'t', portal_can_buy($maria) && !portal_can_buy($other));
check('price text', portal_price_text() === '$15/month');
check('not live before buying', !portal_live(site(1)));

$url = portal_checkout_url($maria, site(1));
$cs = end(fake($tmp)['checkouts']);
check('checkout for $15 a month, tagged with the site', str_starts_with($url, 'https://checkout') && $cs['subscription_data']['metadata']['rc_kind'] === 'portal'
    && $cs['subscription_data']['metadata']['site_id'] === '1' && fake($tmp)['prices'][$cs['line_items'][0]['price']]['unit_amount'] === 1500);
check('return address is the site\'s Portal page', str_contains($cs['success_url'], 'site-portal.php?id=1&paid='));

$sub = stripe()->subscriptions->create(['customer' => 'cus_1', 'items' => [['price' => portal_price_id(), 'quantity' => 1]], 'metadata' => ['rc_kind' => 'portal', 'site_id' => '1']]);
sync_subscription($sub);
check('webhook turns the Portal on', portal_live(site(1)) && site(1)['portal_subscription_id'] === $sub->id);
check('the plan is untouched', db()->query('SELECT plan FROM users WHERE id = 1')->fetchColumn() === 'starter');

$evil = stripe()->subscriptions->create(['customer' => 'cus_9', 'items' => [['price' => portal_price_id(), 'quantity' => 1]], 'metadata' => ['rc_kind' => 'portal', 'site_id' => '1']]);
db()->exec("UPDATE sites SET portal_subscription_id = NULL WHERE id = 2");
sync_subscription($evil);
check('someone else\'s subscription can\'t turn on or change another customer\'s Portal', site(1)['portal_subscription_id'] === $sub->id);

$old = stripe()->subscriptions->create(['customer' => 'cus_1', 'items' => [['price' => portal_price_id(), 'quantity' => 1]], 'metadata' => ['rc_kind' => 'portal', 'site_id' => '1']]);
stripe()->subscriptions->cancel($old->id);
sync_subscription(stripe()->subscriptions->retrieve($old->id));
check('an old subscription ending doesn\'t turn off the current one', portal_live(site(1)) && site(1)['portal_subscription_id'] === $sub->id);

// The website shows a Portal button while it's on.
$s = site(1) + ['html' => '<html><body><h1>Hi</h1></body></html>'];
check('Portal button added to the website', str_contains(build_site_page($s, true), 'portal.php?s=maple') && str_contains(build_site_page($s, true), 'Portal sign in'));
$s2 = site(2) + ['html' => '<html><body>x</body></html>'];
check('no button on sites without it', !str_contains(build_site_page($s2, true), 'portal.php'));

// Invites
$a = portal_invite(site(1), 'Ana', 'ANA@example.com ', 'staff');
check('invite creates a pending staff account (email lowercased)', ($u = portal_user(1, $a)) && $u['email'] === 'ana@example.com' && !$u['password_hash'] && $u['token_kind'] === 'invite');
$threw = '';
try { portal_invite(site(1), 'Ana again', 'ana@example.com', 'client'); } catch (RuntimeException $e) { $threw = $e->getMessage(); }
check('same email twice on one portal is refused', str_contains($threw, 'already has an account'));
portal_invite(site(1), 'Ben', 'ben@example.com', 'staff');
$threw = '';
try { portal_invite(site(1), 'Cal', 'cal@example.com', 'staff'); } catch (RuntimeException $e) { $threw = $e->getMessage(); }
check('staff limit enforced', str_contains($threw, 'up to 2 staff'));
$threw = '';
try { portal_invite(site(1), 'Dee', 'not-an-email', 'client'); } catch (RuntimeException $e) { $threw = $e->getMessage(); }
check('bad email refused', $threw === 'Enter a valid email address.');
$c = portal_invite(site(1), 'Cara Client', 'cara@example.com', 'client');
check('clients have their own limit', portal_user(1, $c)['role'] === 'client');
portal_invite(site(2), 'Ana', 'ana@example.com', 'client');
check('the same person can be on two different portals', count(db()->query("SELECT id FROM portal_users WHERE email = 'ana@example.com'")->fetchAll()) === 2);

// Tokens
$token = portal_issue_token($a, 'invite', 3600);
check('invite link works', (int) (portal_user_by_token(1, $token, 'invite')['id'] ?? 0) === $a);
check('invite link doesn\'t work on another portal', portal_user_by_token(2, $token, 'invite') === null);
check('invite link isn\'t a reset link', portal_user_by_token(1, $token, 'reset') === null);
check('only the hash is stored', !str_contains(json_encode(db()->query('SELECT * FROM portal_users')->fetchAll()), $token));
check('garbage token refused', portal_user_by_token(1, 'abc', 'invite') === null);
$expired = portal_issue_token($c, 'reset', -10);
check('expired link refused', portal_user_by_token(1, $expired, 'reset') === null);

// Who is viewing
start_session();
check('nobody signed in', portal_viewer(site(1)) === null);
db()->prepare('UPDATE portal_users SET password_hash = ? WHERE id = ?')->execute([password_hash('password1', PASSWORD_DEFAULT), $a]);
portal_log_in(site(1), portal_user(1, $a));
check('signed-in staff member', ($v = portal_viewer(site(1))) && $v['id'] === $a && portal_is_staff($v));
check('signed in to one portal only', portal_viewer(site(2)) === null);
db()->exec("UPDATE portal_users SET session_version = session_version + 1 WHERE id = $a");
check('password change elsewhere signs them out', portal_viewer(site(1)) === null);
portal_log_in(site(1), portal_user(1, $a));
db()->exec("DELETE FROM portal_users WHERE id = $a");
check('removed users are signed out', portal_viewer(site(1)) === null);
db()->prepare('UPDATE portal_users SET password_hash = ? WHERE id = ?')->execute([password_hash('password1', PASSWORD_DEFAULT), $c]);
portal_log_in(site(1), portal_user(1, $c));
check('clients are not staff', !portal_is_staff(portal_viewer(site(1))));
portal_log_out(site(1));
// current_user() is remembered for the whole request, so check the owner in a fresh process.
$owner = shell_exec('RC_CONFIG=' . escapeshellarg("$tmp/config.php") . ' php -r ' . escapeshellarg('ob_start(); require "' . __DIR__ . '/../lib/bootstrap.php";
    log_in(1); $q = db()->prepare("SELECT s.* FROM sites s WHERE id = ?"); $q->execute([1]); $a = portal_viewer($q->fetch()); $q->execute([2]); $b = portal_viewer($q->fetch());
    ob_end_clean(); echo ($a["role"] ?? "") . "|" . ($b === null ? "none" : "x");') . ' 2>/dev/null');
check('the owner can always open their portal, and only their own', trim((string) $owner) === 'owner|none');

proc_terminate($server);
exec('rm -rf ' . escapeshellarg($tmp));
ob_end_flush();
echo $failed ? "\n$failed FAILED\n" : "\nAll passed\n";
exit($failed ? 1 : 0);
