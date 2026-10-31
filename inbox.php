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
    }
    redirect('inbox.php?id=' . $site['id']);
}

$stmt = db()->prepare('SELECT * FROM submissions WHERE site_id = ? ORDER BY id DESC LIMIT 200');
$stmt->execute([$site['id']]);
$messages = $stmt->fetchAll();
db()->prepare('UPDATE submissions SET is_read = 1 WHERE site_id = ?')->execute([$site['id']]);

page_header('Messages · ' . $site['name']);
?>
<div class="page narrow">
  <a href="<?= h(base_url('editor.php?id=' . $site['id'])) ?>" class="back">← Back to editor</a>
  <h1>Messages from <?= h($site['name']) ?></h1>
  <?php if (!$messages): ?>
    <div class="card"><p class="muted">No messages yet. When visitors fill in a form on your published site, they show up here.</p></div>
  <?php endif; ?>
  <?php foreach ($messages as $m): ?>
    <div class="card message<?= $m['is_read'] ? '' : ' unread' ?>">
      <div class="message-head">
        <span class="muted small"><?= h(date('M j, Y g:ia', strtotime($m['created_at'] . ' UTC'))) ?></span>
        <form method="post" class="inline" onsubmit="return confirm('Delete this message?')">
          <?= csrf_field() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="message_id" value="<?= (int) $m['id'] ?>">
          <button class="link small">Delete</button>
        </form>
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
