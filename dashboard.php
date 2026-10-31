<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();
$error = '';

// Create a new (empty) site, then send the customer to the editor where the AI builds it.
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $name = post_str('name', 80);
    $brief = post_str('brief', 4000);

    $count = db()->prepare('SELECT COUNT(*) FROM sites WHERE user_id = ?');
    $count->execute([$user['id']]);

    if ($name === '' || mb_strlen($brief) < 20) {
        $error = 'Please give your business name and at least a sentence or two about it.';
    } elseif ((int) $count->fetchColumn() >= 10) {
        $error = 'You can have up to 10 websites. Delete one to make room.';
    } else {
        db()->prepare('INSERT INTO sites (user_id, name, slug, brief) VALUES (?, ?, ?, ?)')
            ->execute([$user['id'], $name, unique_slug($name), $brief]);
        redirect('editor.php?id=' . db()->lastInsertId() . '&build=1');
    }
}

$stmt = db()->prepare(
    'SELECT s.*, (SELECT COUNT(*) FROM submissions m WHERE m.site_id = s.id AND m.is_read = 0) AS unread
     FROM sites s WHERE s.user_id = ? ORDER BY s.updated_at DESC'
);
$stmt->execute([$user['id']]);
$sites = $stmt->fetchAll();
$used = ai_uses_this_month((int) $user['id']);

page_header('My sites');
?>
<div class="page">
  <div class="page-head">
    <div>
      <h1>Hi, <?= h(strtok($user['name'], ' ')) ?></h1>
      <p class="muted"><?= $used ?> of <?= ai_limit() ?> AI designs and edits used this month.</p>
    </div>
  </div>

  <?php if ($sites): ?>
  <div class="site-grid">
    <?php foreach ($sites as $s): ?>
      <a class="site-card" href="<?= h(base_url('editor.php?id=' . $s['id'])) ?>">
        <div class="site-card-top">
          <strong><?= h($s['name']) ?></strong>
          <?php if ($s['published_version_id']): ?>
            <span class="badge badge-live">Live</span>
          <?php else: ?>
            <span class="badge">Draft</span>
          <?php endif; ?>
        </div>
        <span class="muted small"><?= h(site_url($s['slug'])) ?></span>
        <?php if ($s['unread']): ?><span class="badge badge-msg"><?= (int) $s['unread'] ?> new message<?= $s['unread'] > 1 ? 's' : '' ?></span><?php endif; ?>
      </a>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>

  <div class="card new-site">
    <h2><?= $sites ? 'Build another website' : 'Build your first website' ?></h2>
    <p class="muted">Tell us about your business like you'd tell a friend. The more detail, the better your site.</p>
    <?php if ($error): ?><p class="error"><?= h($error) ?></p><?php endif; ?>
    <form method="post">
      <?= csrf_field() ?>
      <label>Business name <input name="name" required maxlength="80" placeholder="e.g. Maple Street Bakery" value="<?= h(post_str('name', 80)) ?>"></label>
      <label>Describe your business and the website you want
        <textarea name="brief" required rows="7" maxlength="4000" placeholder="e.g. We're a family-owned bakery in Columbia, MD. We sell sourdough, pastries and custom cakes. I want a warm, rustic look with cream and dark brown colors. Include our menu, a section about our story, our hours (Tue–Sun 7am–3pm), and a form to order custom cakes."><?= h(post_str('brief', 4000)) ?></textarea>
      </label>
      <div class="hint-row">
        <span class="chip" data-add="Include a services section with prices.">+ Services &amp; prices</span>
        <span class="chip" data-add="Include a contact form.">+ Contact form</span>
        <span class="chip" data-add="Include our hours and location.">+ Hours &amp; location</span>
        <span class="chip" data-add="Include a frequently asked questions section.">+ FAQ</span>
        <span class="chip" data-add="Make it look modern and minimal.">+ Modern &amp; minimal</span>
        <span class="chip" data-add="Make it bold and colorful.">+ Bold &amp; colorful</span>
      </div>
      <button class="btn btn-lg" <?= $used >= ai_limit() ? 'disabled' : '' ?>>✨ Build my website</button>
      <?php if ($used >= ai_limit()): ?><p class="error small">You've reached this month's AI limit.</p><?php endif; ?>
    </form>
  </div>
</div>
<script>
document.querySelectorAll('.chip[data-add]').forEach(function (chip) {
  chip.addEventListener('click', function () {
    var ta = document.querySelector('textarea[name=brief]');
    ta.value = (ta.value.trim() + ' ' + chip.dataset.add).trim();
    ta.focus();
  });
});
</script>
<?php page_footer();
