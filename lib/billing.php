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
        'ai_limit' => 5, 'max_sites' => 1, 'max_mailboxes' => 0, 'dns' => false,
        'custom_domain' => false, 'remove_badge' => false, 'edit_code' => false,
        'features' => ['1 website', '5 AI designs or edits a month', 'Rowan Copy web address'],
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

/**
 * May this customer edit their website's code by hand? Set 'edit_code' on a
 * plan in config.php; a plan without the setting allows it on every paid plan
 * (Starter and up) and not on Free. Staff always can, for support.
 */
function can_edit_code(?array $user): bool
{
    if (is_staff($user)) {
        return true;
    }
    $plan = user_plan($user);
    return array_key_exists('edit_code', $plan) ? (bool) $plan['edit_code'] : plan_key($user) !== 'free';
}

/**
 * A plan's feature list as shown to customers (pricing, billing, the plans
 * API). Adds "Edit your website's code" to plans that include it, unless the
 * list already mentions code, placing it before the support line.
 */
function plan_features(string $key, array $plan): array
{
    $features = array_values(array_map('strval', (array) ($plan['features'] ?? [])));
    // Email accounts are paid separately now (lib/mailbilling.php), so plans no
    // longer list a number of them.
    $mailLine = 'Email accounts from ' . str_replace('/month', '', mail_tier_price('lite')) . '/month each';
    $features = array_values(array_filter($features, fn ($f) => !preg_match('/\bemail accounts?\b/i', $f)));
    if ($key !== 'free') {
        $after = array_keys(preg_grep('/badge|domain/i', $features));
        array_splice($features, $after ? end($after) + 1 : count($features), 0, [$mailLine]);
    }
    $editsCode = array_key_exists('edit_code', $plan) ? (bool) $plan['edit_code'] : $key !== 'free';
    if (!$editsCode || preg_grep('/\bcode\b/i', $features)) {
        return $features;
    }
    $line = "Edit your website's code";
    $support = array_keys(preg_grep('/support/i', $features));
    if ($support) {
        array_splice($features, $support[0], 0, [$line]);
    } else {
        $features[] = $line;
    }
    return $features;
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

/** Which plan a Stripe price belongs to (monthly or yearly). */
function plan_for_price(string $priceId): ?string
{
    foreach (plans() as $key => $plan) {
        if ($priceId !== '' && in_array($priceId, [$plan['stripe_price'] ?? '', $plan['stripe_price_yearly'] ?? ''], true)) {
            return $key;
        }
    }
    return null;
}

/** The Stripe price for a plan and billing interval ('month' or 'year'), or '' if not offered. */
function plan_price_id(array $plan, string $interval): string
{
    return (string) ($interval === 'year' ? ($plan['stripe_price_yearly'] ?? '') : ($plan['stripe_price'] ?? ''));
}

function max_mailboxes(array $user): int
{
    return (int) (user_plan($user)['max_mailboxes'] ?? 0);
}

/** Email accounts this customer has across every domain linked to them. */
function count_user_mailboxes(int $userId): int
{
    $stmt = db()->prepare('SELECT COUNT(*) FROM mail_accounts WHERE user_id = ?');
    $stmt->execute([$userId]);
    $n = (int) $stmt->fetchColumn();
    if (plesk_enabled()) { // older mailboxes still on Plesk
        foreach (user_hosting_domains($userId) as $d) {
            $n += count(plesk_list_mailboxes((int) $d['plesk_site_id']));
        }
    }
    return $n;
}

/**
 * Bring a customer's plan in line with their Stripe subscription.
 * Called from the webhook and right after checkout, so it must be safe to run twice.
 */
function sync_subscription(\Stripe\Subscription $sub): void
{
    // Domain subscriptions are separate from website plans.
    if (($sub->metadata['rc_kind'] ?? '') === 'domain') {
        sync_domain_subscription($sub);
        return;
    }
    // So are email accounts (lib/mailbilling.php).
    if (($sub->metadata['rc_kind'] ?? '') === 'mail') {
        sync_mail_subscription($sub);
        return;
    }
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
        if ($planKey !== $user['plan']) {
            sync_user_hosting((int) $user['id']); // the badge depends on the plan
        }
        return;
    }

    // The subscription ended. Only undo a plan that Stripe gave them; a plan you set
    // by hand on the admin page stays.
    if ($user['stripe_subscription_id'] === $sub->id || $user['stripe_subscription_id'] === null) {
        $plan = $user['plan_source'] === 'stripe' ? 'free' : $user['plan'];
        $source = $user['plan_source'] === 'stripe' ? 'free' : $user['plan_source'];
        db()->prepare('UPDATE users SET plan = ?, plan_source = ?, subscription_status = ?, plan_cancels = 0 WHERE id = ?')
            ->execute([$plan, $source, $sub->status, $user['id']]);
        if ($plan !== $user['plan']) {
            sync_user_hosting((int) $user['id']);
        }
    }
}
