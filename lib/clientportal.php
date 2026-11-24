<?php
// ============================================================================
// ROWAN COPY: PORTAL ADD-ON
// A customer can add a Portal to any of their websites ($15/month per website,
// its own Stripe subscription, rc_kind = portal). The business then invites:
//   staff   their employees (team directory, email, schedule, files...)
//   clients their own customers (contact, documents, messages...)
// Portal users are separate from Rowan Copy accounts: they belong to one
// website, sign in at portal.php?s=<slug>, and are invited by email.
// The website's owner can always open their portal while signed in to Rowan Copy.
// ============================================================================

declare(strict_types=1);

const PORTAL_ROLES = ['staff' => 'Staff', 'client' => 'Client'];

/** Price and limits. config.php 'portal' => [...] can change them. */
function portal_settings(): array
{
    return (array) cfg('portal', []) + ['cents' => 1500, 'max_staff' => 10, 'max_clients' => 200];
}

function portal_price_text(): string
{
    $c = (int) portal_settings()['cents'];
    return '$' . ($c % 100 ? number_format($c / 100, 2) : (string) intdiv($c, 100)) . '/month';
}

/** Can this customer buy the Portal? It's an add-on for paid plans. */
function portal_can_buy(array $user): bool
{
    return plan_key($user) !== 'free' || is_staff($user);
}

function portal_live(array $site): bool
{
    return in_array((string) ($site['portal_status'] ?? ''), ['active', 'trialing', 'past_due'], true);
}

function portal_url(array $site, string $query = ''): string
{
    return base_url('portal.php?s=' . rawurlencode((string) $site['slug']) . ($query !== '' ? '&' . $query : ''));
}

/** The Stripe price for the Portal, created in Stripe the first time (found again by lookup key). */
function portal_price_id(): string
{
    $cents = (int) portal_settings()['cents'];
    $lookup = 'rc_portal_' . $cents;
    $cached = kv_get('stripe_price:' . $lookup);
    if ($cached !== '') {
        return $cached;
    }
    $found = stripe()->prices->all(['lookup_keys' => [$lookup], 'active' => true, 'limit' => 1]);
    if (!empty($found->data[0])) {
        $id = (string) $found->data[0]->id;
    } else {
        $product = kv_get('stripe_product:portal');
        if ($product === '') {
            $product = (string) stripe()->products->create([
                'name' => 'Portal add-on (staff and client portal for one website)',
                'metadata' => ['rc_kind' => 'portal'],
            ])->id;
            kv_set('stripe_product:portal', $product);
        }
        $id = (string) stripe()->prices->create([
            'product' => $product, 'currency' => 'usd', 'unit_amount' => $cents,
            'recurring' => ['interval' => 'month'], 'lookup_key' => $lookup,
            'metadata' => ['rc_kind' => 'portal'],
        ])->id;
    }
    kv_set('stripe_price:' . $lookup, $id);
    return $id;
}

/** Stripe Checkout to add the Portal to one website. */
function portal_checkout_url(array $user, array $site): string
{
    $meta = ['rc_kind' => 'portal', 'site_id' => (string) $site['id'], 'rowan_copy_user_id' => (string) $user['id']];
    $session = stripe()->checkout->sessions->create([
        'mode' => 'subscription',
        'customer' => stripe_customer_id($user),
        'client_reference_id' => (string) $user['id'],
        'line_items' => [['price' => portal_price_id(), 'quantity' => 1]],
        'success_url' => base_url('site-portal.php?id=' . $site['id'] . '&paid={CHECKOUT_SESSION_ID}'),
        'cancel_url' => base_url('site-portal.php?id=' . $site['id']),
        'metadata' => $meta,
        'subscription_data' => ['metadata' => $meta, 'description' => 'Portal for ' . $site['name']],
    ]);
    return (string) $session->url;
}

/** Stripe told us about a Portal subscription: update the website. */
function sync_portal_subscription(\Stripe\Subscription $sub): void
{
    $siteId = (int) ($sub->metadata['site_id'] ?? 0);
    $customerId = is_string($sub->customer) ? $sub->customer : $sub->customer->id;
    // Only the website's owner's own subscription counts.
    $stmt = db()->prepare('SELECT s.id, s.portal_subscription_id, s.portal_status FROM sites s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND u.stripe_customer_id = ?');
    $stmt->execute([$siteId, $customerId]);
    $site = $stmt->fetch();
    if (!$site) {
        error_log("Rowan Copy: portal subscription {$sub->id} for unknown site $siteId");
        return;
    }
    $live = in_array($sub->status, ['active', 'trialing', 'past_due'], true);
    if (!$live && $site['portal_subscription_id'] && $site['portal_subscription_id'] !== $sub->id) {
        return; // an old subscription ending doesn't turn off a newer one
    }
    $item = $sub->items->data[0] ?? null;
    $renews = $item->current_period_end ?? ($sub->current_period_end ?? null);
    db()->prepare('UPDATE sites SET portal_subscription_id = ?, portal_status = ?, portal_cancels = ?, portal_renews_at = ? WHERE id = ?')
        ->execute([$sub->id, $sub->status, (int) (bool) $sub->cancel_at_period_end, $renews ? gmdate('Y-m-d H:i:s', (int) $renews) : null, $siteId]);
    if ($live !== in_array((string) $site['portal_status'], ['active', 'trialing', 'past_due'], true)) {
        sync_site_hosting($siteId); // add or remove the Portal link on the live website
    }
}

// ---------------------------------------------------------------------------
// Portal users
// ---------------------------------------------------------------------------

function portal_users(int $siteId, ?string $role = null): array
{
    $sql = 'SELECT * FROM portal_users WHERE site_id = ?' . ($role ? ' AND role = ?' : '') . ' ORDER BY role DESC, name COLLATE NOCASE';
    $stmt = db()->prepare($sql);
    $stmt->execute($role ? [$siteId, $role] : [$siteId]);
    return $stmt->fetchAll();
}

function portal_user(int $siteId, int $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM portal_users WHERE id = ? AND site_id = ?');
    $stmt->execute([$id, $siteId]);
    return $stmt->fetch() ?: null;
}

function portal_role_limit(string $role): int
{
    return (int) portal_settings()[$role === 'staff' ? 'max_staff' : 'max_clients'];
}

/** A one-time link token; only its hash is stored. */
function portal_issue_token(int $userId, string $kind, int $ttl): string
{
    $token = bin2hex(random_bytes(24));
    db()->prepare('UPDATE portal_users SET token_hash = ?, token_kind = ?, token_expires = ? WHERE id = ?')
        ->execute([hash('sha256', $token), $kind, gmdate('Y-m-d H:i:s', time() + $ttl), $userId]);
    return $token;
}

/** The portal user a link token belongs to, if it's valid and not expired. */
function portal_user_by_token(int $siteId, string $token, string $kind): ?array
{
    if (!preg_match('/^[a-f0-9]{48}$/', $token)) {
        return null;
    }
    $stmt = db()->prepare("SELECT * FROM portal_users WHERE site_id = ? AND token_hash = ? AND token_kind = ?
        AND token_expires > datetime('now') AND disabled = 0");
    $stmt->execute([$siteId, hash('sha256', $token), $kind]);
    return $stmt->fetch() ?: null;
}

/** Invite someone (or re-send their invite). Returns the new user's id. */
function portal_invite(array $site, string $name, string $email, string $role, ?array $existing = null): int
{
    if (!isset(PORTAL_ROLES[$role])) {
        throw new RuntimeException('Pick Staff or Client.');
    }
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Enter a valid email address.');
    }
    if ($existing) {
        $id = (int) $existing['id'];
    } else {
        if ($name === '') {
            throw new RuntimeException('Enter their name.');
        }
        $count = db()->prepare('SELECT COUNT(*) FROM portal_users WHERE site_id = ? AND role = ?');
        $count->execute([$site['id'], $role]);
        if ((int) $count->fetchColumn() >= portal_role_limit($role)) {
            throw new RuntimeException('Your Portal includes up to ' . portal_role_limit($role) . ' ' . strtolower(PORTAL_ROLES[$role]) . ' accounts. Contact support if you need more.');
        }
        $dupe = db()->prepare('SELECT 1 FROM portal_users WHERE site_id = ? AND email = ?');
        $dupe->execute([$site['id'], $email]);
        if ($dupe->fetchColumn()) {
            throw new RuntimeException("$email already has an account on this portal.");
        }
        db()->prepare('INSERT INTO portal_users (site_id, role, name, email) VALUES (?, ?, ?, ?)')->execute([$site['id'], $role, $name, $email]);
        $id = (int) db()->lastInsertId();
    }
    $user = portal_user((int) $site['id'], $id);
    $token = portal_issue_token($id, 'invite', 7 * 86400);
    $what = $user['role'] === 'staff' ? 'the staff portal' : 'the client portal';
    send_email($email, "You're invited to {$site['name']}'s portal",
        "Hi {$user['name']},\n\n{$site['name']} has given you access to $what.\n\n"
        . "Set your password here (the link works for 7 days):\n" . portal_url($site, 'a=accept&t=' . $token) . "\n\n"
        . "After that, sign in any time at:\n" . portal_url($site) . "\n\n"
        . "If you weren't expecting this, you can ignore this email.\n");
    return $id;
}

function portal_password_ok(string $pw): string
{
    if (strlen($pw) < 8) {
        throw new RuntimeException('Use a password of at least 8 characters.');
    }
    return $pw;
}

// ---------------------------------------------------------------------------
// Signing in (kept in the PHP session per website, apart from Rowan Copy logins)
// ---------------------------------------------------------------------------

function portal_log_in(array $site, array $pu): void
{
    session_regenerate_id(true);
    $_SESSION['portal'][(int) $site['id']] = ['id' => (int) $pu['id'], 'v' => (int) $pu['session_version']];
    db()->prepare("UPDATE portal_users SET last_login_at = datetime('now') WHERE id = ?")->execute([$pu['id']]);
}

function portal_log_out(array $site): void
{
    unset($_SESSION['portal'][(int) $site['id']]);
}

/**
 * Who is using this portal: a signed-in portal user, or the website's owner
 * (role 'owner', while signed in to Rowan Copy). Null if nobody.
 */
function portal_viewer(array $site): ?array
{
    $s = $_SESSION['portal'][(int) $site['id']] ?? null;
    if ($s) {
        $pu = portal_user((int) $site['id'], (int) $s['id']);
        if ($pu && !$pu['disabled'] && $pu['password_hash'] && (int) $pu['session_version'] === (int) $s['v']) {
            return $pu;
        }
        portal_log_out($site);
    }
    $me = current_user();
    if ($me && (int) $me['id'] === (int) $site['user_id']) {
        return ['id' => 0, 'role' => 'owner', 'name' => $me['name'], 'email' => $me['email']];
    }
    return null;
}

function portal_is_staff(?array $viewer): bool
{
    return $viewer && in_array($viewer['role'], ['staff', 'owner'], true);
}
