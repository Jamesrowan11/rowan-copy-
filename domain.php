<?php
// A customer's hosted domain: email accounts and DNS records, managed in Plesk on their behalf.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();

// Staff can open any domain on the server (domain.php?plesk=<id>) without plan limits.
// Customers can only open domains linked to their own account (domain.php?id=<id>).
$staffMode = isset($_GET['plesk']) && is_staff($user);
if ($staffMode) {
    $siteId = (int) $_GET['plesk'];
    $name = '';
    try {
        $name = plesk_list_domains()[$siteId]['name'] ?? '';
    } catch (PleskError $e) {
        flash($e->getMessage(), 'err');
        redirect('admin-hosting.php');
    }
    if ($name === '') {
        http_response_code(404);
        exit('Domain not found in Plesk.');
    }
    $back = 'domain.php?plesk=' . $siteId;
} else {
    $domain = owned_hosting_domain((int) ($_GET['id'] ?? 0), $user);
    $siteId = (int) $domain['plesk_site_id'];
    $name = $domain['domain'];
    $back = 'domain.php?id=' . $domain['id'];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    if (!throttle('hosting:' . $user['id'], 30, 600)) {
        flash('Too many changes in a short time. Please wait a few minutes.', 'err');
        redirect($back);
    }
    $local = strtolower(post_str('local', 64));
    try {
        switch ($_POST['action'] ?? '') {
            case 'mail_create':
                if (!$staffMode && count_user_mailboxes((int) $user['id']) >= max_mailboxes($user)) {
                    throw new PleskError(max_mailboxes($user) === 0
                        ? 'Email accounts are included in our paid plans. See the Billing page to upgrade.'
                        : 'Your ' . user_plan($user)['name'] . ' plan includes ' . max_mailboxes($user) . ' email account' . (max_mailboxes($user) === 1 ? '' : 's') . '. Upgrade on the Billing page for more.');
                }
                $pw = (string) ($_POST['password'] ?? '');
                if (strlen($pw) < 10) {
                    throw new PleskError('Use a password of at least 10 characters.');
                }
                plesk_create_mailbox($siteId, $local, $pw);
                flash("Created {$local}@{$name}.");
                break;
            case 'mail_password':
                $pw = (string) ($_POST['password'] ?? '');
                if (strlen($pw) < 10) {
                    throw new PleskError('Use a password of at least 10 characters.');
                }
                plesk_set_mailbox_password($siteId, $local, $pw);
                flash("Password changed for {$local}@{$name}.");
                break;
            case 'mail_delete':
                plesk_remove_mailbox($siteId, $local);
                flash("Deleted {$local}@{$name} and all of its email.");
                break;
            case 'dns_add':
            case 'dns_delete':
                if (!$staffMode && !plan_feature($user, 'dns')) {
                    throw new PleskError('Editing DNS records is included in the Business and Pro plans. See the Billing page to upgrade.');
                }
                if ($_POST['action'] === 'dns_delete') {
                    plesk_delete_dns($siteId, (int) ($_POST['record_id'] ?? 0));
                    flash('DNS record deleted.');
                    break;
                }
                plesk_add_dns($siteId, post_str('type', 10), post_str('host', 253), post_str('value', 1024), post_str('priority', 5));
                flash('DNS record added. Changes can take up to an hour to spread across the internet.');
                break;
        }
    } catch (PleskError $e) {
        flash($e->getMessage(), 'err');
    }
    redirect($back . (str_starts_with((string) ($_POST['action'] ?? ''), 'dns') ? '#dns' : ''));
}

$mailboxes = $records = [];
$loadError = '';
$mailUsed = 0;
$canDns = $staffMode || plan_feature($user, 'dns');
try {
    $mailboxes = plesk_list_mailboxes($siteId);
    $records = plesk_list_dns($siteId);
    $mailUsed = $staffMode ? 0 : count_user_mailboxes((int) $user['id']);
} catch (PleskError $e) {
    error_log('Rowan Copy Plesk: ' . $e->getMessage());
    $loadError = 'We couldn\'t load this domain\'s settings right now. Please try again in a few minutes.';
}

page_header($name);
?>
<div class="page">
  <?php if ($staffMode): ?>
    <a class="back" href="<?= h(base_url('admin-hosting.php')) ?>">← Hosting</a>
  <?php else: ?>
    <a class="back" href="<?= h(base_url('dashboard.php')) ?>">← Dashboard</a>
  <?php endif; ?>
  <h1><?= h($name) ?></h1>
  <?php if ($loadError): ?><p class="error"><?= h($loadError) ?></p><?php endif; ?>

  <div class="card">
    <div class="page-head">
      <h2>Email accounts</h2>
      <a class="btn btn-ghost btn-sm" href="https://webmail.<?= h($name) ?>" target="_blank" rel="noopener">Open webmail</a>
    </div>
    <?php if (!$mailboxes && !$loadError): ?><p class="muted">No email accounts yet.</p><?php endif; ?>
    <ul class="mail-list">
      <?php foreach ($mailboxes as $m): ?>
        <li>
          <strong><?= h($m['name']) ?>@<?= h($name) ?></strong>
          <details>
            <summary class="link small">Change password</summary>
            <form method="post" class="inline-form">
              <?= csrf_field() ?><input type="hidden" name="action" value="mail_password"><input type="hidden" name="local" value="<?= h($m['name']) ?>">
              <input type="password" name="password" minlength="10" required placeholder="New password" autocomplete="new-password">
              <button class="btn btn-sm">Save</button>
            </form>
          </details>
          <form method="post" onsubmit="return confirm('Delete <?= h($m['name']) ?>@<?= h($name) ?>? All email in this account is deleted permanently.')">
            <?= csrf_field() ?><input type="hidden" name="action" value="mail_delete"><input type="hidden" name="local" value="<?= h($m['name']) ?>">
            <button class="link small danger-link">Delete</button>
          </form>
        </li>
      <?php endforeach; ?>
    </ul>

    <h3>Add an email account</h3>
    <?php if ($staffMode): ?>
      <p class="muted small usage-note">Staff view: plan limits don't apply here.</p>
    <?php elseif (max_mailboxes($user) === 0): ?>
      <div class="notice small">New email accounts are included in our paid plans. <a href="<?= h(base_url('billing.php')) ?>">See plans</a></div>
    <?php else: ?>
      <p class="muted small usage-note"><?= $mailUsed ?> of <?= max_mailboxes($user) ?> email accounts on your <?= h(user_plan($user)['name']) ?> plan<?= count(user_hosting_domains((int) $user['id'])) > 1 ? ' (across all your domains)' : '' ?>.</p>
    <?php endif; ?>
    <?php if (!$staffMode && max_mailboxes($user) === 0): ?>
    <?php elseif (!$staffMode && $mailUsed >= max_mailboxes($user)): ?>
      <div class="notice small">You've used all the email accounts on your plan. <a href="<?= h(base_url('billing.php')) ?>">Upgrade for more</a>, or delete one you don't need.</div>
    <?php else: ?>
    <form method="post" class="mail-create">
      <?= csrf_field() ?><input type="hidden" name="action" value="mail_create">
      <label>Address <span class="addr"><input name="local" required maxlength="64" pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]*" placeholder="info"><span>@<?= h($name) ?></span></span></label>
      <label>Password <input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
      <button class="btn">Create email account</button>
    </form>
    <?php endif; ?>

    <details class="mail-settings">
      <summary>Settings for phones and email apps (Outlook, Apple Mail…)</summary>
      <dl>
        <dt>Username</dt><dd>Your full email address</dd>
        <dt>Incoming (IMAP)</dt><dd>mail.<?= h($name) ?>, port 993, SSL</dd>
        <dt>Outgoing (SMTP)</dt><dd>mail.<?= h($name) ?>, port 465 (SSL) or 587 (STARTTLS)</dd>
      </dl>
    </details>
  </div>

  <div class="card" id="dns">
    <h2>DNS records</h2>
    <p class="muted small">DNS tells the internet where your website and email live. These changes only take effect if your domain uses our nameservers. Be careful: a wrong record can take your site or email offline.</p>
    <div class="table-wrap"><table class="dns-table">
      <tr><th>Type</th><th>Host</th><th>Value</th><th></th></tr>
      <?php foreach ($records as $r): ?>
        <tr>
          <td><?= h($r['type']) ?></td>
          <td><?= h($r['host']) ?></td>
          <td class="dns-value"><?= h(($r['type'] === 'MX' && $r['opt'] !== '' ? $r['opt'] . ' ' : '') . $r['value']) ?></td>
          <td><?php if ($canDns && in_array($r['type'], DNS_EDITABLE_TYPES, true)): ?>
            <form method="post" onsubmit="return confirm('Delete this <?= h($r['type']) ?> record?')"><?= csrf_field() ?>
              <input type="hidden" name="action" value="dns_delete"><input type="hidden" name="record_id" value="<?= (int) $r['id'] ?>">
              <button class="link small danger-link">Delete</button></form>
          <?php endif; ?></td>
        </tr>
      <?php endforeach; ?>
    </table></div>

    <?php if (!$canDns): ?>
      <div class="notice small">You can view your DNS records here. Editing them is included in the Business and Pro plans. <a href="<?= h(base_url('billing.php')) ?>">See plans</a></div>
    <?php else: ?>
    <h3>Add a record</h3>
    <form method="post" class="dns-add">
      <?= csrf_field() ?><input type="hidden" name="action" value="dns_add">
      <label>Type
        <select name="type"><?php foreach (DNS_EDITABLE_TYPES as $t): ?><option><?= $t ?></option><?php endforeach; ?></select>
      </label>
      <label>Host <input name="host" placeholder="@ or www" maxlength="253"></label>
      <label>Value <input name="value" required maxlength="1024" placeholder="IP address, hostname or text"></label>
      <label>Priority (MX only) <input name="priority" type="number" min="0" max="65535" placeholder="10"></label>
      <button class="btn">Add record</button>
    </form>
    <?php endif; ?>
  </div>
</div>
<?php page_footer();
