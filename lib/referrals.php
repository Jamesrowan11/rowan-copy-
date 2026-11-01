<?php
// ============================================================================
// ROWAN COPY: REFERRAL PROGRAM
// "Give a friend a free month, get one free."
//  - Every customer has a link: https://rowancopy.com/r/CODE
//  - A friend who signs up through it gets a free trial (default 30 days) on
//    their first paid plan.
//  - When that friend makes their first real payment, the referrer gets one
//    month of their plan as credit on their Stripe balance, which Stripe uses
//    up automatically on their next bills.
// Settings: 'referrals' in config.php.
// ============================================================================

declare(strict_types=1);

function referral_settings(): array
{
    return (array) cfg('referrals', []) + ['enabled' => true, 'friend_trial_days' => 30, 'max_rewards_per_year' => 12];
}

function referrals_enabled(): bool
{
    return (bool) referral_settings()['enabled'];
}

/** The user's referral code, created the first time it's needed. */
function referral_code(array $user): string
{
    $stmt = db()->prepare('SELECT referral_code FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $code = (string) $stmt->fetchColumn();
    if ($code !== '') {
        return $code;
    }
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I mix-ups
    for ($try = 0; $try < 10; $try++) {
        $code = '';
        for ($i = 0; $i < 8; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        try {
            db()->prepare('UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL')->execute([$code, $user['id']]);
            return referral_code($user);
        } catch (PDOException $e) {
            // Code already taken by someone else; try another.
        }
    }
    throw new RuntimeException('Could not create a referral code.');
}

function referral_link(array $user): string
{
    return base_url('r/' . referral_code($user));
}

function referrer_by_code(string $code): ?array
{
    if (!preg_match('/^[A-Za-z0-9]{4,16}$/', $code)) {
        return null;
    }
    $stmt = db()->prepare('SELECT id, name, email FROM users WHERE referral_code = ? AND suspended = 0');
    $stmt->execute([strtoupper($code)]);
    return $stmt->fetch() ?: null;
}

/** The referral code a visitor arrived with (from the form or the 30-day cookie). */
function incoming_referral_code(): string
{
    $code = (string) ($_POST['ref'] ?? $_GET['ref'] ?? $_COOKIE['rc_ref'] ?? '');
    return preg_match('/^[A-Za-z0-9]{4,16}$/', $code) ? strtoupper($code) : '';
}

/** Record that a brand-new account came from a referral link. */
function record_referral(int $newUserId, string $newEmail, string $code): void
{
    if (!referrals_enabled() || $code === '') {
        return;
    }
    $referrer = referrer_by_code($code);
    if (!$referrer || (int) $referrer['id'] === $newUserId || strcasecmp($referrer['email'], $newEmail) === 0) {
        return;
    }
    db()->prepare("INSERT OR IGNORE INTO referrals (referrer_id, referred_id, status) VALUES (?, ?, 'signed_up')")
        ->execute([$referrer['id'], $newUserId]);
    setcookie('rc_ref', '', ['expires' => time() - 3600, 'path' => '/']);

    $friend = strtok((string) db()->query('SELECT name FROM users WHERE id = ' . $newUserId)->fetchColumn(), ' ');
    send_email($referrer['email'], 'Someone joined Rowan Copy with your link',
        "Hi {$referrer['name']},\n\n{$friend} just signed up with your referral link. When they start a paid plan and make their first payment, "
        . "you'll get a free month of your plan as credit.\n\nTrack your referrals: " . base_url('referrals.php') . "\n\n- Rowan Copy\n");
}

/** Free-trial days for this user's first paid plan (0 if they weren't referred or already subscribed before). */
function referral_trial_days(array $user): int
{
    if (!referrals_enabled()) {
        return 0;
    }
    $stmt = db()->prepare("SELECT 1 FROM referrals r JOIN users u ON u.id = r.referred_id
        WHERE r.referred_id = ? AND r.status = 'signed_up' AND u.stripe_subscription_id IS NULL");
    $stmt->execute([$user['id']]);
    return $stmt->fetchColumn() ? max(0, (int) referral_settings()['friend_trial_days']) : 0;
}

/**
 * Called from the Stripe webhook when an invoice is paid. On a referred customer's
 * first real payment, credit the referrer one month of their plan.
 */
function reward_referral_for_payment(string $customerId, int $amountPaid): void
{
    if (!referrals_enabled() || $amountPaid <= 0) {
        return;
    }
    $stmt = db()->prepare("SELECT r.id, r.referrer_id, u.name AS friend_name FROM referrals r JOIN users u ON u.id = r.referred_id
        WHERE u.stripe_customer_id = ? AND r.status = 'signed_up'");
    $stmt->execute([$customerId]);
    $ref = $stmt->fetch();
    if (!$ref) {
        return;
    }
    $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$ref['referrer_id']]);
    $referrer = $stmt->fetch();
    if (!$referrer || $referrer['suspended']) {
        return;
    }

    // Abuse limit: a set number of rewards per referrer per year.
    $count = db()->prepare("SELECT COUNT(*) FROM referrals WHERE referrer_id = ? AND status = 'rewarded' AND rewarded_at >= datetime('now', '-365 days')");
    $count->execute([$referrer['id']]);
    if ((int) $count->fetchColumn() >= (int) referral_settings()['max_rewards_per_year']) {
        db()->prepare("UPDATE referrals SET status = 'capped' WHERE id = ?")->execute([$ref['id']]);
        return;
    }

    // One month of the referrer's plan; Starter's price if they're on Free.
    $planKey = plan_key($referrer) === 'free' ? 'starter' : plan_key($referrer);
    $priceId = (string) (plans()[$planKey]['stripe_price'] ?? '');
    if ($priceId === '') {
        return;
    }
    $price = stripe()->prices->retrieve($priceId);
    $cents = (int) $price->unit_amount;
    if ($cents <= 0) {
        return;
    }

    // Mark first so a retried webhook can never pay out twice.
    $mark = db()->prepare("UPDATE referrals SET status = 'rewarded', reward_cents = ?, rewarded_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'signed_up'");
    $mark->execute([$cents, $ref['id']]);
    if ($mark->rowCount() === 0) {
        return;
    }
    try {
        stripe()->customers->createBalanceTransaction(stripe_customer_id($referrer), [
            'amount' => -$cents, // negative = credit toward future invoices
            'currency' => (string) $price->currency,
            'description' => 'Referral reward: ' . strtok((string) $ref['friend_name'], ' ') . ' joined Rowan Copy',
        ]);
    } catch (\Throwable $e) {
        db()->prepare("UPDATE referrals SET status = 'signed_up', reward_cents = 0, rewarded_at = NULL WHERE id = ?")->execute([$ref['id']]);
        throw $e;
    }

    $amount = '$' . number_format($cents / 100, 2);
    send_email($referrer['email'], "You earned a free month ($amount credit)",
        "Hi {$referrer['name']},\n\n" . strtok((string) $ref['friend_name'], ' ') . " became a paying Rowan Copy customer, so we've added $amount of credit to your account. "
        . "It's applied automatically to your next bill" . (plan_key($referrer) === 'free' ? ' when you start a paid plan' : '') . ".\n\n"
        . 'Thanks for spreading the word! Share your link again: ' . referral_link($referrer) . "\n\n- Rowan Copy\n");
}
