<?php
// Admin: customers' paid email accounts. Two jobs that happen outside Rowan Copy:
//  1. Zoho: give each mailbox the Zoho plan the customer pays for (Mail Lite or
//     Mail Premium), in Zoho Mail's admin console, then mark it done here.
//  2. Accounts made before email was billed: schedule when their billing starts.
//     Customers are emailed, and nothing is charged before that date.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$admin = require_admin();
$tiers = mail_tiers();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $action = (string) ($_POST['action'] ?? '');
    try {
        if ($action === 'zoho_done') {
            db()->prepare('UPDATE mail_accounts SET zoho_tier = tier WHERE id = ?')->execute([(int) ($_POST['account_id'] ?? 0)]);
            flash('Marked as done in Zoho.');
        } elseif ($action === 'start_billing') {
            $date = (string) ($_POST['starts'] ?? '');
            $t = strtotime($date . ' 12:00 UTC');
            if (!$t || $t < time() + 7 * 86400) {
                throw new RuntimeException('Pick a start date at least 7 days from today, so customers have notice.');
            }
            if (!stripe_enabled()) {
                throw new RuntimeException('Stripe isn\'t set up.');
            }
            $ids = ($_POST['user_id'] ?? '') === 'all' ? array_keys(mail_unbilled_customers()) : [(int) ($_POST['user_id'] ?? 0)];
            $done = [];
            foreach ($ids as $id) {
                $stmt = db()->prepare('SELECT email, mail_billing_from FROM users WHERE id = ?');
                $stmt->execute([$id]);
                $u = $stmt->fetch();
                if (!$u || $u['mail_billing_from']) {
                    continue; // already scheduled
                }
                $done[] = $u['email'] . ': ' . mail_start_billing_old_accounts($id, $t);
            }
            flash($done ? 'Billing scheduled. ' . implode('; ', $done) . '.' : 'Nothing to schedule.');
        }
    } catch (\Stripe\Exception\ApiErrorException $e) {
        error_log('Rowan Copy Stripe error: ' . $e->getMessage());
        flash('Stripe error: ' . $e->getMessage(), 'err');
    } catch (Throwable $e) {
        flash($e->getMessage(), 'err');
    }
    redirect('admin-mailboxes.php');
}

$mismatch = db()->query('SELECT a.*, u.name AS owner, u.email AS owner_email FROM mail_accounts a JOIN users u ON u.id = a.user_id
    WHERE a.tier != a.zoho_tier ORDER BY a.id')->fetchAll();
$old = [];
foreach (mail_unbilled_customers() as $uid => $counts) {
    $stmt = db()->prepare('SELECT id, name, email, mail_billing_from, stripe_customer_id FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    if ($u = $stmt->fetch()) {
        $old[] = $u + ['counts' => $counts];
    }
}
$unpaid = db()->query("SELECT u.id, u.name, u.email, u.mail_subscription_status, COUNT(a.id) AS n FROM users u JOIN mail_accounts a ON a.user_id = u.id
    WHERE a.billed = 1 AND (u.mail_subscription_status IS NULL OR u.mail_subscription_status NOT IN ('active', 'trialing', 'past_due'))
    GROUP BY u.id ORDER BY u.id")->fetchAll();
$totals = db()->query('SELECT tier, billed, COUNT(*) n FROM mail_accounts GROUP BY tier, billed')->fetchAll();

page_header('Customer mailboxes');
?>
<div class="page">
  <a class="back" href="<?= h(base_url('admin.php')) ?>">← Admin</a>
  <h1>Customer mailboxes</h1>
  <p class="muted">Customers pay <?= h(mail_tier_price('lite')) ?> for <?= h($tiers['lite']['name']) ?> (<?= h($tiers['lite']['storage']) ?>) and <?= h(mail_tier_price('premium')) ?> for <?= h($tiers['premium']['name']) ?> (<?= h($tiers['premium']['storage']) ?>) per account.
    <?php foreach ($totals as $r): ?><span class="badge"><?= (int) $r['n'] ?> <?= h($tiers[$r['tier']]['name'] ?? $r['tier']) ?><?= $r['billed'] ? '' : ' (free, older)' ?></span> <?php endforeach; ?></p>

  <div class="card">
    <h2>Set the plan in Zoho (<?= count($mismatch) ?>)</h2>
    <p class="muted small">In Zoho Mail's admin console (Users, then the user, then Subscription), give each of these mailboxes the plan shown, then click Done. New Lite accounts normally need nothing.</p>
    <?php if (!$mismatch): ?><p>Nothing to do.</p><?php else: ?>
    <div class="table-wrap"><table>
      <tr><th>Mailbox</th><th>Customer</th><th>Zoho has</th><th>Should be</th><th></th></tr>
      <?php foreach ($mismatch as $a): ?>
        <tr><td><strong><?= h($a['email']) ?></strong></td><td><?= h($a['owner']) ?><br><span class="muted small"><?= h($a['owner_email']) ?></span></td>
          <td><?= h($tiers[$a['zoho_tier']]['name'] ?? $a['zoho_tier']) ?></td><td><strong><?= h($tiers[$a['tier']]['name'] ?? $a['tier']) ?></strong></td>
          <td><form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="zoho_done"><input type="hidden" name="account_id" value="<?= (int) $a['id'] ?>"><button class="btn btn-sm">Done</button></form></td></tr>
      <?php endforeach; ?>
    </table></div>
    <?php endif; ?>
  </div>

  <div class="card">
    <h2>Older free accounts (<?= count($old) ?> customer<?= count($old) === 1 ? '' : 's' ?>)</h2>
    <p class="muted small">Accounts created before email was billed. Pick when billing starts: each customer is emailed now, and nothing is charged before that date.
      Customers with a card on file are set up automatically; the others are asked to add a card on their Email page.</p>
    <?php if (!$old): ?><p>None.</p><?php else: ?>
    <div class="table-wrap"><table>
      <tr><th>Customer</th><th>Accounts</th><th>Billing starts</th><th></th></tr>
      <?php foreach ($old as $u): ?>
        <tr><td><?= h($u['name']) ?><br><span class="muted small"><?= h($u['email']) ?></span></td>
          <td><?php foreach ($u['counts'] as $t => $n): ?><?= (int) $n ?> × <?= h($tiers[$t]['name'] ?? $t) ?><br><?php endforeach; ?></td>
          <td><?= $u['mail_billing_from'] ? h(date('M j, Y', strtotime($u['mail_billing_from'] . ' UTC'))) . ' (waiting for a card)' : '<span class="muted">Not scheduled</span>' ?></td>
          <td><?php if (!$u['mail_billing_from']): ?>
            <form method="post" class="inline-form" data-confirm="Email <?= h($u['email']) ?> that billing starts on the chosen date?"><?= csrf_field() ?>
              <input type="hidden" name="action" value="start_billing"><input type="hidden" name="user_id" value="<?= (int) $u['id'] ?>">
              <input type="date" name="starts" required value="<?= h(gmdate('Y-m-d', time() + 30 * 86400)) ?>">
              <button class="btn btn-sm">Schedule</button></form>
          <?php endif; ?></td></tr>
      <?php endforeach; ?>
    </table></div>
    <form method="post" class="inline-form" data-confirm="Email every customer above that billing starts on the chosen date?"><?= csrf_field() ?>
      <input type="hidden" name="action" value="start_billing"><input type="hidden" name="user_id" value="all">
      <label class="sr-only" for="all-start">Start date</label>
      <input id="all-start" type="date" name="starts" required value="<?= h(gmdate('Y-m-d', time() + 30 * 86400)) ?>">
      <button class="btn">Schedule for everyone</button></form>
    <?php endif; ?>
  </div>

  <div class="card">
    <h2>Not paid (<?= count($unpaid) ?>)</h2>
    <p class="muted small">Customers with billed email accounts whose email subscription ended or failed. Their mailboxes still work; contact them or delete the mailboxes in Zoho.</p>
    <?php if (!$unpaid): ?><p>None.</p><?php else: ?>
    <div class="table-wrap"><table>
      <tr><th>Customer</th><th>Accounts</th><th>Stripe status</th></tr>
      <?php foreach ($unpaid as $u): ?>
        <tr><td><?= h($u['name']) ?><br><span class="muted small"><?= h($u['email']) ?></span></td><td><?= (int) $u['n'] ?></td><td><?= h($u['mail_subscription_status'] ?: 'none') ?></td></tr>
      <?php endforeach; ?>
    </table></div>
    <?php endif; ?>
  </div>
</div>
<?php page_footer();
