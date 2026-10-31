<?php
// Owner-only overview of customers, sites and AI spend. Access: admin_emails in config.php.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();
if (!is_admin($user)) {
    http_response_code(403);
    exit('Admins only.');
}

$totals = db()->query(
    "SELECT
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM sites) AS sites,
       (SELECT COUNT(*) FROM sites WHERE published_version_id IS NOT NULL) AS live,
       (SELECT COUNT(*) FROM ai_usage WHERE created_at >= strftime('%Y-%m-01 00:00:00','now')) AS gens,
       (SELECT COALESCE(SUM(input_tokens),0) FROM ai_usage WHERE created_at >= strftime('%Y-%m-01 00:00:00','now')) AS tin,
       (SELECT COALESCE(SUM(output_tokens),0) FROM ai_usage WHERE created_at >= strftime('%Y-%m-01 00:00:00','now')) AS tout"
)->fetch();

$rows = db()->query(
    "SELECT u.id, u.name, u.email, u.created_at,
       (SELECT COUNT(*) FROM sites s WHERE s.user_id = u.id) AS sites,
       (SELECT COUNT(*) FROM ai_usage a WHERE a.user_id = u.id AND a.created_at >= strftime('%Y-%m-01 00:00:00','now')) AS gens
     FROM users u ORDER BY u.id DESC LIMIT 500"
)->fetchAll();

$sites = db()->query(
    'SELECT s.name, s.slug, s.published_version_id, s.updated_at, u.email FROM sites s JOIN users u ON u.id = s.user_id ORDER BY s.updated_at DESC LIMIT 500'
)->fetchAll();

page_header('Admin');
?>
<div class="page">
  <h1>Admin</h1>
  <div class="stats">
    <div class="card"><strong><?= (int) $totals['users'] ?></strong><span>customers</span></div>
    <div class="card"><strong><?= (int) $totals['sites'] ?></strong><span>sites (<?= (int) $totals['live'] ?> live)</span></div>
    <div class="card"><strong><?= (int) $totals['gens'] ?></strong><span>AI runs this month</span></div>
    <div class="card"><strong><?= number_format(($totals['tin'] + $totals['tout']) / 1e6, 2) ?>M</strong><span>tokens this month (<?= number_format($totals['tin'] / 1e6, 2) ?>M in / <?= number_format($totals['tout'] / 1e6, 2) ?>M out)</span></div>
  </div>
  <p class="muted small">Check exact charges in your Claude Console billing page.</p>

  <h2>Customers</h2>
  <div class="table-wrap"><table>
    <tr><th>Name</th><th>Email</th><th>Joined</th><th>Sites</th><th>AI runs (month)</th></tr>
    <?php foreach ($rows as $r): ?>
      <tr><td><?= h($r['name']) ?></td><td><?= h($r['email']) ?></td><td><?= h(substr($r['created_at'], 0, 10)) ?></td><td><?= (int) $r['sites'] ?></td><td><?= (int) $r['gens'] ?></td></tr>
    <?php endforeach; ?>
  </table></div>

  <h2>Sites</h2>
  <div class="table-wrap"><table>
    <tr><th>Site</th><th>Owner</th><th>Status</th><th>Updated</th></tr>
    <?php foreach ($sites as $s): ?>
      <tr>
        <td><?= $s['published_version_id'] ? '<a href="' . h(site_url($s['slug'])) . '" target="_blank" rel="noopener">' . h($s['name']) . '</a>' : h($s['name']) ?></td>
        <td><?= h($s['email']) ?></td>
        <td><?= $s['published_version_id'] ? 'Live' : 'Draft' ?></td>
        <td><?= h(substr($s['updated_at'], 0, 16)) ?></td>
      </tr>
    <?php endforeach; ?>
  </table></div>
</div>
<?php page_footer();
