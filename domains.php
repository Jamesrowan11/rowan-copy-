<?php
// Search for, buy and manage domains (Name.com, billed yearly through Stripe).
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();
$errors = [];
$results = [];
$canBuy = plan_feature($user, 'custom_domain');
$ready = registrar_enabled() && stripe_enabled();

/** Turn what was typed into domain names to check: "joes plumbing" -> joesplumbing.com, .net, ... */
function domain_candidates(string $q): array
{
    $q = strtolower(trim($q));
    $q = preg_replace('#^https?://#', '', $q) ?? '';
    $q = preg_replace('/^www\./', '', explode('/', $q)[0]) ?? '';
    $tlds = array_map('strtolower', (array) registrar_settings()['tlds']);
    if (str_contains($q, '.')) {
        [$label, $tld] = explode('.', $q, 2);
        $label = preg_replace('/[^a-z0-9-]/', '', $label) ?? '';
        $names = [$label . '.' . $tld];
        foreach ($tlds as $t) {
            $names[] = $label . '.' . $t;
        }
    } else {
        $label = preg_replace('/[^a-z0-9-]/', '', str_replace(' ', '', $q)) ?? '';
        $names = array_map(fn ($t) => $label . '.' . $t, $tlds);
    }
    $label = trim($label, '-');
    if (strlen($label) < 2 || strlen($label) > 63) {
        return [];
    }
    return array_values(array_unique(array_filter($names, fn ($n) => (bool) normalize_domain($n))));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $action = (string) ($_POST['action'] ?? '');
    try {
        if ($action === 'checkout') {
            if (!$canBuy) {
                throw new RegistrarError('Buying a domain needs a paid plan. See Billing to upgrade.');
            }
            if (!throttle('domain-buy:' . $user['id'], 10, 3600)) {
                throw new RegistrarError('Too many attempts. Please wait a bit and try again.');
            }
            $domain = normalize_domain(post_str('domain', 253));
            if ($domain === '') {
                throw new RegistrarError('Invalid domain.');
            }
            $siteId = (int) ($_POST['site_id'] ?? 0) ?: null;
            if ($siteId) {
                owned_site($siteId, $user);
            }
            [$contact, $errors] = validate_registrant($_POST);
            if (!$errors) {
                $url = start_domain_checkout($user, $domain, $siteId, $contact);
                header('Location: ' . $url, true, 303);
                exit;
            }
            $_GET['buy'] = $domain;
        } elseif (in_array($action, ['autorenew_off', 'autorenew_on'], true)) {
            $stmt = db()->prepare("SELECT * FROM domain_orders WHERE id = ? AND user_id = ? AND stripe_subscription_id IS NOT NULL");
            $stmt->execute([(int) ($_POST['order_id'] ?? 0), $user['id']]);
            if ($order = $stmt->fetch()) {
                $off = $action === 'autorenew_off';
                sync_domain_subscription(stripe()->subscriptions->update($order['stripe_subscription_id'], ['cancel_at_period_end' => $off]));
                flash($off ? "{$order['domain']} won't renew. It stays yours until it expires." : "{$order['domain']} will renew automatically each year.");
            }
            redirect('domains.php');
        }
    } catch (RegistrarError $e) {
        $errors['form'] = $e->getMessage();
        $_GET['buy'] ??= post_str('domain', 253);
    } catch (\Stripe\Exception\ApiErrorException $e) {
        error_log('Rowan Copy Stripe error: ' . $e->getMessage());
        $errors['form'] = 'We couldn\'t start the payment. Please try again in a minute.';
    }
}

// Back from Stripe: set the domain up right away (the webhook does the same; whichever is first wins).
if (isset($_GET['paid'], $_GET['session']) && preg_match('/^cs_[A-Za-z0-9_]+$/', (string) $_GET['session'])) {
    $stmt = db()->prepare('SELECT * FROM domain_orders WHERE id = ? AND user_id = ? AND stripe_session_id = ?');
    $stmt->execute([(int) $_GET['paid'], $user['id'], (string) $_GET['session']]);
    if ($order = $stmt->fetch()) {
        try {
            $session = stripe()->checkout->sessions->retrieve($order['stripe_session_id']);
            if ($session->payment_status === 'paid' || $session->status === 'complete') {
                fulfill_domain_order((int) $order['id'], $session->subscription ? (string) $session->subscription : null);
                $order = domain_order((int) $order['id']);
                flash($order['status'] === 'active' ? "Congratulations, {$order['domain']} is yours! It will be live within the hour."
                    : ($order['status'] === 'failed' ? "Payment received, but we hit a snag registering {$order['domain']}. Our team has been notified and will sort it out or refund you."
                    : "Payment received. We're finishing the setup for {$order['domain']}."), $order['status'] === 'failed' ? 'err' : 'ok');
            }
        } catch (\Stripe\Exception\ApiErrorException $e) {
            error_log('Rowan Copy Stripe error: ' . $e->getMessage());
        }
    }
    redirect('domains.php');
}

$q = trim((string) ($_GET['q'] ?? ''));
if ($q !== '' && $ready) {
    $names = domain_candidates($q);
    if (!$names) {
        $errors['search'] = 'Type a name like joesplumbing or joesplumbing.com.';
    } elseif (!throttle('domain-search:' . $user['id'], 30, 600)) {
        $errors['search'] = 'Too many searches. Please wait a few minutes.';
    } else {
        try {
            $results = registrar_check($names);
            usort($results, fn ($a, $b) => array_search($a['domain'], $names, true) <=> array_search($b['domain'], $names, true));
        } catch (RegistrarError $e) {
            $errors['search'] = 'Domain search isn\'t available right now. Please try again shortly.';
        }
    }
}

$buy = isset($_GET['buy']) ? normalize_domain((string) $_GET['buy']) : '';
$buyQuote = null;
if ($buy !== '' && $ready && $canBuy) {
    try {
        $buyQuote = registrar_check([$buy])[0] ?? null;
    } catch (RegistrarError $e) {
        $errors['form'] = $e->getMessage();
    }
}
$mySites = db()->prepare('SELECT id, name FROM sites WHERE user_id = ? ORDER BY name');
$mySites->execute([$user['id']]);
$mySites = $mySites->fetchAll();
$orders = user_domain_orders((int) $user['id']);
$money = fn (int $cents) => '$' . number_format($cents / 100, 2);
$err = fn ($k) => isset($errors[$k]) ? '<span class="field-error">' . h($errors[$k]) . '</span>' : '';
$nameParts = explode(' ', (string) $user['name'], 2);

page_header('Domains');
?>
<div class="page">
  <p class="eyebrow">Domains</p>
  <h1>Find your domain</h1>
  <?php if (!$ready): ?>
    <div class="notice">Domain sales are coming soon. In the meantime you can connect a domain you already own from your website's Settings.</div>
  <?php else: ?>
    <?php if (registrar_is_sandbox() && is_staff($user)): ?><p class="notice small">Test mode: domains come from Name.com's sandbox and aren't real.</p><?php endif; ?>
    <form method="get" class="domain-search">
      <input name="q" value="<?= h($q) ?>" placeholder="yourbusiness" maxlength="70" aria-label="Domain name" required>
      <button class="btn btn-accent">Search</button>
    </form>
    <?= $err('search') ?>

    <?php if ($results): ?>
      <div class="table-wrap domain-results"><table>
        <?php foreach ($results as $r): ?>
          <tr>
            <td><strong><?= h($r['domain']) ?></strong></td>
            <?php if ($r['available']): ?>
              <td><?= h($money($r['price_cents'])) ?>/year</td>
              <td><?= $canBuy ? '<a class="btn btn-sm" href="' . h(base_url('domains.php?buy=' . rawurlencode($r['domain']))) . '">Buy</a>'
                  : '<a class="btn btn-ghost btn-sm" href="' . h(base_url('billing.php')) . '">Upgrade to buy</a>' ?></td>
            <?php else: ?>
              <td class="muted">Taken</td><td></td>
            <?php endif; ?>
          </tr>
        <?php endforeach; ?>
      </table></div>
      <p class="muted small">Prices include registration, yearly renewal, DNS setup, and connecting it to your website and email.</p>
    <?php endif; ?>

    <?php if ($buyQuote && $buyQuote['available']): ?>
      <div class="card" id="buy">
        <h2>Buy <?= h($buy) ?> · <?= h($money($buyQuote['price_cents'])) ?>/year</h2>
        <p class="muted small">Domain registries require the owner's contact details. They're kept private where the domain ending allows it.</p>
        <?php if (isset($errors['form'])): ?><p class="error"><?= h($errors['form']) ?></p><?php endif; ?>
        <form method="post" class="form-2">
          <?= csrf_field() ?><input type="hidden" name="action" value="checkout"><input type="hidden" name="domain" value="<?= h($buy) ?>">
          <label>First name <input name="first_name" required value="<?= h($_POST['first_name'] ?? $nameParts[0]) ?>"><?= $err('first_name') ?></label>
          <label>Last name <input name="last_name" required value="<?= h($_POST['last_name'] ?? ($nameParts[1] ?? '')) ?>"><?= $err('last_name') ?></label>
          <label>Business (optional) <input name="company" value="<?= h($_POST['company'] ?? '') ?>"></label>
          <label>Email <input type="email" name="email" required value="<?= h($_POST['email'] ?? $user['email']) ?>"><?= $err('email') ?></label>
          <label>Street address <input name="address1" required value="<?= h($_POST['address1'] ?? '') ?>"><?= $err('address1') ?></label>
          <label>Apt, suite (optional) <input name="address2" value="<?= h($_POST['address2'] ?? '') ?>"></label>
          <label>City <input name="city" required value="<?= h($_POST['city'] ?? '') ?>"><?= $err('city') ?></label>
          <label>State <input name="state" maxlength="60" placeholder="MD" value="<?= h($_POST['state'] ?? '') ?>"><?= $err('state') ?></label>
          <label>ZIP code <input name="zip" required value="<?= h($_POST['zip'] ?? '') ?>"><?= $err('zip') ?></label>
          <label>Country <input name="country" maxlength="2" value="<?= h($_POST['country'] ?? 'US') ?>"><?= $err('country') ?></label>
          <label>Phone <input type="tel" name="phone" required placeholder="410-555-1234" value="<?= h($_POST['phone'] ?? '') ?>"><?= $err('phone') ?></label>
          <label>Show this website on it
            <select name="site_id">
              <option value="">Not yet, I'll connect it later</option>
              <?php foreach ($mySites as $s): ?><option value="<?= (int) $s['id'] ?>" <?= count($mySites) === 1 ? 'selected' : '' ?>><?= h($s['name']) ?></option><?php endforeach; ?>
            </select>
          </label>
          <button class="btn btn-lg btn-accent btn-block">Continue to payment</button>
        </form>
      </div>
    <?php elseif ($buy !== '' && $canBuy): ?>
      <p class="error"><?= h($buy) ?> isn't available. Try another name.</p>
    <?php elseif (!$canBuy): ?>
      <p class="notice small">Buying a domain is included with paid plans. <a href="<?= h(base_url('billing.php')) ?>">See plans</a></p>
    <?php endif; ?>
  <?php endif; ?>

  <?php if ($orders): ?>
    <h2 class="m-gap">Your domains</h2>
    <div class="table-wrap"><table>
      <tr><th>Domain</th><th>Status</th><th>Renews</th><th></th></tr>
      <?php foreach ($orders as $o): ?>
        <tr>
          <td><strong><?= h($o['domain']) ?></strong><?= $o['site_name'] ? '<br><span class="muted small">Shows ' . h($o['site_name']) . '</span>' : '' ?></td>
          <td><?= h(['registering' => 'Setting up…', 'registered' => 'Setting up…', 'active' => 'Active', 'setup_failed' => 'Setting up…',
              'failed' => 'Problem: our team is on it', 'expiring' => 'Won\'t renew'][$o['status']] ?? $o['status']) ?></td>
          <td><?= $o['expires_at'] ? h(date('M j, Y', strtotime($o['expires_at'] . ' UTC'))) : '' ?><?= $o['autorenew'] ? '' : ' <span class="muted small">(expires)</span>' ?></td>
          <td><?php if ($o['stripe_subscription_id'] && in_array($o['status'], ['active', 'registered', 'setup_failed', 'expiring'], true)): ?>
            <form method="post"><?= csrf_field() ?><input type="hidden" name="order_id" value="<?= (int) $o['id'] ?>">
              <?php if ($o['autorenew']): ?>
                <input type="hidden" name="action" value="autorenew_off"><button class="link small" onclick="return confirm('Turn off auto-renew? The domain will expire at the end of its year and could be bought by someone else.')">Turn off auto-renew</button>
              <?php else: ?>
                <input type="hidden" name="action" value="autorenew_on"><button class="link small">Turn on auto-renew</button>
              <?php endif; ?>
            </form>
          <?php endif; ?></td>
        </tr>
      <?php endforeach; ?>
    </table></div>
    <p class="muted small">Manage email accounts and DNS for your domains from your <a href="<?= h(base_url('dashboard.php')) ?>">dashboard</a>.</p>
  <?php endif; ?>
</div>
<?php page_footer();
