<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();
$site = owned_site((int) ($_GET['id'] ?? 0), $user);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $msgId = (int) ($_POST['message_id'] ?? 0);
    if (($_POST['action'] ?? '') === 'delete') {
        db()->prepare('DELETE FROM submissions WHERE id = ? AND site_id = ?')->execute([$msgId, $site['id']]);
    } elseif (($_POST['action'] ?? '') === 'unread') {
        db()->prepare('UPDATE submissions SET is_read = 0 WHERE id = ? AND site_id = ?')->execute([$msgId, $site['id']]);
        flash('Marked as unread.');
        redirect('editor.php?id=' . $site['id']);
    }
    redirect('inbox.php?id=' . $site['id']);
}

// Spreadsheet download of every message.
if (($_GET['export'] ?? '') === 'csv') {
    $stmt = db()->prepare('SELECT data, created_at FROM submissions WHERE site_id = ? ORDER BY id');
    $stmt->execute([$site['id']]);
    $rows = $stmt->fetchAll();
    $columns = [];
    foreach ($rows as $r) {
        $columns += array_fill_keys(array_keys(json_decode($r['data'], true) ?: []), true);
    }
    $columns = array_keys($columns);
    // Stop spreadsheet apps from treating visitor text as formulas.
    $safe = fn ($v) => preg_match('/^[=+\-@\t\r]/', (string) $v) ? "'" . $v : (string) $v;
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $site['slug'] . '-messages.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // so Excel reads accents correctly
    fputcsv($out, array_merge(['Received (UTC)'], array_map('ucfirst', $columns)));
    foreach ($rows as $r) {
        $data = json_decode($r['data'], true) ?: [];
        fputcsv($out, array_merge([$r['created_at']], array_map(fn ($c) => $safe($data[$c] ?? ''), $columns)));
    }
    exit;
}

$stmt = db()->prepare('SELECT * FROM submissions WHERE site_id = ? ORDER BY id DESC LIMIT 200');
$stmt->execute([$site['id']]);
$messages = $stmt->fetchAll();
db()->prepare('UPDATE submissions SET is_read = 1 WHERE site_id = ?')->execute([$site['id']]);

page_header('Messages · ' . $site['name']);
?>
<div class="page narrow">
  <a href="<?= h(base_url('editor.php?id=' . $site['id'])) ?>" class="back">← Back to editor</a>
  <div class="page-head">
    <h1>Messages from <?= h($site['name']) ?></h1>
    <?php if ($messages): ?><a class="btn btn-ghost btn-sm" href="<?= h(base_url('inbox.php?id=' . $site['id'] . '&export=csv')) ?>">Download spreadsheet (CSV)</a><?php endif; ?>
  </div>
  <?php if (!$messages): ?>
    <div class="card"><p class="muted">No messages yet. When visitors fill in a form on your published site, they show up here.</p></div>
  <?php endif; ?>
  <?php foreach ($messages as $m): ?>
    <div class="card message<?= $m['is_read'] ? '' : ' unread' ?>">
      <div class="message-head">
        <span class="muted small"><?= h(date('M j, Y g:ia', strtotime($m['created_at'] . ' UTC'))) ?></span>
        <span class="admin-actions">
        <form method="post" class="inline">
          <?= csrf_field() ?><input type="hidden" name="action" value="unread"><input type="hidden" name="message_id" value="<?= (int) $m['id'] ?>">
          <button class="link small">Mark unread</button>
        </form>
        <form method="post" class="inline" onsubmit="return confirm('Delete this message?')">
          <?= csrf_field() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="message_id" value="<?= (int) $m['id'] ?>">
          <button class="link small">Delete</button>
        </form>
        </span>
      </div>
      <dl>
        <?php foreach (json_decode($m['data'], true) ?: [] as $k => $v): ?>
          <dt><?= h(ucfirst((string) $k)) ?></dt>
          <dd><?php
            $v = (string) $v;
            if (filter_var($v, FILTER_VALIDATE_EMAIL)) {
                echo '<a href="mailto:' . h($v) . '">' . h($v) . '</a>';
            } else {
                echo nl2br(h($v));
            }
          ?></dd>
        <?php endforeach; ?>
      </dl>
    </div>
  <?php endforeach; ?>
</div>
<?php page_footer();
