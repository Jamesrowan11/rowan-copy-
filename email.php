<?php
// Customers: email on their own domains (Zoho Mail), managed here.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();
$uid = (int) $user['id'];

/** The customer's own mail domain row, or null. */
function own_mail_domain(int $uid, int $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM mail_domains WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $uid]);
    return $stmt->fetch() ?: null;
}

function mailbox_password(string $pw): string
{
    if (strlen($pw) < 10 || !preg_match('/[A-Za-z]/', $pw) || !preg_match('/\d/', $pw)) {
        throw new RuntimeException('Use a password of at least 10 characters with letters and numbers.');
    }
    return $pw;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && zoho_mail_enabled()) {
    require_csrf();
    $action = (string) ($_POST['action'] ?? '');
    try {
        if (!throttle('email:' . $uid, 30, 600)) {
            throw new RuntimeException('Too many changes at once. Please wait a few minutes.');
        }
        switch ($action) {
            case 'add_domain':
                $domain = site_host(normalize_domain(post_str('domain', 253)));
                if ($domain === '' || mail_domain_reserved($domain)) {
                    throw new RuntimeException('Enter a domain you own, like mybakery.com.');
                }
                $taken = db()->prepare('SELECT 1 FROM mail_domains WHERE domain = ?');
                $taken->execute([$domain]);
                if ($taken->fetchColumn()) {
                    throw new RuntimeException('That domain already has email set up with Rowan Copy. Contact support if it\'s yours.');
                }
                if (count(user_mail_domains($uid)) >= 5) {
                    throw new RuntimeException('You can set up email on up to 5 domains.');
                }
                $code = zmail_add_domain($domain);
                db()->prepare('INSERT INTO mail_domains (user_id, domain, verify_code) VALUES (?, ?, ?)')->execute([$uid, $domain, $code]);
                $auto = false;
                try {
                    $auto = mail_domain_autodns($domain, zoho_mail_dns_records($code));
                } catch (Throwable $e) {
                    error_log("Rowan Copy: auto DNS for $domain: " . $e->getMessage());
                }
                flash($auto
                    ? "$domain added and its DNS set up for you. It can take up to an hour to verify; click Check DNS later."
                    : "$domain added. Add the DNS records below where your domain's DNS is managed, then click Check DNS.");
                break;

            case 'check':
                $md = own_mail_domain($uid, (int) ($_POST['domain_id'] ?? 0));
                if ($md) {
                    $md = mail_domain_refresh($md);
                    flash($md['verified'] ? "$md[domain] is verified" . ($md['mx_ok'] ? ' and receiving email.' : '. Now add the MX records so email arrives.') : "We couldn't verify $md[domain] yet. DNS changes can take up to an hour.", $md['verified'] ? 'ok' : 'err');
                }
                break;

            case 'create':
                $md = own_mail_domain($uid, (int) ($_POST['domain_id'] ?? 0));
                if (!$md || !$md['verified']) {
                    throw new RuntimeException('Verify the domain before creating email accounts.');
                }
                if (!stripe_enabled()) {
                    throw new RuntimeException('New email accounts aren\'t available right now. Please try again later.');
                }
                if (count_user_mailboxes($uid) >= MAX_MAIL_ACCOUNTS) {
                    throw new RuntimeException('You can have up to ' . MAX_MAIL_ACCOUNTS . ' email accounts. Contact support if you need more.');
                }
                $tier = (string) ($_POST['tier'] ?? 'lite');
                mail_tier($tier);
                $local = strtolower(post_str('local', 64));
                if (!preg_match('/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/', $local)) {
                    throw new RuntimeException('Use only letters, numbers, dots, dashes and underscores before the @.');
                }
                $email = $local . '@' . $md['domain'];
                $name = post_str('name', 100);
                $password = mailbox_password((string) ($_POST['password'] ?? ''));
                $taken = db()->prepare('SELECT 1 FROM mail_accounts WHERE email = ?');
                $taken->execute([$email]);
                if ($taken->fetchColumn()) {
                    throw new RuntimeException("$email already exists.");
                }
                // Pay first. New customers add a card in Stripe Checkout and come back here.
                $checkout = mail_buy_seat($user, $tier, 'email.php');
                if ($checkout !== null) {
                    $_SESSION['mail_pending'] = ['domain_id' => (int) $md['id'], 'local' => $local, 'name' => $name, 'tier' => $tier];
                    header('Location: ' . $checkout, true, 303);
                    exit;
                }
                try {
                    $created = zmail_create_account($email, $password, $name);
                } catch (Throwable $e) {
                    mail_release_seat($user, $tier); // not created, so not charged for it
                    throw $e;
                }
                db()->prepare('INSERT INTO mail_accounts (user_id, mail_domain_id, email, name, zuid, tier, billed) VALUES (?, ?, ?, ?, ?, ?, 1)')
                    ->execute([$uid, $md['id'], $email, $name, $created['zuid'], $tier]);
                unset($_SESSION['mail_pending']);
                flash("$email is ready. Sign in at " . zoho_mail_webmail_url() . ' or in the Zoho Mail app.');
                break;

            case 'tier':
                $stmt = db()->prepare('SELECT * FROM mail_accounts WHERE id = ? AND user_id = ?');
                $stmt->execute([(int) ($_POST['account_id'] ?? 0), $uid]);
                $acct = $stmt->fetch();
                $to = (string) ($_POST['tier'] ?? '');
                mail_tier($to);
                if (!$acct || $acct['tier'] === $to) {
                    break;
                }
                if (!$acct['billed']) {
                    throw new RuntimeException('You can change this account\'s kind once its billing has started.');
                }
                if (!mail_change_tier($user, (string) $acct['tier'], $to)) {
                    throw new RuntimeException('Your card was declined, so nothing changed. Update your card under Billing and try again.');
                }
                db()->prepare('UPDATE mail_accounts SET tier = ? WHERE id = ?')->execute([$to, $acct['id']]);
                flash("$acct[email] is now " . mail_tier($to)['name'] . ' (' . mail_tier($to)['storage'] . '). '
                    . ($to === 'premium' ? 'The extra storage is usually switched on within one business day.' : 'You\'ll get credit for the rest of this month.'));
                break;

            case 'add_card':
                header('Location: ' . mail_checkout_url($user, null, 'email.php'), true, 303);
                exit;

            case 'drop_unused':
                if ($sub = mail_subscription($user)) {
                    mail_set_seats($sub, mail_used($uid), false);
                    flash('Done. You\'re only paying for the email accounts you have, with credit for the rest of this month.');
                }
                break;

            case 'password':
            case 'delete':
                $stmt = db()->prepare('SELECT * FROM mail_accounts WHERE id = ? AND user_id = ?');
                $stmt->execute([(int) ($_POST['account_id'] ?? 0), $uid]);
                $acct = $stmt->fetch();
                if (!$acct) {
                    break;
                }
                if ($action === 'password') {
                    zmail_reset_password((string) $acct['zuid'], mailbox_password((string) ($_POST['password'] ?? '')));
                    flash("Password changed for $acct[email].");
                } else {
                    zmail_delete_account((string) $acct['email']);
                    db()->prepare('DELETE FROM mail_accounts WHERE id = ?')->execute([$acct['id']]);
                    if ($acct['billed']) {
                        mail_release_seat($user, (string) $acct['tier']); // stop billing it, with credit
                    }
                    flash("$acct[email] deleted, including its email. You won't be billed for it any more.");
                }
                break;

            case 'remove_domain':
                $md = own_mail_domain($uid, (int) ($_POST['domain_id'] ?? 0));
                if ($md) {
                    if (mail_domain_accounts((int) $md['id'])) {
                        throw new RuntimeException('Delete the email accounts on this domain first.');
                    }
                    zmail_delete_domain((string) $md['domain']);
                    db()->prepare('DELETE FROM mail_domains WHERE id = ?')->execute([$md['id']]);
                    flash("$md[domain] removed from email.");
                }
                break;
        }
    } catch (ZohoError $e) {
        error_log('Rowan Copy email page: ' . $e->getMessage());
        flash(preg_replace('/^Zoho Mail: /', 'Email provider: ', $e->getMessage()), 'err');
    } catch (Throwable $e) {
        flash($e->getMessage(), 'err');
    }
    redirect('email.php');
}

// Back from Stripe Checkout: record the subscription now instead of waiting for the webhook.
if (isset($_GET['mail_paid']) && stripe_enabled() && preg_match('/^cs_[A-Za-z0-9_]+$/', (string) $_GET['mail_paid'])) {
    try {
        $cs = stripe()->checkout->sessions->retrieve((string) $_GET['mail_paid'], ['expand' => ['subscription']]);
        if ($cs->customer === $user['stripe_customer_id'] && $cs->subscription instanceof \Stripe\Subscription) {
            sync_subscription($cs->subscription);
            flash(!empty($_SESSION['mail_pending'])
                ? 'Card added. Enter a password to finish creating your email account.'
                : 'Card added. Thank you!');
        }
    } catch (\Stripe\Exception\ApiErrorException $e) {
        error_log('Rowan Copy Stripe error: ' . $e->getMessage());
    }
    redirect('email.php');
}

$domains = zoho_mail_enabled() ? user_mail_domains($uid) : [];
$used = zoho_mail_enabled() ? count_user_mailboxes($uid) : 0;
$limit = MAX_MAIL_ACCOUNTS;
$tiers = mail_tiers();
$pending = $_SESSION['mail_pending'] ?? null;
$billedNow = mail_used($uid);
$monthlyCents = 0;
foreach ($billedNow as $t => $n) {
    $monthlyCents += $n * (int) $tiers[$t]['cents'];
}
$unbilled = mail_unbilled_customers()[$uid] ?? [];
$billingFrom = (string) (db()->query('SELECT mail_billing_from FROM users WHERE id = ' . $uid)->fetchColumn() ?: '');
$unusedSeats = 0;
if (stripe_enabled() && $user['mail_subscription_id']) {
    try {
        foreach (mail_seats(mail_subscription($user)) as $t => $seat) {
            $unusedSeats += max(0, $seat['qty'] - ($billedNow[$t] ?? 0));
        }
    } catch (\Stripe\Exception\ApiErrorException $e) {
        error_log('Rowan Copy Stripe error: ' . $e->getMessage());
    }
}
page_header('Email');
$tick = fn (bool $ok, string $label) => '<span class="tag ' . ($ok ? 'tag-ok' : 'tag-accent') . '">' . ($ok ? icon('check') : '') . h($label) . '</span>';
?>
<div class="pg">
  <div class="pg-head">
    <div><h1>Email</h1><p class="muted">Look professional with email on your own domain, like <strong>you@yourbusiness.com</strong>.</p></div>
    <?php if (zoho_mail_enabled() && $domains): ?>
      <div class="pg-actions"><a class="btn btn-ghost" href="<?= h(zoho_mail_webmail_url()) ?>" target="_blank" rel="noopener"><?= icon('external') ?> Open webmail</a></div>
    <?php endif; ?>
  </div>

  <?php if (!zoho_mail_enabled()): ?>
    <div class="box empty"><span class="empty-icon"><?= icon('mail') ?></span><h2>Coming soon</h2><p class="muted">Email accounts aren't available yet. Please check back soon.</p></div>
  <?php else: ?>
    <section class="box mail-bill">
      <div>
        <span class="kicker">Your email bill</span>
        <strong class="mail-bill-total">$<?= number_format($monthlyCents / 100, 2) ?><span>/month</span></strong>
        <span class="muted small"><?php
          $parts = [];
          foreach ($billedNow as $t => $n) { if ($n) $parts[] = $n . ' × ' . $tiers[$t]['name']; }
          echo h($parts ? implode(' · ', $parts) : 'No paid email accounts yet');
        ?></span>
      </div>
      <div class="mail-tiers">
        <?php foreach ($tiers as $t => $info): ?>
          <div class="mail-tier"><strong><?= h($info['name']) ?></strong><span><?= h(mail_tier_price($t)) ?> · <?= h($info['storage']) ?></span></div>
        <?php endforeach; ?>
      </div>
      <p class="muted small mail-bill-note">Each account is billed monthly. Delete one any time and you get credit for the rest of the month.
        Read your email at <a href="<?= h(zoho_mail_webmail_url()) ?>" target="_blank" rel="noopener"><?= h(parse_url(zoho_mail_webmail_url(), PHP_URL_HOST)) ?></a> or in the free Zoho Mail app.</p>
    </section>

    <?php if ($unbilled): $nOld = array_sum($unbilled); ?>
      <div class="notice">
        <?php if ($billingFrom !== ''): ?>
          <span>Your <?= $nOld ?> existing email account<?= $nOld > 1 ? 's' : '' ?> start<?= $nOld > 1 ? '' : 's' ?> being billed on <strong><?= h(date('F j, Y', strtotime($billingFrom . ' UTC'))) ?></strong>. Add a card before then to keep <?= $nOld > 1 ? 'them' : 'it' ?>; nothing is charged before that date.</span>
          <?php if (!$user['mail_subscription_id'] || !in_array($user['mail_subscription_status'], ['active', 'trialing', 'past_due'], true)): ?>
            <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="add_card"><button class="btn btn-accent btn-sm">Add a card</button></form>
          <?php endif; ?>
        <?php else: ?>
          <span><?= $nOld > 1 ? $nOld . ' of your email accounts were' : 'One of your email accounts was' ?> set up before email was billed and <?= $nOld > 1 ? 'are' : 'is' ?> free for now. We'll email you before that changes.</span>
        <?php endif; ?>
      </div>
    <?php endif; ?>
    <?php if ($unusedSeats > 0): ?>
      <div class="notice">
        <span>You're paying for <?= $unusedSeats ?> email account<?= $unusedSeats > 1 ? 's' : '' ?> you haven't created yet.<?= $pending ? ' Finish creating it below, or stop paying for it.' : '' ?></span>
        <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="drop_unused"><button class="btn btn-ghost btn-sm">Stop paying for <?= $unusedSeats > 1 ? 'them' : 'it' ?></button></form>
      </div>
    <?php endif; ?>

    <?php foreach ($domains as $md): $accounts = mail_domain_accounts((int) $md['id']); $allOk = $md['verified'] && $md['mx_ok'] && $md['spf_ok'] && $md['dkim_ok']; ?>
      <section class="box mail-domain">
        <div class="mail-domain-head">
          <span class="tile"><?= icon('globe') ?></span>
          <div>
            <h2><?= h($md['domain']) ?></h2>
            <div class="tags">
              <?= $tick((bool) $md['verified'], $md['verified'] ? 'Verified' : 'Not verified yet') ?>
              <?php if ($md['verified']): ?>
                <?= $tick((bool) $md['mx_ok'], 'Receiving') ?><?= $tick((bool) $md['spf_ok'], 'SPF') ?><?= $tick((bool) $md['dkim_ok'], 'DKIM') ?>
              <?php endif; ?>
            </div>
          </div>
          <?php if ($md['verified'] && $used < $limit && stripe_enabled()): ?>
            <button type="button" class="btn btn-accent btn-sm" data-dialog-open="new-mail-<?= (int) $md['id'] ?>"><?= icon('plus') ?> Add email account</button>
          <?php endif; ?>
        </div>

        <?php if (!$allOk): ?>
          <details class="dns-box" <?= $md['verified'] ? '' : 'open' ?>>
            <summary>DNS records to add <?= domain_was_bought((string) $md['domain']) ? '(we add these for you)' : 'where your domain\'s DNS is managed' ?></summary>
            <div class="table-scroll"><table class="tbl">
              <thead><tr><th>Type</th><th>Host</th><th>Value</th><th>Priority</th><th>For</th></tr></thead>
              <tbody>
              <?php foreach (zoho_mail_dns_records($md['verified'] ? '' : (string) $md['verify_code'], $md['dkim_selector'], $md['dkim_value']) as $r): ?>
                <tr><td><?= h($r['type']) ?></td><td><code><?= h($r['host']) ?></code></td><td><code class="wrap"><?= h($r['value']) ?></code></td>
                  <td><?= h((string) ($r['priority'] ?? '')) ?></td><td class="muted small"><?= h($r['purpose']) ?></td></tr>
              <?php endforeach; ?>
              </tbody>
            </table></div>
            <p class="muted small">Remove any MX records from your old email provider. DNS changes can take up to an hour.</p>
          </details>
          <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="check"><input type="hidden" name="domain_id" value="<?= (int) $md['id'] ?>">
            <button class="btn btn-sm">Check DNS now</button></form>
        <?php endif; ?>

        <?php if ($md['verified']): ?>
          <?php if (!$accounts): ?>
            <p class="muted small">No email accounts yet. Create one like hello@<?= h($md['domain']) ?>.</p>
          <?php endif; ?>
          <ul class="mailboxes">
          <?php foreach ($accounts as $a): ?>
            <li>
              <span class="avatar" aria-hidden="true"><?= h(strtoupper(substr($a['email'], 0, 1))) ?></span>
              <div class="mailbox-who"><strong><?= h($a['email']) ?></strong><?php if ($a['name']): ?><span class="muted small"><?= h($a['name']) ?></span><?php endif; ?></div>
              <span class="tag <?= $a['tier'] === 'premium' ? 'tag-accent' : '' ?>" title="<?= h($tiers[$a['tier']]['storage'] ?? '') ?>"><?= h($tiers[$a['tier']]['name'] ?? $a['tier']) ?><?= $a['billed'] ? '' : ' · free for now' ?></span>
              <details class="menu menu-down">
                <summary class="btn btn-ghost btn-sm" aria-label="Options for <?= h($a['email']) ?>"><?= icon('more') ?></summary>
                <div class="menu-list menu-pop">
                  <form method="post" class="menu-form"><?= csrf_field() ?><input type="hidden" name="action" value="password"><input type="hidden" name="account_id" value="<?= (int) $a['id'] ?>">
                    <label>New password <input type="password" name="password" minlength="10" required autocomplete="new-password" placeholder="At least 10 characters"></label>
                    <button class="btn btn-sm btn-block">Change password</button></form>
                  <?php if ($a['billed']): $other = $a['tier'] === 'premium' ? 'lite' : 'premium'; ?>
                  <form method="post" data-confirm="<?= h('Switch ' . $a['email'] . ' to ' . $tiers[$other]['name'] . ' (' . $tiers[$other]['storage'] . ', ' . mail_tier_price($other) . ')? ' . ($other === 'premium' ? 'The difference for the rest of this month is charged now.' : 'You get credit for the rest of this month. Make sure the mailbox uses less than ' . $tiers['lite']['storage'] . ' first.')) ?>"><?= csrf_field() ?>
                    <input type="hidden" name="action" value="tier"><input type="hidden" name="account_id" value="<?= (int) $a['id'] ?>"><input type="hidden" name="tier" value="<?= h($other) ?>">
                    <button class="menu-item"><?= $other === 'premium' ? 'Upgrade to ' : 'Switch to ' ?><?= h($tiers[$other]['name']) ?> (<?= h(mail_tier_price($other)) ?>)</button></form>
                  <?php endif; ?>
                  <form method="post" data-confirm="Delete <?= h($a['email']) ?> and all of its email? This can't be undone."><?= csrf_field() ?>
                    <input type="hidden" name="action" value="delete"><input type="hidden" name="account_id" value="<?= (int) $a['id'] ?>">
                    <button class="menu-danger">Delete this account</button></form>
                </div>
              </details>
            </li>
          <?php endforeach; ?>
          </ul>
          <?php if ($used >= $limit): ?>
            <p class="muted small">You have <?= $limit ?> email accounts, the most one customer can have. Contact support if you need more.</p>
          <?php else: $pre = $pending && (int) $pending['domain_id'] === (int) $md['id'] ? $pending : null; ?>
            <dialog class="dlg dlg-wide" id="new-mail-<?= (int) $md['id'] ?>" aria-label="Add an email account"<?= $pre ? ' data-open-on-load' : '' ?>>
              <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="create"><input type="hidden" name="domain_id" value="<?= (int) $md['id'] ?>">
                <h2>Add an email account</h2>
                <fieldset class="tier-pick">
                  <legend>Kind of account</legend>
                  <?php foreach ($tiers as $t => $info): ?>
                    <label class="tier-card">
                      <input type="radio" name="tier" value="<?= h($t) ?>" <?= ($pre['tier'] ?? 'lite') === $t ? 'checked' : '' ?>>
                      <span><strong><?= h($info['name']) ?></strong><span class="tier-price"><?= h(mail_tier_price($t)) ?></span>
                        <span class="muted small"><?= h($info['storage']) ?> of storage<?= $t === 'premium' ? ', for people who keep a lot of email' : ', plenty for most people' ?></span></span>
                    </label>
                  <?php endforeach; ?>
                </fieldset>
                <label>Email address <span class="addr"><input name="local" maxlength="64" required placeholder="hello" value="<?= h($pre['local'] ?? '') ?>"><span>@<?= h($md['domain']) ?></span></span></label>
                <label>Name <input name="name" maxlength="100" placeholder="Jane Smith" value="<?= h($pre['name'] ?? '') ?>"></label>
                <label>Password <input type="password" name="password" minlength="10" required autocomplete="new-password" placeholder="At least 10 characters"></label>
                <p class="muted small"><?= $user['mail_subscription_id'] && in_array($user['mail_subscription_status'], ['active', 'trialing', 'past_due'], true)
                    ? 'Billed monthly to the card on your email bill, starting today.'
                    : 'Next you\'ll add a card with Stripe, then come back here to finish.' ?></p>
                <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-dialog-close>Cancel</button><button class="btn btn-accent">Create account</button></div>
              </form>
            </dialog>
          <?php endif; ?>
        <?php endif; ?>

        <?php if (!$accounts): ?>
          <form method="post" data-confirm="Stop using <?= h($md['domain']) ?> for email?"><?= csrf_field() ?>
            <input type="hidden" name="action" value="remove_domain"><input type="hidden" name="domain_id" value="<?= (int) $md['id'] ?>">
            <button class="link small">Remove this domain</button></form>
        <?php endif; ?>
      </section>
    <?php endforeach; ?>

    <section class="box<?= $domains ? '' : ' hero-box' ?>">
      <h2><?= $domains ? 'Set up email on another domain' : 'Set up email on your domain' ?></h2>
        <form method="post" class="inline-form"><?= csrf_field() ?><input type="hidden" name="action" value="add_domain">
          <label class="sr-only" for="mail-domain">Your domain</label>
          <input id="mail-domain" name="domain" maxlength="253" required placeholder="mybakery.com">
          <button class="btn btn-accent">Set up email</button>
        </form>
        <p class="muted small">Don't have a domain? <a class="link-accent" href="<?= h(base_url('domains.php')) ?>">Get one here</a>, and we'll set up its email records for you.</p>
    </section>
  <?php endif; ?>
</div>
<?php page_footer();
