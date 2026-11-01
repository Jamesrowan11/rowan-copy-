<?php
// Staff: customer domains (connect / disconnect), domain orders, and the Name.com connection.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_staff();
$isAdmin = is_admin($user);
$testResult = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $action = (string) ($_POST['action'] ?? '');
    try {
        switch ($action) {
            case 'connect':
            case 'disconnect':
                $stmt = db()->prepare('SELECT * FROM sites WHERE id = ?');
                $stmt->execute([(int) ($_POST['site_id'] ?? 0)]);
                if ($site = $stmt->fetch()) {
                    if ($action === 'connect') {
                        $r = connect_custom_domain($site);
                        flash($r['message'], $r['ok'] ? 'ok' : 'err');
                    } else {
                        disconnect_custom_domain($site);
                        flash($site['custom_domain'] . ' disconnected. The customer\'s site still works at its Rowan Copy address.');
                    }
                }
                break;
            case 'retry_register':
                if (!$isAdmin) {
                    throw new RuntimeException('Admins only.');
                }
                $id = (int) ($_POST['order_id'] ?? 0);
                db()->prepare("UPDATE domain_orders SET status = 'paid' WHERE id = ? AND status = 'failed'")->execute([$id]);
                fulfill_domain_order($id);
                $o = domain_order($id);
                flash("{$o['domain']}: " . ($o['status'] === 'active' ? 'registered and set up.' : 'still not done: ' . $o['error']), $o['status'] === 'active' ? 'ok' : 'err');
                break;
            case 'retry_setup':
                $id = (int) ($_POST['order_id'] ?? 0);
                finish_domain_setup($id);
                $o = domain_order($id);
                flash("{$o['domain']}: " . ($o['status'] === 'active' ? 'set up.' : 'still not done: ' . $o['error']), $o['status'] === 'active' ? 'ok' : 'err');
                break;
            case 'test':
                $r = registrar_check(['rowancopy-connection-test-' . random_int(1000, 9999) . '.com'])[0] ?? null;
                $testResult = $r ? 'Connected to Name.com' . (registrar_is_sandbox() ? ' (sandbox)' : ' (live)') . '. A test .com costs $' . number_format($r['wholesale'], 2)
                    . ' wholesale, so customers would pay $' . number_format($r['price_cents'] / 100, 2) . '/year.' : 'Connected, but Name.com returned no result.';
                break;
        }
    } catch (Throwable $e) {
        flash($e->getMessage(), 'err');
    }
    if ($testResult === null) {
        redirect('admin-domains.php');
    }
}

$custom = db()->query("SELECT s.id, s.name, s.custom_domain, s.domain_connected_at, s.published_version_id, u.email
    FROM sites s JOIN users u ON u.id = s.user_id WHERE s.custom_domain IS NOT NULL AND s.custom_domain != '' ORDER BY s.domain_connected_at IS NOT NULL, s.updated_at DESC")->fetchAll();
$orders = db()->query("SELECT d.*, u.email FROM domain_orders d JOIN users u ON u.id = d.user_id WHERE d.status != 'pending' ORDER BY d.id DESC LIMIT 200")->fetchAll();

page_header('Domains (staff)');
?>
<div class="page">
  <a class="back" href="<?= h(base_url('admin.php')) ?>">← <?= $isAdmin ? 'Admin' : 'Staff' ?></a>
  <h1>Domains</h1>

  <div class="card">
    <h2>Name.com</h2>
    <?php if (!registrar_enabled()): ?>
      <p class="notice small">Not connected. Add your Name.com username and API token under <code>'namecom'</code> in config.php.</p>
    <?php else: ?>
      <p class="muted small"><?= registrar_is_sandbox() ? 'Using the <strong>sandbox</strong>: test domains, no real charges.' : 'Using the <strong>live</strong> API: purchases register real domains and charge your Name.com account.' ?>
        Markup: $<?= number_format((float) registrar_settings()['markup'], 2) ?>/year.</p>
      <?php if ($testResult): ?><p class="badge badge-live"><?= h($testResult) ?></p><?php endif; ?>
      <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="test"><button class="btn btn-ghost btn-sm">Test connection</button></form>
    <?php endif; ?>
  </div>

  <h2>Customers' own domains</h2>
  <p class="muted small">Domains customers bought elsewhere and entered in their site settings. Connect checks their DNS points at <?= h((string) cfg('server_ip') ?: 'your server') ?>, then adds the domain to Plesk.</p>
  <?php if (!$custom): ?><p class="muted">None yet.</p><?php else: ?>
  <div class="table-wrap"><table>
    <tr><th>Domain</th><th>Site</th><th>Owner</th><th>Status</th><th></th></tr>
    <?php foreach ($custom as $s): ?>
      <tr>
        <td><?= h($s['custom_domain']) ?></td><td><?= h($s['name']) ?><?= $s['published_version_id'] ? '' : ' <span class="muted small">(not published)</span>' ?></td>
        <td><?= h($s['email']) ?></td>
        <td><?= $s['domain_connected_at'] ? '<span class="badge badge-live">Connected</span>' : '<span class="badge">Not connected</span>' ?></td>
        <td class="admin-actions">
          <form method="post"><?= csrf_field() ?><input type="hidden" name="site_id" value="<?= (int) $s['id'] ?>">
            <input type="hidden" name="action" value="<?= $s['domain_connected_at'] ? 'disconnect' : 'connect' ?>">
            <button class="btn btn-sm <?= $s['domain_connected_at'] ? 'btn-ghost' : '' ?>"><?= $s['domain_connected_at'] ? 'Disconnect' : 'Connect' ?></button></form>
        </td>
      </tr>
    <?php endforeach; ?>
  </table></div>
  <?php endif; ?>

  <h2>Domains sold</h2>
  <?php if (!$orders): ?><p class="muted">None yet.</p><?php else: ?>
  <div class="table-wrap"><table>
    <tr><th>Domain</th><th>Customer</th><th>Price</th><th>Status</th><th>Renews</th><th></th></tr>
    <?php foreach ($orders as $o): ?>
      <tr>
        <td><?= h($o['domain']) ?></td><td><?= h($o['email']) ?></td>
        <td>$<?= number_format($o['price_cents'] / 100, 2) ?>/yr<br><span class="muted small">cost $<?= number_format((float) $o['wholesale'], 2) ?></span></td>
        <td><?= h($o['status']) ?><?= $o['error'] ? '<br><span class="muted small">' . h($o['error']) . '</span>' : '' ?></td>
        <td><?= $o['expires_at'] ? h(substr($o['expires_at'], 0, 10)) : '' ?><?= $o['autorenew'] ? '' : '<br><span class="muted small">auto-renew off</span>' ?></td>
        <td class="admin-actions">
          <?php if ($o['status'] === 'failed' && $isAdmin): ?>
            <form method="post" onsubmit="return confirm('Try registering <?= h($o['domain']) ?> again? This charges your Name.com account.')"><?= csrf_field() ?>
              <input type="hidden" name="action" value="retry_register"><input type="hidden" name="order_id" value="<?= (int) $o['id'] ?>"><button class="btn btn-sm">Retry registration</button></form>
          <?php elseif ($o['status'] === 'setup_failed'): ?>
            <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="retry_setup"><input type="hidden" name="order_id" value="<?= (int) $o['id'] ?>"><button class="btn btn-sm">Retry setup</button></form>
          <?php endif; ?>
        </td>
      </tr>
    <?php endforeach; ?>
  </table></div>
  <?php endif; ?>
</div>
<?php page_footer();
