<?php
// Admin: outgoing email (ZeptoMail). The token is saved in data_dir/secrets.json,
// outside the app folder, and is never shown again after saving.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_admin();
$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $action = (string) ($_POST['action'] ?? '');
    try {
        if ($action === 'save') {
            $from = strtolower(trim((string) ($_POST['mail_from'] ?? '')));
            $host = strtolower(trim((string) ($_POST['api_host'] ?? 'api.zeptomail.com')));
            $token = trim((string) ($_POST['token'] ?? ''));
            if ($from !== '' && !filter_var($from, FILTER_VALIDATE_EMAIL)) {
                throw new RuntimeException('Enter a valid sender address, like noreply@rowancopy.com.');
            }
            if (!preg_match('/^api\.zeptomail\.[a-z.]+$/', $host)) {
                throw new RuntimeException('The API host looks like api.zeptomail.com (or .eu, .in, .com.au).');
            }
            if ($token !== '' && !preg_match('/^[A-Za-z0-9+\/=._-]{20,2000}$/', preg_replace('/^Zoho-enczapikey\s+/i', '', $token) ?? '')) {
                throw new RuntimeException('That doesn\'t look like a ZeptoMail Send Mail token.');
            }
            $changes = ['MAIL_FROM' => $from, 'ZEPTOMAIL_API_HOST' => $host];
            if ($token !== '') {
                $changes['ZEPTOMAIL_TOKEN'] = preg_replace('/^Zoho-enczapikey\s+/i', '', $token);
            }
            save_secrets($changes);
            flash('Email settings saved. Send a test email to check them.');
        } elseif ($action === 'test') {
            $ok = send_email((string) $user['email'], 'Rowan Copy test email',
                "This is a test from your Rowan Copy portal. Email is working.\n\n" . base_url() . "\n");
            flash($ok ? 'Test email sent to ' . $user['email'] . '. Check your inbox (and spam).' : 'The test email could not be sent. Check the token, that rowancopy.com is verified in ZeptoMail, and that you have credits.', $ok ? 'ok' : 'err');
        } elseif ($action === 'remove_token') {
            save_secrets(['ZEPTOMAIL_TOKEN' => '']);
            flash('ZeptoMail token removed.');
        }
    } catch (Throwable $e) {
        flash($e->getMessage(), 'err');
    }
    redirect('admin-email.php');
}

$hasToken = app_secret('ZEPTOMAIL_TOKEN') !== '';
page_header('Email settings');
?>
<div class="page">
  <a class="back" href="<?= h(base_url('admin.php')) ?>">← Admin</a>
  <h1>Email</h1>
  <div class="card">
    <h2>Status</h2>
    <p><?= mail_enabled()
        ? '<span class="badge badge-live">On</span> Sending from <strong>' . h(mail_from()) . '</strong> via ' . ($hasToken ? 'ZeptoMail' : 'this server\'s mail system') . '.'
        : '<span class="badge">Off</span> Password resets, sign-up confirmations and contact-form alerts aren\'t being sent.' ?></p>
    <?php if (mail_enabled()): ?>
      <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="test"><button class="btn btn-ghost btn-sm">Send me a test email</button></form>
    <?php endif; ?>
  </div>

  <div class="card">
    <h2>ZeptoMail</h2>
    <p class="muted small">In ZeptoMail, open <strong>Mail Agents → your agent → SMTP/API</strong> and copy the <strong>Send Mail token</strong>.
      rowancopy.com must be verified in ZeptoMail first.</p>
    <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="save">
      <label>Send from <input type="email" name="mail_from" value="<?= h(mail_from()) ?>" placeholder="noreply@rowancopy.com"></label>
      <label>Send Mail token <input type="password" name="token" autocomplete="off" placeholder="<?= $hasToken ? 'Saved (leave empty to keep it)' : 'Paste the token' ?>"></label>
      <label>API host <input name="api_host" value="<?= h(app_secret('ZEPTOMAIL_API_HOST') ?: 'api.zeptomail.com') ?>"></label>
      <p class="muted small">Use api.zeptomail.eu, .in or .com.au if your Zoho account is in that region.</p>
      <button class="btn">Save</button>
    </form>
    <?php if ($hasToken && getenv('ZEPTOMAIL_TOKEN') === false): ?>
      <form method="post" onsubmit="return confirm('Remove the ZeptoMail token? Email will stop until you add one again.')"><?= csrf_field() ?>
        <input type="hidden" name="action" value="remove_token"><button class="btn btn-ghost btn-sm">Remove token</button></form>
    <?php endif; ?>
  </div>
</div>
<?php page_footer();
