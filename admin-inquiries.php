<?php
// Staff: quote requests from the public Contact page.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_staff();
const INQUIRY_STATUSES = ['new' => 'New', 'replied' => 'Replied', 'won' => 'Won', 'archived' => 'Archived'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $id = (int) ($_POST['id'] ?? 0);
    if (($_POST['action'] ?? '') === 'status' && isset(INQUIRY_STATUSES[$_POST['status'] ?? ''])) {
        db()->prepare('UPDATE inquiries SET status = ? WHERE id = ?')->execute([$_POST['status'], $id]);
    } elseif (($_POST['action'] ?? '') === 'delete' && is_admin($user)) {
        db()->prepare('DELETE FROM inquiries WHERE id = ?')->execute([$id]);
        flash('Request deleted.');
    }
    redirect('admin-inquiries.php' . (isset($_GET['show']) ? '?show=' . rawurlencode((string) $_GET['show']) : ''));
}

$show = (string) ($_GET['show'] ?? 'open');
$where = $show === 'all' ? '' : ($show === 'archived' ? "WHERE status = 'archived'" : "WHERE status != 'archived'");
$rows = db()->query("SELECT * FROM inquiries $where ORDER BY id DESC LIMIT 300")->fetchAll();
$c = company();

page_header('Quote requests');
?>
<div class="page">
  <a class="back" href="<?= h(base_url('admin.php')) ?>">← <?= is_admin($user) ? 'Admin' : 'Staff' ?></a>
  <div class="page-head">
    <h1>Quote requests</h1>
    <div class="interval-toggle">
      <?php foreach (['open' => 'Open', 'archived' => 'Archived', 'all' => 'All'] as $k => $label): ?>
        <a href="<?= h(base_url('admin-inquiries.php?show=' . $k)) ?>" class="<?= $show === $k ? 'active' : '' ?>"><?= $label ?></a>
      <?php endforeach; ?>
    </div>
  </div>
  <?php if (!$rows): ?><div class="card"><p class="muted">No requests here yet. They arrive from the Get a quote page.</p></div><?php endif; ?>
  <?php foreach ($rows as $r): ?>
    <div class="card message<?= $r['status'] === 'new' ? ' unread' : '' ?>">
      <div class="message-head">
        <div>
          <strong><?= h($r['name']) ?></strong><?= $r['business'] !== '' ? ' · ' . h($r['business']) : '' ?>
          <span class="m-pill"><?= h($r['service']) ?></span>
          <div class="muted small"><?= h(date('M j, Y g:ia', strtotime($r['created_at'] . ' UTC'))) ?></div>
        </div>
        <div class="admin-actions">
          <form method="post" class="inline-form"><?= csrf_field() ?><input type="hidden" name="action" value="status"><input type="hidden" name="id" value="<?= (int) $r['id'] ?>">
            <select name="status" onchange="this.form.submit()" aria-label="Status">
              <?php foreach (INQUIRY_STATUSES as $k => $label): ?><option value="<?= $k ?>" <?= $r['status'] === $k ? 'selected' : '' ?>><?= $label ?></option><?php endforeach; ?>
            </select></form>
          <?php if (is_admin($user)): ?>
            <form method="post" onsubmit="return confirm('Delete this request?')"><?= csrf_field() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= (int) $r['id'] ?>"><button class="link small danger-link">Delete</button></form>
          <?php endif; ?>
        </div>
      </div>
      <dl>
        <dt>Email</dt><dd><a href="mailto:<?= h($r['email']) ?>?subject=<?= rawurlencode('Your ' . $r['service'] . ' quote from ' . $c['name']) ?>"><?= h($r['email']) ?></a></dd>
        <?php if ($r['phone'] !== ''): ?><dt>Phone</dt><dd><a href="tel:<?= h($r['phone']) ?>"><?= h($r['phone']) ?></a></dd><?php endif; ?>
        <?php if ($r['budget'] !== ''): ?><dt>Budget</dt><dd><?= h($r['budget']) ?></dd><?php endif; ?>
        <dt>Project</dt><dd><?= nl2br(h($r['message'])) ?></dd>
      </dl>
    </div>
  <?php endforeach; ?>
</div>
<?php page_footer();
