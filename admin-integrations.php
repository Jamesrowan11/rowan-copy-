<?php
// Admin: Zoho CRM (leads), Zoho Desk (Help link) and Zoho Books (instructions).
// Secrets are saved in data_dir/secrets.json, outside the app folder, and never shown again.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_admin();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $action = (string) ($_POST['action'] ?? '');
    try {
        switch ($action) {
            case 'crm_connect':
                $host = (string) ($_POST['accounts_host'] ?? '');
                $id = trim((string) ($_POST['client_id'] ?? ''));
                $secret = trim((string) ($_POST['client_secret'] ?? ''));
                $code = trim((string) ($_POST['grant_code'] ?? ''));
                if (!isset(ZOHO_ACCOUNTS_HOSTS[$host]) || !preg_match('/^[A-Za-z0-9.]{10,200}$/', $id)
                    || !preg_match('/^[A-Za-z0-9]{10,200}$/', $secret) || !preg_match('/^[A-Za-z0-9.]{10,300}$/', $code)) {
                    throw new ZohoError('Fill in all four fields exactly as Zoho shows them.');
                }
                zoho_connect($host, $id, $secret, $code);
                flash('Zoho CRM connected. New sign-ups and quote requests will appear as Leads.');
                break;
            case 'crm_test':
                crm_queue_lead(crm_lead_record('Rowan Copy Test', (string) $user['email'], 'Test lead from Admin -> Integrations. You can delete it.'));
                [$sent, $failed] = crm_flush(1);
                flash($sent ? 'Test lead sent: look for "Rowan Copy Test" in Zoho CRM -> Leads.' : 'The test lead was not accepted. The reason is shown under "Waiting" below.', $sent ? 'ok' : 'err');
                break;
            case 'crm_retry':
                db()->exec('UPDATE crm_outbox SET attempts = 0 WHERE sent_at IS NULL');
                [$sent, $failed] = crm_flush(50);
                flash("Sent $sent, still failing $failed.", $failed ? 'err' : 'ok');
                break;
            case 'crm_settings':
                $source = trim((string) ($_POST['lead_source'] ?? ''));
                save_secrets(['ZOHO_LEAD_SOURCE' => mb_substr($source, 0, 100)]);
                flash('Saved.');
                break;
            case 'crm_disconnect':
                zoho_disconnect();
                flash('Zoho CRM disconnected. Leads are no longer sent.');
                break;
            case 'desk':
                $url = trim((string) ($_POST['support_url'] ?? ''));
                if ($url !== '' && !preg_match('#^https://[^\s"<>]+$#', $url)) {
                    throw new RuntimeException('Use the full https:// address of your help center.');
                }
                save_secrets(['SUPPORT_URL' => $url]);
                flash($url === '' ? 'Help link removed.' : 'Help link saved. Customers see "Help" in the menu.');
                break;
        }
    } catch (Throwable $e) {
        flash($e->getMessage(), 'err');
    }
    redirect('admin-integrations.php');
}

$crmOn = zoho_crm_enabled();
$counts = crm_outbox_counts();
$waiting = db()->query('SELECT created_at, attempts, last_error FROM crm_outbox WHERE sent_at IS NULL ORDER BY id DESC LIMIT 5')->fetchAll();
page_header('Integrations');
?>
<div class="page">
  <a class="back" href="<?= h(base_url('admin.php')) ?>">← Admin</a>
  <h1>Integrations</h1>

  <div class="card">
    <h2>Zoho CRM</h2>
    <p class="muted small">New sign-ups and quote requests become <strong>Leads</strong> in Zoho CRM (matched by email, so nobody is added twice).</p>
    <?php if ($crmOn): ?>
      <p><span class="badge badge-live">Connected</span> <?= h(ZOHO_ACCOUNTS_HOSTS[app_secret('ZOHO_ACCOUNTS_HOST')] ?? '') ?>.
        Sent: <?= (int) ($counts['sent'] ?? 0) ?> · Waiting: <?= (int) ($counts['waiting'] ?? 0) ?><?= !empty($counts['gave_up']) ? ' · Gave up: ' . (int) $counts['gave_up'] : '' ?></p>
      <?php foreach ($waiting as $w): ?>
        <p class="small muted">Waiting since <?= h($w['created_at']) ?> (<?= (int) $w['attempts'] ?> tries): <?= h((string) $w['last_error']) ?></p>
      <?php endforeach; ?>
      <div class="row-actions">
        <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="crm_test"><button class="btn btn-sm">Send a test lead</button></form>
        <?php if ($waiting): ?><form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="crm_retry"><button class="btn btn-ghost btn-sm">Retry waiting leads</button></form><?php endif; ?>
        <form method="post" onsubmit="return confirm('Disconnect Zoho CRM?')"><?= csrf_field() ?><input type="hidden" name="action" value="crm_disconnect"><button class="btn btn-ghost btn-sm">Disconnect</button></form>
      </div>
      <form method="post" style="margin-top:14px"><?= csrf_field() ?><input type="hidden" name="action" value="crm_settings">
        <label>Lead Source (optional; must match a value in your CRM's Lead Source list) <input name="lead_source" maxlength="100" value="<?= h(app_secret('ZOHO_LEAD_SOURCE')) ?>" placeholder="e.g. Web Research"></label>
        <button class="btn btn-ghost btn-sm">Save</button>
      </form>
    <?php else: ?>
      <ol class="small">
        <li>Open <a href="https://api-console.zoho.com" target="_blank" rel="noopener">api-console.zoho.com</a> → <strong>Add Client</strong> → <strong>Self Client</strong> → Create.</li>
        <li>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> into the form below.</li>
        <li>On the <strong>Generate Code</strong> tab, enter the scope <code>ZohoCRM.modules.leads.ALL</code>, choose 10 minutes, any description, then <strong>Create</strong> and copy the code.</li>
        <li>Paste the code below and click Connect within 10 minutes.</li>
      </ol>
      <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="crm_connect">
        <label>Zoho region <select name="accounts_host">
          <?php foreach (ZOHO_ACCOUNTS_HOSTS as $host => $label): ?><option value="<?= h($host) ?>"><?= h($label) ?></option><?php endforeach; ?>
        </select></label>
        <label>Client ID <input name="client_id" autocomplete="off" required></label>
        <label>Client Secret <input type="password" name="client_secret" autocomplete="off" required></label>
        <label>Grant code <input name="grant_code" autocomplete="off" required></label>
        <button class="btn">Connect Zoho CRM</button>
      </form>
    <?php endif; ?>
  </div>

  <div class="card">
    <h2>Zoho Desk</h2>
    <p class="muted small">Customers get a <strong>Help</strong> link in the menu that opens your Zoho Desk help center. To turn support@ emails into tickets,
      add support@rowancopy.com as an email channel in Zoho Desk (Setup → Channels → Email).</p>
    <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="desk">
      <label>Help center address <input name="support_url" value="<?= h(support_url()) ?>" placeholder="https://rowancopy.zohodesk.com/portal"></label>
      <button class="btn btn-ghost btn-sm">Save</button>
    </form>
  </div>

  <div class="card">
    <h2>Zoho Books</h2>
    <p class="muted small">Books connects to Stripe directly, so every payment is recorded without anything here: in Zoho Books, open
      <strong>Settings → Online Payments → Payment Gateways → Stripe</strong> and sign in with your Stripe account. To import past
      Stripe payouts, use <strong>Banking → add Stripe as a bank account</strong>.</p>
  </div>
</div>
<?php page_footer();
