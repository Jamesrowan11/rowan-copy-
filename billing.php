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
                'subscription_data' => ['metadata' => ['rowan_copy_user_id' => (string) $user['id']]],
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

page_header('Billing');
?>
<div class="page">
  <h1>Plans and billing</h1>
  <?php if ($error): ?><p class="error"><?= h($error) ?></p><?php endif; ?>

  <div class="card">
    <h2>Your plan: <?= h(user_plan($user)['name']) ?></h2>
    <?php if ($user['subscription_status'] === 'past_due'): ?>
      <p class="error">Your last payment didn't go through. Please update your card to keep your plan.</p>
    <?php endif; ?>
    <?php if ($hasSub && $user['plan_renews_at']): ?>
      <p class="muted"><?= $user['plan_cancels'] ? 'Ends on ' : 'Renews on ' ?><?= h(date('F j, Y', strtotime($user['plan_renews_at'] . ' UTC'))) ?>.</p>
    <?php elseif ($user['plan_source'] === 'manual'): ?>
      <p class="muted">Your plan is managed by Rowan Copy. Contact <?= h((string) cfg('support_email')) ?> with billing questions.</p>
    <?php endif; ?>
    <?php if ($user['stripe_customer_id'] && stripe_enabled()): ?>
      <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="portal">
        <button class="btn btn-ghost">Manage billing: card and invoices</button></form>
    <?php endif; ?>
  </div>

  <?php if ($hasYearly): ?>
    <div class="interval-toggle" role="group" aria-label="Billing period">
      <a href="<?= h(base_url('billing.php')) ?>" class="<?= $interval === 'month' ? 'active' : '' ?>">Monthly</a>
      <a href="<?= h(base_url('billing.php?interval=year')) ?>" class="<?= $interval === 'year' ? 'active' : '' ?>">Yearly <span class="save">2 months free</span></a>
    </div>
  <?php endif; ?>

  <div class="plan-grid">
    <?php foreach (plans() as $key => $plan): ?>
      <div class="card plan<?= $key === $current ? ' plan-current' : '' ?>">
        <h3><?= h($plan['name']) ?></h3>
        <p class="plan-price"><?= h($interval === 'year' && !empty($plan['price_yearly']) ? $plan['price_yearly'] : ($plan['price'] ?? '')) ?></p>
        <ul>
          <?php foreach ((array) ($plan['features'] ?? []) as $f): ?><li><?= h($f) ?></li><?php endforeach; ?>
        </ul>
        <?php if ($key === $current && (!$hasSub || $interval === $currentInterval)): ?>
          <span class="badge badge-live">Current plan</span>
          <?php if ($hasSub && $user['plan_cancels']): ?>
            <form method="post" class="plan-action"><?= csrf_field() ?><input type="hidden" name="action" value="resume"><button class="btn btn-ghost btn-block">Keep my plan</button></form>
          <?php endif; ?>
        <?php elseif ($key === 'free' && $hasSub): ?>
          <?php if (!$user['plan_cancels']): ?>
            <form method="post" class="plan-action" onsubmit="return confirm('Cancel your plan? It stays active until the end of this billing period, then you move to Free. Your websites stay online.')">
              <?= csrf_field() ?><input type="hidden" name="action" value="cancel"><button class="btn btn-ghost btn-block">Cancel plan</button></form>
          <?php else: ?>
            <span class="muted small">You'll move to Free when your current period ends.</span>
          <?php endif; ?>
        <?php elseif (plan_price_id($plan, $interval) !== '' && stripe_enabled()): ?>
          <?php if ($hasSub): ?>
            <?php $label = $key === $current ? 'Switch to ' . ($interval === 'year' ? 'yearly' : 'monthly') : 'Switch to ' . $plan['name']; ?>
            <form method="post" class="plan-action" onsubmit="return confirm(<?= h(json_encode($label . '? The price difference for the rest of this period is charged or credited right away.')) ?>)">
              <?= csrf_field() ?><input type="hidden" name="action" value="switch"><input type="hidden" name="plan" value="<?= h($key) ?>"><input type="hidden" name="interval" value="<?= h($interval) ?>">
              <button class="btn btn-block"><?= h($label) ?></button></form>
          <?php else: ?>
            <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="checkout"><input type="hidden" name="plan" value="<?= h($key) ?>"><input type="hidden" name="interval" value="<?= h($interval) ?>">
              <button class="btn btn-block">Choose <?= h($plan['name']) ?></button></form>
          <?php endif; ?>
        <?php endif; ?>
      </div>
    <?php endforeach; ?>
  </div>
  <p class="muted small">Payments are handled securely by Stripe. Rowan Copy never sees your card number.</p>
</div>
<?php page_footer();
