<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    try {
        if (($_POST['action'] ?? '') === 'checkout') {
            $key = (string) ($_POST['plan'] ?? '');
            $plan = plans()[$key] ?? null;
            if (!$plan || empty($plan['stripe_price'])) {
                throw new RuntimeException('That plan isn\'t available.');
            }
            if ($user['plan_source'] === 'stripe' && in_array($user['subscription_status'], ['active', 'trialing', 'past_due'], true)) {
                throw new RuntimeException('You already have a subscription. Use "Manage billing" to switch plans.');
            }
            $session = stripe()->checkout->sessions->create([
                'mode' => 'subscription',
                'customer' => stripe_customer_id($user),
                'client_reference_id' => (string) $user['id'],
                'line_items' => [['price' => $plan['stripe_price'], 'quantity' => 1]],
                'allow_promotion_codes' => true,
                'success_url' => base_url('billing.php?done={CHECKOUT_SESSION_ID}'),
                'cancel_url' => base_url('billing.php'),
                'subscription_data' => ['metadata' => ['rowan_copy_user_id' => (string) $user['id']]],
            ]);
            header('Location: ' . $session->url, true, 303);
            exit;
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
$hasSub = $user['plan_source'] === 'stripe' && in_array($user['subscription_status'], ['active', 'trialing', 'past_due'], true);

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
        <button class="btn btn-ghost">Manage billing: card, invoices, change or cancel plan</button></form>
    <?php endif; ?>
  </div>

  <div class="plan-grid">
    <?php foreach (plans() as $key => $plan): ?>
      <div class="card plan<?= $key === $current ? ' plan-current' : '' ?>">
        <h3><?= h($plan['name']) ?></h3>
        <p class="plan-price"><?= h($plan['price'] ?? '') ?></p>
        <ul>
          <?php foreach ((array) ($plan['features'] ?? []) as $f): ?><li><?= h($f) ?></li><?php endforeach; ?>
        </ul>
        <?php if ($key === $current): ?>
          <span class="badge badge-live">Current plan</span>
        <?php elseif (!empty($plan['stripe_price']) && stripe_enabled()): ?>
          <?php if ($hasSub): ?>
            <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="portal"><button class="btn btn-block">Switch plan</button></form>
          <?php else: ?>
            <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="checkout"><input type="hidden" name="plan" value="<?= h($key) ?>">
              <button class="btn btn-block">Choose <?= h($plan['name']) ?></button></form>
          <?php endif; ?>
        <?php endif; ?>
      </div>
    <?php endforeach; ?>
  </div>
  <p class="muted small">Payments are handled securely by Stripe. Rowan Copy never sees your card number.</p>
</div>
<?php page_footer();
