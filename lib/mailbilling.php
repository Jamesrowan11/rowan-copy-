<?php
// ============================================================================
// ROWAN COPY: PAID EMAIL ACCOUNTS
// Every email account is billed monthly, and the customer picks the kind:
// Mail Lite (10 GB, $3) or Mail Premium (50 GB, $7). The accounts sit on one
// Stripe subscription per customer ("rc_kind" = mail), separate from the
// website plan, with one subscription item per kind; quantity = accounts.
// The Stripe product and prices are created on first use (found again by
// lookup key), so nothing has to be set up in the Stripe Dashboard.
//
// Zoho bills Rowan Copy per mailbox too. Whether a mailbox is Lite or Premium in
// Zoho is set by staff in Zoho Mail's admin console; admin-mailboxes.php lists
// accounts whose kind in Zoho doesn't match what the customer pays for.
// ============================================================================

declare(strict_types=1);

const MAIL_TIERS = [
    'lite' => ['name' => 'Mail Lite', 'storage' => '10 GB', 'cents' => 300],
    'premium' => ['name' => 'Mail Premium', 'storage' => '50 GB', 'cents' => 700],
];

/** Most email accounts one customer can have. */
const MAX_MAIL_ACCOUNTS = 50;

/** The two kinds of account. config.php 'mail_tiers' can change names, storage or prices. */
function mail_tiers(): array
{
    $tiers = MAIL_TIERS;
    foreach ((array) cfg('mail_tiers', []) as $k => $over) {
        if (isset($tiers[$k])) {
            $tiers[$k] = array_merge($tiers[$k], (array) $over);
        }
    }
    return $tiers;
}

function mail_tier(string $key): array
{
    $tiers = mail_tiers();
    if (!isset($tiers[$key])) {
        throw new RuntimeException('Pick Mail Lite or Mail Premium.');
    }
    return $tiers[$key];
}

/** "$3/month" */
function mail_tier_price(string $key): string
{
    $c = (int) mail_tier($key)['cents'];
    return '$' . ($c % 100 ? number_format($c / 100, 2) : (string) intdiv($c, 100)) . '/month';
}

function kv_get(string $k): string
{
    $stmt = db()->prepare('SELECT v FROM kv WHERE k = ?');
    $stmt->execute([$k]);
    return (string) $stmt->fetchColumn();
}

function kv_set(string $k, string $v): void
{
    db()->prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')->execute([$k, $v]);
}

/** The Stripe price for a kind of account, created in Stripe the first time. */
function mail_price_id(string $tier): string
{
    $t = mail_tier($tier);
    $lookup = 'rc_mail_' . $tier . '_' . (int) $t['cents'];
    $cached = kv_get('stripe_price:' . $lookup);
    if ($cached !== '') {
        return $cached;
    }
    $found = stripe()->prices->all(['lookup_keys' => [$lookup], 'active' => true, 'limit' => 1]);
    if (!empty($found->data[0])) {
        $id = (string) $found->data[0]->id;
    } else {
        $product = kv_get('stripe_product:mail_' . $tier);
        if ($product === '') {
            $product = (string) stripe()->products->create([
                'name' => 'Email account: ' . $t['name'] . ' (' . $t['storage'] . ')',
                'metadata' => ['rc_kind' => 'mail', 'rc_mail_tier' => $tier],
            ])->id;
            kv_set('stripe_product:mail_' . $tier, $product);
        }
        $id = (string) stripe()->prices->create([
            'product' => $product,
            'currency' => 'usd',
            'unit_amount' => (int) $t['cents'],
            'recurring' => ['interval' => 'month'],
            'lookup_key' => $lookup,
            'metadata' => ['rc_kind' => 'mail', 'rc_mail_tier' => $tier],
        ])->id;
    }
    kv_set('stripe_price:' . $lookup, $id);
    return $id;
}

/** Which kind of account a Stripe price is for, or null. */
function mail_tier_for_price(\Stripe\Price $price): ?string
{
    $tier = (string) ($price->metadata['rc_mail_tier'] ?? '');
    return isset(mail_tiers()[$tier]) ? $tier : null;
}

/** The customer's live email subscription, or null. */
function mail_subscription(array $user): ?\Stripe\Subscription
{
    $stmt = db()->prepare('SELECT mail_subscription_id, stripe_customer_id FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $row = $stmt->fetch();
    if (!$row || !$row['mail_subscription_id'] || !stripe_enabled()) {
        return null;
    }
    $sub = stripe()->subscriptions->retrieve((string) $row['mail_subscription_id']);
    $owner = is_string($sub->customer) ? $sub->customer : $sub->customer->id;
    if ($owner !== $row['stripe_customer_id'] || !in_array($sub->status, ['active', 'trialing', 'past_due'], true)) {
        return null;
    }
    return $sub;
}

/** Paid accounts on the subscription: tier => ['item' => item id, 'qty' => n]. */
function mail_seats(?\Stripe\Subscription $sub): array
{
    $out = [];
    foreach ($sub ? $sub->items->data : [] as $item) {
        if ($tier = mail_tier_for_price($item->price)) {
            $out[$tier] = ['item' => (string) $item->id, 'qty' => (int) $item->quantity];
        }
    }
    return $out;
}

/** Billed accounts the customer has: tier => count. */
function mail_used(int $userId): array
{
    $out = array_fill_keys(array_keys(mail_tiers()), 0);
    $stmt = db()->prepare('SELECT tier, COUNT(*) FROM mail_accounts WHERE user_id = ? AND billed = 1 GROUP BY tier');
    $stmt->execute([$userId]);
    foreach ($stmt->fetchAll(PDO::FETCH_NUM) as [$tier, $n]) {
        if (isset($out[$tier])) {
            $out[$tier] = (int) $n;
        }
    }
    return $out;
}

/**
 * Change how many accounts of each kind the customer pays for: $want is
 * tier => quantity (kinds left out stay as they are). When $charge is true the
 * difference is charged now and nothing changes unless the payment goes
 * through; otherwise it is credited or added to the next bill.
 * Returns false if the card was declined.
 */
function mail_set_seats(\Stripe\Subscription $sub, array $want, bool $charge): bool
{
    $seats = mail_seats($sub);
    $items = [];
    $total = 0;
    foreach (mail_tiers() as $tier => $_) {
        $qty = array_key_exists($tier, $want) ? max(0, (int) $want[$tier]) : ($seats[$tier]['qty'] ?? 0);
        $total += $qty;
        if (isset($seats[$tier])) {
            if ($qty !== $seats[$tier]['qty']) {
                $items[] = $qty > 0 ? ['id' => $seats[$tier]['item'], 'quantity' => $qty] : ['id' => $seats[$tier]['item'], 'deleted' => true];
            }
        } elseif ($qty > 0) {
            $items[] = ['price' => mail_price_id($tier), 'quantity' => $qty];
        }
    }
    if (!$items) {
        return true;
    }
    if ($total === 0) { // no accounts left: stop billing, with credit for the unused time
        stripe()->subscriptions->cancel($sub->id, ['prorate' => true, 'invoice_now' => true]);
        return true;
    }
    $params = ['items' => $items, 'proration_behavior' => $charge ? 'always_invoice' : 'create_prorations'];
    if ($charge) {
        $params['payment_behavior'] = 'pending_if_incomplete';
    }
    $updated = stripe()->subscriptions->update($sub->id, $params);
    return empty($updated->pending_update);
}

/**
 * Make sure the customer pays for one more account of this kind before it is
 * created. Returns null when it's paid for (now or already), or a Stripe
 * Checkout URL when the customer first has to add a card.
 */
function mail_buy_seat(array $user, string $tier, string $returnTo): ?string
{
    mail_tier($tier);
    $sub = mail_subscription($user);
    if ($sub) {
        $have = mail_seats($sub)[$tier]['qty'] ?? 0;
        $used = mail_used((int) $user['id'])[$tier];
        if ($used < $have) {
            return null; // already paid for (e.g. just bought through Checkout)
        }
        if (!mail_set_seats($sub, [$tier => $used + 1], true)) {
            throw new RuntimeException('Your card was declined, so the account wasn\'t created. Update your card under Billing, then try again.');
        }
        return null;
    }
    // Older accounts with billing scheduled get their card first (free until the
    // date staff set); the new account is then added to that subscription.
    if (mail_billing_scheduled($user) && !empty(mail_unbilled_customers()[(int) $user['id']])) {
        return mail_checkout_url($user, null, $returnTo);
    }
    return mail_checkout_url($user, $tier, $returnTo);
}

/**
 * Stripe Checkout for a customer with no email subscription yet: adds their
 * card and starts paying for one new account of $tier (if given) plus any older
 * accounts whose billing has been scheduled (free until that date).
 */
function mail_checkout_url(array $user, ?string $tier, string $returnTo): string
{
    $qty = [];
    $trialEnd = mail_billing_trial_end($user);
    if ($tier === null && mail_billing_scheduled($user)) {
        foreach (mail_unbilled_customers()[(int) $user['id']] ?? [] as $t => $n) {
            $qty[$t] = $n;
        }
    }
    if ($tier !== null) {
        $qty[$tier] = ($qty[$tier] ?? 0) + 1;
    }
    if (!$qty) {
        throw new RuntimeException('There are no email accounts to pay for.');
    }
    $items = [];
    foreach ($qty as $t => $n) {
        $items[] = ['price' => mail_price_id($t), 'quantity' => $n];
    }
    $session = stripe()->checkout->sessions->create([
        'mode' => 'subscription',
        'customer' => stripe_customer_id($user),
        'client_reference_id' => (string) $user['id'],
        'line_items' => $items,
        'success_url' => base_url($returnTo . (str_contains($returnTo, '?') ? '&' : '?') . 'mail_paid={CHECKOUT_SESSION_ID}'),
        'cancel_url' => base_url($returnTo),
        'metadata' => ['rc_kind' => 'mail', 'rowan_copy_user_id' => (string) $user['id']],
        // A new account is charged today; the free period only applies when the
        // checkout is just for older accounts.
        'subscription_data' => ['metadata' => ['rc_kind' => 'mail', 'rowan_copy_user_id' => (string) $user['id']]]
            + ($trialEnd && $tier === null ? ['trial_end' => $trialEnd] : []),
    ]);
    return (string) $session->url;
}

/** Has staff scheduled billing for this customer's older accounts? */
function mail_billing_scheduled(array $user): bool
{
    $stmt = db()->prepare('SELECT mail_billing_from FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    return (string) $stmt->fetchColumn() !== '';
}

/** Stop paying for one account of this kind (credit for the rest of the month). */
function mail_release_seat(array $user, string $tier): void
{
    $sub = mail_subscription($user);
    if (!$sub) {
        return;
    }
    $used = mail_used((int) $user['id']);
    mail_set_seats($sub, [$tier => $used[$tier]], false);
}

/** Move one account from one kind to the other. Returns false if the card was declined. */
function mail_change_tier(array $user, string $from, string $to): bool
{
    $sub = mail_subscription($user);
    if (!$sub) {
        throw new RuntimeException('Add a card for your email accounts first.');
    }
    $used = mail_used((int) $user['id']);
    $upgrade = mail_tier($to)['cents'] > mail_tier($from)['cents'];
    return mail_set_seats($sub, [$from => $used[$from] - 1, $to => $used[$to] + 1], $upgrade);
}

/** When billing of a customer's older accounts begins (a Unix time in the future), or null. */
function mail_billing_trial_end(array $user): ?int
{
    $stmt = db()->prepare('SELECT mail_billing_from FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $from = (string) $stmt->fetchColumn();
    $t = $from !== '' ? strtotime($from . ' UTC') : false;
    return $t && $t > time() + 3600 ? $t : null;
}

/** Stripe told us about an email subscription: remember it on the customer. */
function sync_mail_subscription(\Stripe\Subscription $sub): void
{
    $customerId = is_string($sub->customer) ? $sub->customer : $sub->customer->id;
    $live = in_array($sub->status, ['active', 'trialing', 'past_due'], true);
    if ($live) {
        db()->prepare('UPDATE users SET mail_subscription_id = ?, mail_subscription_status = ? WHERE stripe_customer_id = ?')
            ->execute([$sub->id, $sub->status, $customerId]);
        // Older accounts on a customer who just added a card are now paid for.
        $stmt = db()->prepare('SELECT id, mail_billing_from FROM users WHERE stripe_customer_id = ?');
        $stmt->execute([$customerId]);
        $row = $stmt->fetch();
        if ($row && $row['mail_billing_from']) {
            mail_mark_old_accounts_billed((int) $row['id'], $sub);
        }
    } else {
        db()->prepare('UPDATE users SET mail_subscription_status = ? WHERE stripe_customer_id = ? AND mail_subscription_id = ?')
            ->execute([$sub->status, $customerId, $sub->id]);
    }
}

/** Accounts made before email was billed become billed once the subscription covers them. */
function mail_mark_old_accounts_billed(int $userId, \Stripe\Subscription $sub): void
{
    $seats = mail_seats($sub);
    foreach (mail_tiers() as $tier => $_) {
        $room = ($seats[$tier]['qty'] ?? 0) - mail_used($userId)[$tier];
        if ($room > 0) {
            db()->prepare("UPDATE mail_accounts SET billed = 1 WHERE id IN
                (SELECT id FROM mail_accounts WHERE user_id = ? AND billed = 0 AND tier = ? ORDER BY id LIMIT ?)")
                ->execute([$userId, $tier, $room]);
        }
    }
}

/** Customers with accounts made before email was billed: user id => counts by tier. */
function mail_unbilled_customers(): array
{
    $out = [];
    foreach (db()->query('SELECT user_id, tier, COUNT(*) n FROM mail_accounts WHERE billed = 0 GROUP BY user_id, tier') as $r) {
        $out[(int) $r['user_id']][$r['tier']] = (int) $r['n'];
    }
    return $out;
}

/**
 * Start billing a customer's older (free) email accounts, with notice: the
 * first charge is on $startsAt. If Stripe has a card for them, the subscription
 * is created now with a free period until then; otherwise they're asked to add
 * a card from the Email page. Either way they get an email. Returns a note.
 */
function mail_start_billing_old_accounts(int $userId, int $startsAt): string
{
    $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    $counts = mail_unbilled_customers()[$userId] ?? [];
    if (!$user || !$counts) {
        return 'nothing to bill';
    }
    db()->prepare('UPDATE users SET mail_billing_from = ? WHERE id = ?')->execute([gmdate('Y-m-d H:i:s', $startsAt), $userId]);
    $lines = [];
    $monthly = 0;
    foreach ($counts as $tier => $n) {
        $lines[] = "$n " . mail_tier($tier)['name'] . ' account' . ($n > 1 ? 's' : '') . ' at ' . mail_tier_price($tier) . ' each';
        $monthly += $n * (int) mail_tier($tier)['cents'];
    }
    $date = gmdate('F j, Y', $startsAt);
    $card = null;
    if ($user['stripe_customer_id']) {
        $customer = stripe()->customers->retrieve((string) $user['stripe_customer_id']);
        $card = $customer->invoice_settings->default_payment_method ?? null;
        if (!$card && $user['stripe_subscription_id']) {
            $card = stripe()->subscriptions->retrieve((string) $user['stripe_subscription_id'])->default_payment_method ?? null;
        }
    }
    $sub = mail_subscription($user);
    if ($sub) {
        $used = mail_used($userId);
        $want = [];
        foreach ($counts as $tier => $n) {
            $want[$tier] = $used[$tier] + $n;
        }
        mail_set_seats($sub, $want, false);
        mail_mark_old_accounts_billed($userId, stripe()->subscriptions->retrieve($sub->id));
        $how = 'They\'ll be added to your existing email bill.';
        $note = 'added to their email subscription';
    } elseif ($card) {
        $items = [];
        foreach ($counts as $tier => $n) {
            $items[] = ['price' => mail_price_id($tier), 'quantity' => $n];
        }
        $new = stripe()->subscriptions->create([
            'customer' => (string) $user['stripe_customer_id'],
            'items' => $items,
            'trial_end' => $startsAt,
            'default_payment_method' => is_string($card) ? $card : $card->id,
            'metadata' => ['rc_kind' => 'mail', 'rowan_copy_user_id' => (string) $userId],
        ]);
        sync_mail_subscription($new);
        $how = "We'll charge the card you already use with Rowan Copy, starting $date. Nothing is charged before then.";
        $note = "subscription created, first charge $date";
    } else {
        $how = "Please add a card on your Email page before $date: " . base_url('email.php') . "\nNothing is charged before $date.";
        $note = 'asked to add a card';
    }
    send_email((string) $user['email'], 'Your Rowan Copy email accounts: billing starts ' . $date,
        "Hi {$user['name']},\n\nEmail accounts on your own domain now cost a small monthly fee, the same for every customer. "
        . "From $date your email accounts will be billed:\n\n- " . implode("\n- ", $lines)
        . "\n\nTotal: $" . number_format($monthly / 100, 2) . " a month.\n\n$how\n\n"
        . "Don't need an account any more? Delete it on your Email page before $date and you won't be charged for it. "
        . "Questions? Just reply to this email.\n\n- Rowan Copy\n");
    return $note;
}
