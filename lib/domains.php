<?php
// ============================================================================
// ROWAN COPY: DOMAIN ORDERS AND CONNECTIONS
//  - Customers buy domains (Name.com, billed yearly through Stripe).
//  - After payment the domain is registered, pointed at this server, created
//    in Plesk (website + email) and connected to the customer's site.
//  - Each renewal payment renews the domain at Name.com for another year.
//  - Customers who already own a domain can connect it with one click once
//    their DNS points here (a Plesk domain alias).
// ============================================================================

declare(strict_types=1);

function domain_order(int $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM domain_orders WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}

function user_domain_orders(int $userId): array
{
    $stmt = db()->prepare("SELECT d.*, s.name AS site_name FROM domain_orders d LEFT JOIN sites s ON s.id = d.site_id
        WHERE d.user_id = ? AND d.status NOT IN ('pending') ORDER BY d.id DESC");
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
}

function set_order(int $id, array $fields): void
{
    $sets = implode(', ', array_map(fn ($k) => "$k = ?", array_keys($fields)));
    db()->prepare("UPDATE domain_orders SET $sets, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        ->execute([...array_values($fields), $id]);
}

/** Start Stripe Checkout for a yearly domain subscription. Returns the Checkout URL. */
function start_domain_checkout(array $user, string $domain, ?int $siteId, array $contact): string
{
    // Re-check price and availability on the server; never trust the page.
    $result = registrar_check([$domain])[0] ?? null;
    if (!$result || !$result['available'] || $result['domain'] !== $domain) {
        throw new RegistrarError("$domain isn't available any more. Try another name.");
    }
    $s = registrar_settings();
    db()->prepare("INSERT INTO domain_orders (user_id, domain, site_id, wholesale, price_cents, contact, status)
                   VALUES (?, ?, ?, ?, ?, ?, 'pending')")
        ->execute([$user['id'], $domain, $siteId, max($result['wholesale'], $result['renewal']), $result['price_cents'],
            json_encode($contact)]);
    $orderId = (int) db()->lastInsertId();

    $product = ['name' => 'Domain: ' . $domain, 'description' => 'Registration and yearly renewal, managed by Rowan Copy'];
    if ($s['tax_code'] !== '') {
        $product['tax_code'] = $s['tax_code'];
    }
    $params = [
        'mode' => 'subscription',
        'customer' => stripe_customer_id($user),
        'client_reference_id' => (string) $user['id'],
        'line_items' => [[
            'quantity' => 1,
            'price_data' => [
                'currency' => $s['currency'],
                'unit_amount' => $result['price_cents'],
                'recurring' => ['interval' => 'year'],
                'product_data' => $product,
            ],
        ]],
        'metadata' => ['rc_kind' => 'domain', 'domain_order_id' => (string) $orderId],
        'subscription_data' => ['metadata' => ['rc_kind' => 'domain', 'domain_order_id' => (string) $orderId, 'domain' => $domain]],
        'success_url' => base_url('domains.php?paid=' . $orderId . '&session={CHECKOUT_SESSION_ID}'),
        'cancel_url' => base_url('domains.php?q=' . rawurlencode($domain)),
    ];
    // Without a tax code, Stripe's Managed Payments can't take this sale, so it's handled as a normal payment.
    if ($s['tax_code'] === '') {
        $params['managed_payments'] = ['enabled' => false];
    }
    $session = stripe()->checkout->sessions->create($params);
    set_order($orderId, ['stripe_session_id' => $session->id]);
    return (string) $session->url;
}

/**
 * The customer paid: register, point DNS, create in Plesk, connect to their site.
 * Safe to call more than once (from the webhook and from the success page).
 */
function fulfill_domain_order(int $orderId, ?string $subscriptionId = null): void
{
    if ($subscriptionId) {
        db()->prepare("UPDATE domain_orders SET stripe_subscription_id = ? WHERE id = ? AND stripe_subscription_id IS NULL")
            ->execute([$subscriptionId, $orderId]);
    }
    // Only one request gets to register the domain.
    $claim = db()->prepare("UPDATE domain_orders SET status = 'registering', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('pending', 'paid')");
    $claim->execute([$orderId]);
    if ($claim->rowCount() === 0) {
        return;
    }
    $order = domain_order($orderId);
    $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$order['user_id']]);
    $user = $stmt->fetch();

    try {
        $registered = registrar_register($order['domain'], (array) json_decode($order['contact'], true), (float) $order['wholesale']);
        $expires = isset($registered['expireDate']) ? gmdate('Y-m-d H:i:s', strtotime((string) $registered['expireDate'])) : gmdate('Y-m-d H:i:s', strtotime('+1 year'));
        set_order($orderId, ['status' => 'registered', 'expires_at' => $expires, 'error' => null]);
    } catch (Throwable $e) {
        set_order($orderId, ['status' => 'failed', 'error' => $e->getMessage()]);
        notify_domain_problem($order, $user, $e->getMessage(), true);
        return;
    }
    // Registered. The rest is setup; a failure here is retried from Admin.
    finish_domain_setup($orderId);
}

/** DNS, Plesk and site connection for a registered domain. Re-runnable. */
function finish_domain_setup(int $orderId): void
{
    $order = domain_order($orderId);
    if (!$order || !in_array($order['status'], ['registered', 'setup_failed', 'active'], true)) {
        return;
    }
    $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$order['user_id']]);
    $user = $stmt->fetch();
    $domain = $order['domain'];
    try {
        registrar_point_to_server($domain);
        plesk_add_hosted_domain($domain);
        // Let the customer manage its email accounts and DNS in their portal.
        $siteIdPlesk = plesk_find_domain($domain);
        if ($siteIdPlesk) {
            db()->prepare('INSERT INTO hosting_domains (user_id, domain, plesk_site_id) VALUES (?, ?, ?)
                ON CONFLICT(domain) DO UPDATE SET user_id = excluded.user_id, plesk_site_id = excluded.plesk_site_id')
                ->execute([$user['id'], $domain, $siteIdPlesk]);
        }
        // Show their website on it.
        if ($order['site_id']) {
            db()->prepare('UPDATE sites SET custom_domain = ?, domain_connected_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
                ->execute([$domain, $order['site_id'], $user['id']]);
        }
        set_order($orderId, ['status' => 'active', 'error' => null]);
        send_email($user['email'], "$domain is yours",
            "Hi {$user['name']},\n\nYour new domain $domain is registered and being set up. Over the next hour or so it will start showing your website"
            . ($order['site_id'] ? '' : ' (connect it to a website from the editor\'s Settings)') . ", with a secure https certificate shortly after.\n\n"
            . "You can create email addresses like you@$domain from your portal: " . base_url('dashboard.php') . "\n\n"
            . 'It renews automatically every year; you can turn that off any time on the Domains page: ' . base_url('domains.php') . "\n\n- Rowan Copy\n");
    } catch (Throwable $e) {
        set_order($orderId, ['status' => 'setup_failed', 'error' => $e->getMessage()]);
        notify_domain_problem($order, $user, $e->getMessage(), false);
    }
}

function notify_domain_problem(array $order, ?array $user, string $reason, bool $registrationFailed): void
{
    $admins = array_filter(array_merge((array) cfg('admin_emails', []), [(string) cfg('contact_email', '')]));
    foreach (array_unique($admins) as $to) {
        send_email($to, ($registrationFailed ? 'Domain registration failed: ' : 'Domain setup needs attention: ') . $order['domain'],
            "Order #{$order['id']} for {$order['domain']} (customer " . ($user['email'] ?? '?') . ").\n\nReason: $reason\n\n"
            . ($registrationFailed
                ? "The customer has paid but the domain was NOT registered. Retry from Admin → Domains, or refund them in Stripe and cancel the subscription.\n"
                : "The domain IS registered. Fix the issue, then click Retry setup on Admin → Domains.\n")
            . base_url('admin-domains.php') . "\n");
    }
    if ($user && $registrationFailed) {
        send_email($user['email'], "We're finishing your order for {$order['domain']}",
            "Hi {$user['name']},\n\nThanks for your order. We hit a snag registering {$order['domain']} and our team has been notified. "
            . "We'll sort it out or refund you in full, and get back to you within one business day.\n\n- Rowan Copy\n");
    }
}

/** A renewal payment went through: renew the domain for another year. */
function renew_domain_for_subscription(string $subscriptionId): void
{
    $stmt = db()->prepare("SELECT * FROM domain_orders WHERE stripe_subscription_id = ? AND status IN ('active', 'registered', 'setup_failed')");
    $stmt->execute([$subscriptionId]);
    $order = $stmt->fetch();
    if (!$order) {
        return;
    }
    $check = registrar_check([$order['domain']]);
    $limit = max((float) $order['wholesale'], (float) ($check[0]['renewal'] ?? 0)) + 0.01;
    $limit = min($limit, (float) $order['wholesale'] * 1.5); // don't renew at a surprise price
    try {
        $json = registrar_renew($order['domain'], $limit);
        $exp = $json['domain']['expireDate'] ?? null;
        set_order((int) $order['id'], ['expires_at' => $exp ? gmdate('Y-m-d H:i:s', strtotime((string) $exp)) : gmdate('Y-m-d H:i:s', strtotime(($order['expires_at'] ?: 'now') . ' +1 year')), 'error' => null]);
    } catch (Throwable $e) {
        set_order((int) $order['id'], ['error' => 'Renewal failed: ' . $e->getMessage()]);
        $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$order['user_id']]);
        notify_domain_problem($order, $stmt->fetch() ?: null, 'The customer paid for renewal but Name.com renewal failed: ' . $e->getMessage(), false);
    }
}

/** Keep the order in step with its Stripe subscription (auto-renew on/off, cancelled). */
function sync_domain_subscription(\Stripe\Subscription $sub): void
{
    $orderId = (int) ($sub->metadata['domain_order_id'] ?? 0);
    if (!$orderId) {
        return;
    }
    db()->prepare('UPDATE domain_orders SET stripe_subscription_id = COALESCE(stripe_subscription_id, ?), autorenew = ? WHERE id = ?')
        ->execute([$sub->id, $sub->cancel_at_period_end || $sub->status === 'canceled' ? 0 : 1, $orderId]);
    if ($sub->status === 'canceled') {
        db()->prepare("UPDATE domain_orders SET status = 'expiring' WHERE id = ? AND status IN ('active', 'registered')")->execute([$orderId]);
    }
}

// ---------------------------------------------------------------------------
// Customers' own domains (bought elsewhere): connect with one click
// ---------------------------------------------------------------------------

/**
 * Check DNS and create the Plesk alias for a site's custom domain.
 * @return array{ok:bool, message:string}
 */
function connect_custom_domain(array $site): array
{
    $domain = (string) $site['custom_domain'];
    if ($domain === '') {
        return ['ok' => false, 'message' => 'Add a domain first.'];
    }
    $dns = domain_points_here($domain);
    if (!$dns['ok']) {
        $now = $dns['root'] ? 'It currently points to ' . implode(', ', $dns['root']) . '.' : 'It doesn\'t point anywhere yet.';
        return ['ok' => false, 'message' => "$domain doesn't point to our server yet. $now Set an A record for @ and www to "
            . cfg('server_ip') . '. DNS changes can take up to a few hours.'];
    }
    // Domains bought through Rowan Copy are already set up in Plesk as their own domain.
    $bought = db()->prepare("SELECT 1 FROM domain_orders WHERE domain = ? AND status IN ('active', 'registered')");
    $bought->execute([$domain]);
    if (!$bought->fetchColumn()) {
        plesk_add_site_alias($domain);
    }
    db()->prepare('UPDATE sites SET domain_connected_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$site['id']]);
    return ['ok' => true, 'message' => "$domain is connected. The secure (https) certificate usually follows within the hour."];
}

function disconnect_custom_domain(array $site): void
{
    $domain = (string) $site['custom_domain'];
    if ($domain !== '' && $site['domain_connected_at']) {
        $bought = db()->prepare("SELECT 1 FROM domain_orders WHERE domain = ? AND status IN ('active', 'registered')");
        $bought->execute([$domain]);
        if (!$bought->fetchColumn()) {
            try {
                plesk_remove_site_alias($domain);
            } catch (PleskError $e) {
                error_log('Rowan Copy: could not remove alias ' . $domain . ': ' . $e->getMessage());
            }
        }
    }
    db()->prepare('UPDATE sites SET domain_connected_at = NULL WHERE id = ?')->execute([$site['id']]);
}
