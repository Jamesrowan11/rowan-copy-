<?php
// Inbox: messages from visitors who filled in a form on any of the customer's
// websites. ?id=N narrows it to one website.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();
$site = isset($_GET['id']) && $_GET['id'] !== '' ? owned_site((int) $_GET['id'], $user) : null;
$back = 'inbox.php' . ($site ? '?id=' . $site['id'] : '');

// Only messages on this customer's own sites can be touched.
$ownMessage = function (int $id) use ($user): bool {
    $stmt = db()->prepare('SELECT 1 FROM submissions m JOIN sites s ON s.id = m.site_id WHERE m.id = ? AND s.user_id = ?');
    $stmt->execute([$id, $user['id']]);
    return (bool) $stmt->fetchColumn();
};

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $msgId = (int) ($_POST['message_id'] ?? 0);
    $action = $_POST['action'] ?? '';
    $ok = $msgId && $ownMessage($msgId);
    if ($action === 'read') { // opened in the inbox (sent by inbox.js)
        if ($ok) {
            db()->prepare('UPDATE submissions SET is_read = 1 WHERE id = ?')->execute([$msgId]);
        }
        header('Content-Type: application/json');
        exit(json_encode(['ok' => $ok]));
    }
    if ($ok && $action === 'delete') {
        db()->prepare('DELETE FROM submissions WHERE id = ?')->execute([$msgId]);
        flash('Message deleted.');
    } elseif ($ok && $action === 'unread') {
        db()->prepare('UPDATE submissions SET is_read = 0 WHERE id = ?')->execute([$msgId]);
        flash('Marked as unread.');
    }
    redirect($back);
}

$where = $site ? 's.id = ?' : 's.user_id = ?';
$param = $site ? $site['id'] : $user['id'];

// Spreadsheet download of every message.
if (($_GET['export'] ?? '') === 'csv') {
    $stmt = db()->prepare("SELECT m.data, m.created_at, s.name AS site_name, s.slug FROM submissions m JOIN sites s ON s.id = m.site_id WHERE $where ORDER BY m.id");
    $stmt->execute([$param]);
    $rows = $stmt->fetchAll();
    $columns = [];
    foreach ($rows as $r) {
        $columns += array_fill_keys(array_keys(json_decode($r['data'], true) ?: []), true);
    }
    $columns = array_keys($columns);
    // Stop spreadsheet apps from treating visitor text as formulas.
    $safe = fn ($v) => preg_match('/^[=+\-@\t\r]/', (string) $v) ? "'" . $v : (string) $v;
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . ($site ? $site['slug'] : 'all') . '-messages.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // so Excel reads accents correctly
    fputcsv($out, array_merge(['Received (UTC)'], $site ? [] : ['Website'], array_map('ucfirst', $columns)));
    foreach ($rows as $r) {
        $data = json_decode($r['data'], true) ?: [];
        fputcsv($out, array_merge([$r['created_at']], $site ? [] : [$safe($r['site_name'])], array_map(fn ($c) => $safe($data[$c] ?? ''), $columns)));
    }
    exit;
}

$stmt = db()->prepare("SELECT m.*, s.name AS site_name FROM submissions m JOIN sites s ON s.id = m.site_id WHERE $where ORDER BY m.id DESC LIMIT 300");
$stmt->execute([$param]);
$messages = [];
foreach ($stmt->fetchAll() as $m) {
    $data = json_decode($m['data'], true) ?: [];
    $from = $email = $subject = '';
    foreach ($data as $k => $v) {
        $k = strtolower((string) $k);
        $v = trim((string) $v);
        if ($v === '') continue;
        if ($email === '' && filter_var($v, FILTER_VALIDATE_EMAIL)) $email = $v;
        if ($from === '' && preg_match('/^(full ?)?name$|^first.?name$|^your.?name$/', $k)) $from = $v;
        if ($subject === '' && preg_match('/subject|topic|reason/', $k)) $subject = $v;
    }
    if ($subject === '') {
        foreach ($data as $v) {
            $v = trim((string) $v);
            if (strlen($v) > 12 && !filter_var($v, FILTER_VALIDATE_EMAIL)) { $subject = $v; break; }
        }
    }
    $m['data'] = $data;
    $m['from'] = $from !== '' ? $from : ($email !== '' ? $email : 'A visitor');
    $m['email'] = $email;
    $m['subject'] = $subject !== '' ? mb_strimwidth(preg_replace('/\s+/', ' ', $subject), 0, 90, '…') : 'New form message';
    $messages[] = $m;
}
$unread = count(array_filter($messages, fn ($m) => !$m['is_read']));
$siteCount = $site ? 1 : (int) db()->query('SELECT COUNT(*) FROM sites WHERE user_id = ' . (int) $user['id'])->fetchColumn();

page_header($site ? 'Messages · ' . $site['name'] : 'Inbox');
?>
<div class="pg">
  <div class="pg-head">
    <div>
      <?php if ($site): ?><a class="back" href="<?= h(base_url('editor.php?id=' . $site['id'])) ?>"><?= icon('arrow-left') ?> <?= h($site['name']) ?></a><?php endif; ?>
      <h1>Inbox</h1>
      <p class="muted"><?= $unread ? $unread . ' new message' . ($unread > 1 ? 's' : '') . ' from your visitors' : ($messages ? "You're all caught up." : 'Messages from your website forms land here.') ?></p>
    </div>
    <?php if ($messages): ?>
      <div class="pg-actions"><a class="btn btn-ghost btn-sm" href="<?= h(base_url($back . ($site ? '&' : '?') . 'export=csv')) ?>"><?= icon('download') ?> Spreadsheet</a></div>
    <?php endif; ?>
  </div>

  <?php if (!$messages): ?>
    <div class="box empty">
      <span class="empty-icon"><?= icon('inbox') ?></span>
      <h2>No messages yet</h2>
      <p class="muted">When visitors fill in a contact form on your published website, their messages show up here and we email you.</p>
      <?php if ($site): ?><a class="link-accent" href="<?= h(base_url('inbox.php')) ?>">See messages from all your websites</a><?php endif; ?>
    </div>
  <?php else: ?>
  <div class="inbox" id="inbox">
    <div class="inbox-list">
      <div class="inbox-search">
        <?= icon('search') ?>
        <input type="search" id="inbox-q" placeholder="Search messages" aria-label="Search messages" autocomplete="off">
      </div>
      <ul id="inbox-items">
        <?php foreach ($messages as $m): ?>
          <li>
            <button type="button" class="inbox-item<?= $m['is_read'] ? '' : ' is-unread' ?>" data-msg="<?= (int) $m['id'] ?>"
              data-search="<?= h(strtolower($m['from'] . ' ' . $m['subject'] . ' ' . $m['site_name'] . ' ' . implode(' ', array_map('strval', $m['data'])))) ?>">
              <span class="dot" aria-hidden="true"></span>
              <span class="inbox-item-body">
                <span class="inbox-row"><strong><?= h($m['from']) ?></strong><time><?= h(time_ago($m['created_at'])) ?></time></span>
                <span class="inbox-subject"><?= h($m['subject']) ?></span>
                <?php if ($siteCount > 1): ?><span class="inbox-site"><?= h($m['site_name']) ?></span><?php endif; ?>
              </span>
            </button>
          </li>
        <?php endforeach; ?>
      </ul>
      <p class="inbox-none muted" id="inbox-none" hidden>Nothing matches. Try a different word.</p>
    </div>
    <div class="inbox-read">
      <div class="inbox-pick" id="inbox-pick">
        <span class="empty-icon"><?= icon('inbox') ?></span>
        <h2>Pick a message</h2>
        <p class="muted">Choose a message on the left to read it.</p>
      </div>
      <?php foreach ($messages as $m): ?>
        <article class="msg" id="msg-<?= (int) $m['id'] ?>" hidden>
          <button type="button" class="btn btn-ghost btn-sm inbox-back" data-inbox-back><?= icon('arrow-left') ?> All messages</button>
          <h2><?= h($m['subject']) ?></h2>
          <div class="msg-from">
            <span class="msg-avatar" aria-hidden="true"><?= h(mb_strtoupper(mb_substr($m['from'], 0, 1))) ?></span>
            <div>
              <strong><?= h($m['from']) ?></strong>
              <span class="muted small"><?= $m['email'] !== '' ? h($m['email']) . ' · ' : '' ?>via <?= h($m['site_name']) ?> · <?= h(date('M j, Y g:ia', strtotime($m['created_at'] . ' UTC'))) ?></span>
            </div>
          </div>
          <dl class="msg-fields">
            <?php foreach ($m['data'] as $k => $v): ?>
              <dt><?= h(ucfirst((string) $k)) ?></dt>
              <dd><?php
                $v = (string) $v;
                echo filter_var($v, FILTER_VALIDATE_EMAIL) ? '<a href="mailto:' . h($v) . '">' . h($v) . '</a>' : nl2br(h($v));
              ?></dd>
            <?php endforeach; ?>
          </dl>
          <div class="msg-actions">
            <?php if ($m['email'] !== ''): ?>
              <a class="btn btn-accent" href="mailto:<?= h($m['email']) ?>?subject=<?= rawurlencode('Re: ' . $m['subject']) ?>"><?= icon('mail') ?> Reply by email</a>
            <?php endif; ?>
            <form method="post" class="inline">
              <?= csrf_field() ?><input type="hidden" name="action" value="unread"><input type="hidden" name="message_id" value="<?= (int) $m['id'] ?>">
              <button class="btn btn-ghost btn-sm">Mark unread</button>
            </form>
            <form method="post" class="inline" data-confirm="Delete this message? This can't be undone.">
              <?= csrf_field() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="message_id" value="<?= (int) $m['id'] ?>">
              <button class="btn btn-ghost btn-sm btn-danger-text">Delete</button>
            </form>
          </div>
        </article>
      <?php endforeach; ?>
    </div>
  </div>
  <script>window.RC_INBOX = { csrf: <?= json_encode(csrf_token()) ?>, url: <?= json_encode(base_url('inbox.php')) ?> };</script>
  <script src="<?= h(base_url('assets/inbox.js')) ?>" defer></script>
  <?php endif; ?>
</div>
<?php page_footer();
