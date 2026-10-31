<?php
// Owner-only overview and controls. Access: admin_emails in config.php.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();
if (!is_admin($user)) {
    http_response_code(403);
    exit('Admins only.');
}

$resetLink = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $pdo = db();
    $uid = (int) ($_POST['user_id'] ?? 0);
    $sid = (int) ($_POST['site_id'] ?? 0);
    switch ($_POST['action'] ?? '') {
        case 'suspend':
            if ($uid === (int) $user['id']) {
                flash('You can\'t suspend yourself.', 'err');
                break;
            }
            $pdo->prepare('UPDATE users SET suspended = 1 WHERE id = ?')->execute([$uid]);
            bump_session_version($uid);
            flash('Customer suspended. They are logged out and their sites are offline.');
            break;
        case 'unsuspend':
            $pdo->prepare('UPDATE users SET suspended = 0 WHERE id = ?')->execute([$uid]);
            flash('Customer restored.');
            break;
        case 'set_limit':
            $raw = trim((string) ($_POST['limit'] ?? ''));
            $pdo->prepare('UPDATE users SET ai_limit_override = ? WHERE id = ?')
                ->execute([$raw === '' ? null : max(0, (int) $raw), $uid]);
            flash($raw === '' ? 'AI limit set back to the default.' : 'AI limit updated.');
            break;
        case 'verify':
            $pdo->prepare('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$uid]);
            flash('Email marked as confirmed.');
            break;
        case 'reset_link':
            $resetLink = password_reset_link($uid);
            break;
        case 'takedown':
            $pdo->prepare('UPDATE sites SET taken_down = 1 WHERE id = ?')->execute([$sid]);
            flash('Site taken down.');
            break;
        case 'restore_site':
            $pdo->prepare('UPDATE sites SET taken_down = 0 WHERE id = ?')->execute([$sid]);
            flash('Site restored.');
            break;
    }
    if (!$resetLink) {
        redirect('admin.php');
    }
}

$month = "strftime('%Y-%m-01 00:00:00','now')";
$totals = db()->query(
    "SELECT
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM sites) AS sites,
       (SELECT COUNT(*) FROM sites WHERE published_version_id IS NOT NULL AND taken_down = 0) AS live,
       (SELECT COUNT(*) FROM ai_usage WHERE created_at >= $month) AS gens,
       (SELECT COALESCE(SUM(input_tokens),0) FROM ai_usage WHERE created_at >= $month) AS tin,
       (SELECT COALESCE(SUM(output_tokens),0) FROM ai_usage WHERE created_at >= $month) AS tout,
       (SELECT COALESCE(SUM(views),0) FROM page_views WHERE day >= date('now','-29 days')) AS views"
)->fetch();

$rows = db()->query(
    "SELECT u.id, u.name, u.email, u.created_at, u.suspended, u.email_verified_at, u.ai_limit_override,
       (SELECT COUNT(*) FROM sites s WHERE s.user_id = u.id) AS sites,
       (SELECT COUNT(*) FROM ai_usage a WHERE a.user_id = u.id AND a.status = 'ok' AND a.created_at >= $month) AS gens
     FROM users u ORDER BY u.id DESC LIMIT 500"
)->fetchAll();

$sites = db()->query(
    "SELECT s.id, s.name, s.slug, s.custom_domain, s.published_version_id, s.taken_down, s.updated_at, u.email,
       (SELECT COALESCE(SUM(views),0) FROM page_views p WHERE p.site_id = s.id AND p.day >= date('now','-29 days')) AS views
     FROM sites s JOIN users u ON u.id = s.user_id ORDER BY s.updated_at DESC LIMIT 500"
)->fetchAll();

$domains = array_filter($sites, fn ($s) => $s['custom_domain']);

function admin_button(string $action, string $label, array $fields, string $confirm = ''): string
{
    $html = '<form method="post"' . ($confirm ? ' onsubmit="return confirm(\'' . h($confirm) . '\')"' : '') . '>' . csrf_field()
        . '<input type="hidden" name="action" value="' . h($action) . '">';
    foreach ($fields as $k => $v) {
        $html .= '<input type="hidden" name="' . h($k) . '" value="' . h((string) $v) . '">';
    }
    return $html . '<button class="btn btn-ghost btn-sm">' . h($label) . '</button></form>';
}

page_header('Admin');
?>
<div class="page">
  <h1>Admin</h1>
  <?php if ($resetLink): ?>
    <div class="card">
      <h2>Password reset link</h2>
      <p class="muted small">Send this to the customer. It works once, for 1 hour.</p>
      <div class="reset-link"><?= h($resetLink) ?></div>
    </div>
  <?php endif; ?>
  <?php if (!mail_enabled()): ?>
    <div class="notice">Email is off: set <code>mail_from</code> in config.php to send password resets, confirmations and form alerts.</div>
  <?php endif; ?>

  <div class="stats">
    <div class="card"><strong><?= (int) $totals['users'] ?></strong><span>customers</span></div>
    <div class="card"><strong><?= (int) $totals['sites'] ?></strong><span>sites (<?= (int) $totals['live'] ?> live)</span></div>
    <div class="card"><strong><?= (int) $totals['gens'] ?></strong><span>AI runs this month</span></div>
    <div class="card"><strong><?= number_format(($totals['tin'] + $totals['tout']) / 1e6, 2) ?>M</strong><span>tokens this month (<?= number_format($totals['tin'] / 1e6, 2) ?>M in / <?= number_format($totals['tout'] / 1e6, 2) ?>M out)</span></div>
    <div class="card"><strong><?= number_format((int) $totals['views']) ?></strong><span>site visits, last 30 days</span></div>
  </div>
  <p class="muted small">Check exact charges in your Claude Console billing page.</p>

  <?php if ($domains): ?>
    <h2>Custom domains to connect</h2>
    <p class="muted small">In Plesk, add each one as a domain alias of this app's domain, then issue an SSL certificate that covers it.</p>
    <div class="table-wrap"><table>
      <tr><th>Domain</th><th>Site</th><th>Owner</th></tr>
      <?php foreach ($domains as $s): ?>
        <tr><td><?= h($s['custom_domain']) ?></td><td><?= h($s['name']) ?></td><td><?= h($s['email']) ?></td></tr>
      <?php endforeach; ?>
    </table></div>
  <?php endif; ?>

  <h2>Customers</h2>
  <div class="table-wrap"><table>
    <tr><th>Name</th><th>Email</th><th>Joined</th><th>Sites</th><th>AI runs / limit</th><th>Actions</th></tr>
    <?php foreach ($rows as $r): ?>
      <tr>
        <td><?= h($r['name']) ?><?= $r['suspended'] ? ' <span class="badge badge-down">Suspended</span>' : '' ?></td>
        <td><?= h($r['email']) ?><?= $r['email_verified_at'] ? '' : ' <span class="badge">unconfirmed</span>' ?></td>
        <td><?= h(substr($r['created_at'], 0, 10)) ?></td>
        <td><?= (int) $r['sites'] ?></td>
        <td><?= (int) $r['gens'] ?> / <?= ai_limit($r) ?></td>
        <td class="admin-actions">
          <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="set_limit"><input type="hidden" name="user_id" value="<?= (int) $r['id'] ?>">
            <input name="limit" type="number" min="0" placeholder="limit" value="<?= h($r['ai_limit_override'] === null ? '' : (string) $r['ai_limit_override']) ?>" title="Monthly AI limit (blank = default)"><button class="btn btn-ghost btn-sm">Set</button></form>
          <?= admin_button('reset_link', 'Reset link', ['user_id' => $r['id']]) ?>
          <?php if (!$r['email_verified_at']): ?><?= admin_button('verify', 'Confirm email', ['user_id' => $r['id']]) ?><?php endif; ?>
          <?= $r['suspended']
              ? admin_button('unsuspend', 'Unsuspend', ['user_id' => $r['id']])
              : admin_button('suspend', 'Suspend', ['user_id' => $r['id']], 'Suspend this customer? Their sites go offline.') ?>
        </td>
      </tr>
    <?php endforeach; ?>
  </table></div>

  <h2>Sites</h2>
  <div class="table-wrap"><table>
    <tr><th>Site</th><th>Owner</th><th>Status</th><th>Visits (30d)</th><th>Updated</th><th>Actions</th></tr>
    <?php foreach ($sites as $s): ?>
      <tr>
        <td><?= $s['published_version_id'] ? '<a href="' . h(site_url($s['slug'])) . '" target="_blank" rel="noopener">' . h($s['name']) . '</a>' : h($s['name']) ?>
          <?= $s['custom_domain'] ? '<br><span class="muted small">' . h($s['custom_domain']) . '</span>' : '' ?></td>
        <td><?= h($s['email']) ?></td>
        <td><?= $s['taken_down'] ? 'Taken down' : ($s['published_version_id'] ? 'Live' : 'Draft') ?></td>
        <td><?= number_format((int) $s['views']) ?></td>
        <td><?= h(substr($s['updated_at'], 0, 16)) ?></td>
        <td class="admin-actions"><?= $s['taken_down']
            ? admin_button('restore_site', 'Restore', ['site_id' => $s['id']])
            : admin_button('takedown', 'Take down', ['site_id' => $s['id']], 'Take this site offline? The owner can\'t republish it until you restore it.') ?></td>
      </tr>
    <?php endforeach; ?>
  </table></div>
</div>
<?php page_footer();
