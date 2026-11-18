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
                if (max_mailboxes($user) === 0) {
                    throw new RuntimeException('Email accounts are included in our paid plans. See the Billing page to upgrade.');
                }
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
                if (count_user_mailboxes($uid) >= max_mailboxes($user)) {
                    throw new RuntimeException('Your plan includes ' . max_mailboxes($user) . ' email accounts. Upgrade on the Billing page for more.');
                }
                $local = strtolower(post_str('local', 64));
                if (!preg_match('/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/', $local)) {
                    throw new RuntimeException('Use only letters, numbers, dots, dashes and underscores before the @.');
                }
                $email = $local . '@' . $md['domain'];
                $name = post_str('name', 100);
                $created = zmail_create_account($email, mailbox_password((string) ($_POST['password'] ?? '')), $name);
                db()->prepare('INSERT INTO mail_accounts (user_id, mail_domain_id, email, name, zuid) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$uid, $md['id'], $email, $name, $created['zuid']]);
                flash("$email is ready. Sign in at " . zoho_mail_webmail_url() . ' or in the Zoho Mail app.');
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
                    flash("$acct[email] deleted, including its email.");
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

$domains = zoho_mail_enabled() ? user_mail_domains($uid) : [];
$used = zoho_mail_enabled() ? count_user_mailboxes($uid) : 0;
$limit = max_mailboxes($user);
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
    <?php if ($limit > 0): ?>
    <section class="box usage-bar">
      <div>
        <strong><?= $used ?> of <?= $limit ?> email account<?= $limit === 1 ? '' : 's' ?> used</strong>
        <div class="meter"><span style="width: <?= min(100, round($used / max(1, $limit) * 100)) ?>%"></span></div>
      </div>
      <p class="muted small">Read your email at <a href="<?= h(zoho_mail_webmail_url()) ?>" target="_blank" rel="noopener"><?= h(parse_url(zoho_mail_webmail_url(), PHP_URL_HOST)) ?></a> or in the free Zoho Mail app.<?php if ($used >= $limit): ?> Need more? <a class="link-accent" href="<?= h(base_url('billing.php')) ?>">Upgrade your plan</a>.<?php endif; ?></p>
    </section>
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
          <?php if ($md['verified'] && $used < $limit): ?>
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
              <details class="menu menu-down">
                <summary class="btn btn-ghost btn-sm" aria-label="Options for <?= h($a['email']) ?>"><?= icon('more') ?></summary>
                <div class="menu-list menu-pop">
                  <form method="post" class="menu-form"><?= csrf_field() ?><input type="hidden" name="action" value="password"><input type="hidden" name="account_id" value="<?= (int) $a['id'] ?>">
                    <label>New password <input type="password" name="password" minlength="10" required autocomplete="new-password" placeholder="At least 10 characters"></label>
                    <button class="btn btn-sm btn-block">Change password</button></form>
                  <form method="post" data-confirm="Delete <?= h($a['email']) ?> and all of its email? This can't be undone."><?= csrf_field() ?>
                    <input type="hidden" name="action" value="delete"><input type="hidden" name="account_id" value="<?= (int) $a['id'] ?>">
                    <button class="menu-danger">Delete this account</button></form>
                </div>
              </details>
            </li>
          <?php endforeach; ?>
          </ul>
          <?php if ($used >= $limit): ?>
            <p class="muted small">You've used all <?= $limit ?> email accounts on your plan. <a class="link-accent" href="<?= h(base_url('billing.php')) ?>">Upgrade</a> for more.</p>
          <?php else: ?>
            <dialog class="dlg" id="new-mail-<?= (int) $md['id'] ?>" aria-label="Add an email account">
              <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="create"><input type="hidden" name="domain_id" value="<?= (int) $md['id'] ?>">
                <h2>Add an email account</h2>
                <label>Email address <span class="addr"><input name="local" maxlength="64" required placeholder="hello"><span>@<?= h($md['domain']) ?></span></span></label>
                <label>Name <input name="name" maxlength="100" placeholder="Jane Smith"></label>
                <label>Password <input type="password" name="password" minlength="10" required autocomplete="new-password" placeholder="At least 10 characters"></label>
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
      <?php if ($limit === 0): ?>
        <p class="muted">Email accounts are included in our paid plans. <a class="link-accent" href="<?= h(base_url('billing.php')) ?>">See plans</a></p>
      <?php else: ?>
        <form method="post" class="inline-form"><?= csrf_field() ?><input type="hidden" name="action" value="add_domain">
          <label class="sr-only" for="mail-domain">Your domain</label>
          <input id="mail-domain" name="domain" maxlength="253" required placeholder="mybakery.com">
          <button class="btn btn-accent">Set up email</button>
        </form>
        <p class="muted small">Don't have a domain? <a class="link-accent" href="<?= h(base_url('domains.php')) ?>">Get one here</a>, and we'll set up its email records for you.</p>
      <?php endif; ?>
    </section>
  <?php endif; ?>
</div>
<?php page_footer();
