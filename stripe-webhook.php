<?php
// ============================================================================
// Stripe webhook: Stripe calls this URL when a subscription starts, changes,
// renews, fails to pay, or is cancelled. Set it up in the Stripe Dashboard ->
// Developers -> Webhooks with the events listed in the README.
// ============================================================================

require __DIR__ . '/lib/bootstrap.php';

$secret = (string) (cfg('stripe')['webhook_secret'] ?? '');
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || $secret === '') {
    http_response_code(404);
    exit;
}

$payload = (string) file_get_contents('php://input');
try {
    // Proves the request really came from Stripe; rejects anything forged or replayed.
    $event = \Stripe\Webhook::constructEvent($payload, (string) ($_SERVER['HTTP_STRIPE_SIGNATURE'] ?? ''), $secret);
} catch (\Throwable $e) {
    http_response_code(400);
    exit('Invalid signature');
}

// Stripe can deliver the same event more than once; handle each one only once.
$seen = db()->prepare('INSERT OR IGNORE INTO stripe_events (id) VALUES (?)');
$seen->execute([$event->id]);
if ($seen->rowCount() === 0) {
    http_response_code(200);
    exit('Already processed');
}

try {
    $obj = $event->data->object;
    switch ($event->type) {
        case 'checkout.session.completed':
            if (($obj->metadata['rc_kind'] ?? '') === 'domain') {
                fulfill_domain_order((int) $obj->metadata['domain_order_id'], $obj->subscription ? (string) $obj->subscription : null);
                break;
            }
            if ($obj->mode === 'subscription' && $obj->subscription) {
                // Make sure the Stripe customer is linked to the right account.
                $uid = (int) $obj->client_reference_id;
                if ($uid > 0) {
                    db()->prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ? AND (stripe_customer_id IS NULL OR stripe_customer_id = ?)')
                        ->execute([$obj->customer, $uid, $obj->customer]);
                }
                sync_subscription(stripe()->subscriptions->retrieve((string) $obj->subscription));
            }
            break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
            // Re-read from Stripe so an out-of-order delivery can't apply stale data.
            try {
                $sub = stripe()->subscriptions->retrieve((string) $obj->id);
            } catch (\Stripe\Exception\InvalidRequestException $e) {
                $sub = $obj;
            }
            sync_subscription($sub);
            break;

        case 'invoice.paid':
            // Yearly domain renewals: renew at Name.com once the customer's payment is in.
            $subId = (string) ($obj->subscription ?? ($obj->parent->subscription_details->subscription ?? ''));
            if ($subId !== '' && ($obj->billing_reason ?? '') === 'subscription_cycle') {
                renew_domain_for_subscription($subId);
            }
            // A referred customer's first real payment earns their referrer a free month.
            reward_referral_for_payment((string) $obj->customer, (int) $obj->amount_paid);
            break;

        case 'invoice.payment_failed':
            $stmt = db()->prepare('SELECT id, name, email FROM users WHERE stripe_customer_id = ?');
            $stmt->execute([(string) $obj->customer]);
            if ($u = $stmt->fetch()) {
                send_email($u['email'], 'Your Rowan Copy payment didn\'t go through',
                    "Hi {$u['name']},\n\nWe couldn't charge your card for your Rowan Copy plan. Please update your payment details here:\n\n"
                    . base_url('billing.php') . "\n\nStripe will try again automatically over the next few days.\n\n- Rowan Copy\n");
            }
            break;
    }
} catch (\Throwable $e) {
    // Let Stripe retry later: forget we saw it and answer with an error.
    db()->prepare('DELETE FROM stripe_events WHERE id = ?')->execute([$event->id]);
    error_log('Rowan Copy Stripe webhook failed: ' . $e->getMessage());
    http_response_code(500);
    exit('Error');
}

http_response_code(200);
echo 'OK';
