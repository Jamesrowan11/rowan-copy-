<?php
// ============================================================================
// ROWAN COPY: PLANS AND STRIPE BILLING
// Plans are defined in config.php. Customers subscribe through Stripe Checkout
// and manage cards, invoices and cancellation in Stripe's billing portal.
// Stripe tells us about changes through stripe-webhook.php.
// ============================================================================

declare(strict_types=1);

const DEFAULT_PLANS = [
    'free' => [
        'name' => 'Free', 'price' => '$0', 'stripe_price' => '',
        'ai_limit' => 10, 'max_sites' => 1, 'custom_domain' => false, 'remove_badge' => false,
        'features' => ['1 website', '10 AI designs or edits a month', 'Rowan Copy web address'],
    ],
];

/** @return array<string, array> plan key => plan settings ('free' always exists) */
function plans(): array
{
    $plans = (array) cfg('plans', []);
    return $plans + DEFAULT_PLANS;
}

function plan_key(?array $user): string
{
    $key = (string) ($user['plan'] ?? 'free');
    return isset(plans()[$key]) ? $key : 'free';
}

function user_plan(?array $user): array
{
    return plans()[plan_key($user)];
}

function plan_feature(?array $user, string $feature): bool
{
    return !empty(user_plan($user)[$feature]);
}

function max_sites(array $user): int
{
    return (int) (user_plan($user)['max_sites'] ?? 1);
}

function stripe_enabled(): bool
{
    return (string) (cfg('stripe')['secret_key'] ?? '') !== '';
}

function stripe(): \Stripe\StripeClient
{
    if (!stripe_enabled()) {
        throw new RuntimeException('Stripe is not set up yet.');
    }
    $conf = ['api_key' => (string) cfg('stripe')['secret_key']];
    if (!empty(cfg('stripe')['api_base'])) {
        $conf['api_base'] = (string) cfg('stripe')['api_base']; // only for local testing against a mock
    }
    return new \Stripe\StripeClient($conf);
}

/** The Stripe customer for this user, created on first use. */
function stripe_customer_id(array $user): string
{
    $stmt = db()->prepare('SELECT stripe_customer_id FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $id = (string) $stmt->fetchColumn();
    if ($id !== '') {
        return $id;
    }
    $customer = stripe()->customers->create([
        'email' => $user['email'],
        'name' => $user['name'],
        'metadata' => ['rowan_copy_user_id' => (string) $user['id']],
    ]);
    db()->prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?')->execute([$customer->id, $user['id']]);
    return $customer->id;
}

function plan_for_price(string $priceId): ?string
{
    foreach (plans() as $key => $plan) {
        if ($priceId !== '' && ($plan['stripe_price'] ?? '') === $priceId) {
            return $key;
        }
    }
    return null;
}

/**
 * Bring a customer's plan in line with their Stripe subscription.
 * Called from the webhook and right after checkout, so it must be safe to run twice.
 */
function sync_subscription(\Stripe\Subscription $sub): void
{
    $customerId = is_string($sub->customer) ? $sub->customer : $sub->customer->id;
    $stmt = db()->prepare('SELECT id, plan, plan_source, stripe_subscription_id FROM users WHERE stripe_customer_id = ?');
    $stmt->execute([$customerId]);
    $user = $stmt->fetch();
    if (!$user) {
        error_log("Rowan Copy: Stripe subscription {$sub->id} for unknown customer $customerId");
        return;
    }

    $item = $sub->items->data[0] ?? null;
    $planKey = $item ? plan_for_price((string) $item->price->id) : null;
    $renews = $item->current_period_end ?? ($sub->current_period_end ?? null);
    $live = in_array($sub->status, ['active', 'trialing', 'past_due'], true);

    if ($live && $planKey) {
        db()->prepare("UPDATE users SET plan = ?, plan_source = 'stripe', stripe_subscription_id = ?, subscription_status = ?,
                       plan_renews_at = ?, plan_cancels = ? WHERE id = ?")
            ->execute([$planKey, $sub->id, $sub->status, $renews ? gmdate('Y-m-d H:i:s', (int) $renews) : null,
                (int) (bool) $sub->cancel_at_period_end, $user['id']]);
        return;
    }

    // The subscription ended. Only undo a plan that Stripe gave them; a plan you set
    // by hand on the admin page stays.
    if ($user['stripe_subscription_id'] === $sub->id || $user['stripe_subscription_id'] === null) {
        $plan = $user['plan_source'] === 'stripe' ? 'free' : $user['plan'];
        $source = $user['plan_source'] === 'stripe' ? 'free' : $user['plan_source'];
        db()->prepare('UPDATE users SET plan = ?, plan_source = ?, subscription_status = ?, plan_cancels = 0 WHERE id = ?')
            ->execute([$plan, $source, $sub->status, $user['id']]);
    }
}
