<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();
$error = '';

/** The customer's live Stripe subscription, or null. */
function live_subscription(array $user): ?\Stripe\Subscription
{
    if ($user['plan_source'] !== 'stripe' || !in_array($user['subscription_status'], ['active', 'trialing', 'past_due'], true)) {
        return null;
    }
    $stmt = db()->prepare('SELECT stripe_subscription_id FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $id = (string) $stmt->fetchColumn();
    if ($id === '') {
        return null;
    }
    $sub = stripe()->subscriptions->retrieve($id);
    $owner = is_string($sub->customer) ? $sub->customer : $sub->customer->id;
    return $owner === $user['stripe_customer_id'] ? $sub : null;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    try {
        if (($_POST['action'] ?? '') === 'checkout') {
            $key = (string) ($_POST['plan'] ?? '');
            $interval = ($_POST['interval'] ?? '') === 'year' ? 'year' : 'month';
            $plan = plans()[$key] ?? null;
            $priceId = $plan ? plan_price_id($plan, $interval) : '';
            if ($priceId === '') {
                throw new RuntimeException('That plan isn\'t available' . ($interval === 'year' ? ' yearly' : '') . '.');
            }
            if ($user['plan_source'] === 'stripe' && in_array($user['subscription_status'], ['active', 'trialing', 'past_due'], true)) {
                throw new RuntimeException('You already have a subscription. Use "Manage billing" to switch plans.');
            }
            $session = stripe()->checkout->sessions->create([
                'mode' => 'subscription',
                'customer' => stripe_customer_id($user),
                'client_reference_id' => (string) $user['id'],
                'line_items' => [['price' => $priceId, 'quantity' => 1]],
                'allow_promotion_codes' => true,
                'success_url' => base_url('billing.php?done={CHECKOUT_SESSION_ID}'),
                'cancel_url' => base_url('billing.php'),
                'subscription_data' => ['metadata' => ['rowan_copy_user_id' => (string) $user['id']]]
                    + (referral_trial_days($user) > 0 ? ['trial_period_days' => referral_trial_days($user)] : []),
            ]);
            header('Location: ' . $session->url, true, 303);
            exit;
        }
        // Change plan or billing period on an existing subscription, right here.
        if (($_POST['action'] ?? '') === 'switch') {
            $key = (string) ($_POST['plan'] ?? '');
            $interval = ($_POST['interval'] ?? '') === 'year' ? 'year' : 'month';
            $plan = plans()[$key] ?? null;
            $priceId = $plan ? plan_price_id($plan, $interval) : '';
            $sub = live_subscription($user);
            if ($priceId === '' || !$sub) {
                throw new RuntimeException('That plan isn\'t available.');
            }
            $item = $sub->items->data[0];
            if ($item->price->id !== $priceId) {
                $updated = stripe()->subscriptions->update($sub->id, [
                    'items' => [['id' => $item->id, 'price' => $priceId]],
                    // Charge (or credit) the difference now, and only switch if that payment succeeds.
                    'proration_behavior' => 'always_invoice',
                    'payment_behavior' => 'pending_if_incomplete',
                    'cancel_at_period_end' => false,
                ]);
                if (!empty($updated->pending_update)) {
                    flash('Your card couldn\'t be charged for the new plan, so nothing changed yet. Update your card under "Manage billing" and try again.', 'err');
                } else {
                    sync_subscription($updated);
                    flash('You\'re now on ' . $plan['name'] . ($interval === 'year' ? ' (yearly)' : ' (monthly)') . '. Any difference in price has been charged or credited to your account.');
                }
            }
            redirect('billing.php' . ($interval === 'year' ? '?interval=year' : ''));
        }
        // Cancel at the end of the paid period (back to Free), or undo that.
        if (in_array($_POST['action'] ?? '', ['cancel', 'resume'], true)) {
            $sub = live_subscription($user);
            if (!$sub) {
                throw new RuntimeException('You don\'t have an active subscription.');
            }
            $cancel = $_POST['action'] === 'cancel';
            sync_subscription(stripe()->subscriptions->update($sub->id, ['cancel_at_period_end' => $cancel]));
            flash($cancel ? 'Your plan will end at the close of this billing period, then you\'ll move to Free. Your websites stay online.' : 'Great, your plan will keep renewing.');
            redirect('billing.php');
        }
        if (($_POST['action'] ?? '') === 'portal') {
            $portal = stripe()->billingPortal->sessions->create([
                'customer' => stripe_customer_id($user),
                'return_url' => base_url('billing.php'),
            ]);
            header('Location: ' . $portal->url, true, 303);
            exit;
        }
    } catch (\Stripe\Exception\ApiErrorException $e) {
        error_log('Rowan Copy Stripe error: ' . $e->getMessage());
        $error = 'We couldn\'t reach our payment provider. Please try again in a minute.';
    } catch (RuntimeException $e) {
        $error = $e->getMessage();
    }
}

// Back from Stripe Checkout: update the plan right away instead of waiting for the webhook.
if (isset($_GET['done']) && stripe_enabled() && preg_match('/^cs_[A-Za-z0-9_]+$/', (string) $_GET['done'])) {
    try {
        $session = stripe()->checkout->sessions->retrieve((string) $_GET['done'], ['expand' => ['subscription']]);
        if ($session->customer === $user['stripe_customer_id'] && $session->subscription instanceof \Stripe\Subscription) {
            sync_subscription($session->subscription);
            flash('Thank you! Your plan is active.');
        }
    } catch (\Stripe\Exception\ApiErrorException $e) {
        error_log('Rowan Copy Stripe error: ' . $e->getMessage());
    }
    redirect('billing.php');
}

$current = plan_key($user);
$interval = ($_GET['interval'] ?? '') === 'year' ? 'year' : 'month';
$hasYearly = (bool) array_filter(plans(), fn ($p) => !empty($p['stripe_price_yearly']));
$hasSub = $user['plan_source'] === 'stripe' && in_array($user['subscription_status'], ['active', 'trialing', 'past_due'], true);
// Which price they're on now, so the page knows if they're monthly or yearly.
$currentInterval = 'month';
if ($hasSub && stripe_enabled()) {
    try {
        $liveSub = live_subscription($user);
        $priceNow = $liveSub ? (string) $liveSub->items->data[0]->price->id : '';
        if ($priceNow !== '' && $priceNow === (plans()[$current]['stripe_price_yearly'] ?? null)) {
            $currentInterval = 'year';
        }
    } catch (\Stripe\Exception\ApiErrorException $e) {
        error_log('Rowan Copy Stripe error: ' . $e->getMessage());
    }
}
if (!isset($_GET['interval']) && $hasSub) {
    $interval = $currentInterval;
}

$order = array_keys(plans());
$rank = array_flip($order);
$plan = user_plan($user);
$priceNow = $currentInterval === 'year' && !empty($plan['price_yearly']) ? $plan['price_yearly'] : ($plan['price'] ?? '');
page_header('Billing');
?>
<div class="pg">
  <div class="pg-head"><div><h1>Billing</h1><p class="muted">Change plans any time. No surprises.</p></div></div>
  <?php if ($error): ?><p class="error" role="alert"><?= h($error) ?></p><?php endif; ?>
  <?php if ($user['subscription_status'] === 'past_due'): ?>
    <p class="error" role="alert">Your last payment didn't go through. Please update your card to keep your plan.</p>
  <?php endif; ?>

  <section class="box plan-now">
    <div class="plan-now-main">
      <span class="kicker">Current plan</span>
      <strong class="plan-now-name"><?= h($plan['name']) ?> <span><?= h($priceNow) ?></span></strong>
      <span class="plan-now-sub">
        <?php if ($hasSub && $user['plan_renews_at']): ?>
          <?= $user['plan_cancels'] ? 'Ends' : 'Renews' ?> <?= h(date('F j, Y', strtotime($user['plan_renews_at'] . ' UTC'))) ?><?= $currentInterval === 'year' ? ' · billed yearly' : '' ?>
        <?php elseif ($user['plan_source'] === 'manual'): ?>
          Managed by Rowan Copy. Questions? <?= h((string) cfg('support_email')) ?>
        <?php else: ?>
          <?= $current === array_key_last(plans()) ? 'Thanks for being on our top plan.' : 'Upgrade any time to unlock more websites and features.' ?>
        <?php endif; ?>
      </span>
    </div>
    <?php if ($user['stripe_customer_id'] && stripe_enabled()): ?>
      <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="portal">
        <button class="btn btn-accent"><?= icon('card') ?> Card and invoices</button></form>
    <?php endif; ?>
  </section>

  <?php if (!$hasSub && ($trialDays = referral_trial_days($user)) > 0): ?>
    <div class="notice">🎁 You were invited by a friend: your first <?= $trialDays ?> days on any paid plan are free. You won't be charged until the trial ends, and you can cancel before then.</div>
  <?php endif; ?>

  <div class="pg-row">
    <h2 class="pg-h2">Plans</h2>
    <?php if ($hasYearly): ?>
      <div class="seg" role="group" aria-label="Billing period">
        <a href="<?= h(base_url('billing.php?interval=month')) ?>"<?= $interval === 'month' ? ' aria-current="true"' : '' ?>>Monthly</a>
        <a href="<?= h(base_url('billing.php?interval=year')) ?>"<?= $interval === 'year' ? ' aria-current="true"' : '' ?>>Yearly <small>2 months free</small></a>
      </div>
    <?php endif; ?>
  </div>

  <div class="plans">
    <?php foreach (plans() as $key => $p): ?>
      <?php
        $isCurrent = $key === $current;
        $up = ($rank[$key] ?? 0) > ($rank[$current] ?? 0);
        $popular = $key === 'business';
      ?>
      <div class="box plan-card<?= $isCurrent ? ' is-current' : '' ?><?= $popular ? ' is-popular' : '' ?>">
        <?php if ($popular): ?><span class="plan-flag">Most popular</span><?php endif; ?>
        <div class="plan-top"><h3><?= h($p['name']) ?></h3><?php if ($isCurrent): ?><span class="tag tag-ok">Your plan</span><?php endif; ?></div>
        <p class="plan-cost"><?= h($interval === 'year' && !empty($p['price_yearly']) ? $p['price_yearly'] : ($p['price'] ?? '')) ?></p>
        <ul class="ticks">
          <?php foreach (plan_features((string) $key, (array) $p) as $f): ?><li><?= icon('check') ?><?= h($f) ?></li><?php endforeach; ?>
        </ul>
        <div class="plan-cta">
        <?php if ($isCurrent && (!$hasSub || $interval === $currentInterval)): ?>
          <?php if ($hasSub && $user['plan_cancels']): ?>
            <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="resume"><button class="btn btn-accent btn-block">Keep my plan</button></form>
          <?php else: ?>
            <button class="btn btn-ghost btn-block" disabled>Current plan</button>
          <?php endif; ?>
        <?php elseif ($key === 'free' && $hasSub): ?>
          <?php if (!$user['plan_cancels']): ?>
            <form method="post" data-confirm="Cancel your plan? It stays active until the end of this billing period, then you move to Free. Your websites stay online.">
              <?= csrf_field() ?><input type="hidden" name="action" value="cancel"><button class="btn btn-ghost btn-block">Cancel plan</button></form>
          <?php else: ?>
            <span class="muted small">You'll move to Free when your current period ends.</span>
          <?php endif; ?>
        <?php elseif (plan_price_id($p, $interval) !== '' && stripe_enabled()): ?>
          <?php if ($hasSub): ?>
            <?php $label = $isCurrent ? 'Switch to ' . ($interval === 'year' ? 'yearly' : 'monthly') : ($up ? 'Upgrade to ' : 'Switch to ') . $p['name']; ?>
            <form method="post" data-confirm="<?= h($label . '? The price difference for the rest of this period is charged or credited right away.') ?>">
              <?= csrf_field() ?><input type="hidden" name="action" value="switch"><input type="hidden" name="plan" value="<?= h($key) ?>"><input type="hidden" name="interval" value="<?= h($interval) ?>">
              <button class="btn btn-block <?= $up ? 'btn-accent' : 'btn-ghost' ?>"><?= h($label) ?></button></form>
          <?php else: ?>
            <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="checkout"><input type="hidden" name="plan" value="<?= h($key) ?>"><input type="hidden" name="interval" value="<?= h($interval) ?>">
              <button class="btn btn-block <?= $up ? 'btn-accent' : 'btn-ghost' ?>"><?= $up ? 'Upgrade to ' : 'Choose ' ?><?= h($p['name']) ?></button></form>
          <?php endif; ?>
        <?php endif; ?>
        </div>
      </div>
    <?php endforeach; ?>
  </div>
  <p class="muted small">Payments are handled securely by Stripe. Rowan Copy never sees your card number. Past invoices are under “Card and invoices”.</p>
</div>
<?php page_footer();
