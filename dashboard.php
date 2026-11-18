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
    } elseif ((int) $count->fetchColumn() >= max_sites($user)) {
        $error = 'Your ' . user_plan($user)['name'] . ' plan includes ' . max_sites($user) . ' website' . (max_sites($user) === 1 ? '' : 's') . '. Upgrade on the Billing page for more.';
    } else {
        db()->prepare('INSERT INTO sites (user_id, name, slug, brief) VALUES (?, ?, ?, ?)')
            ->execute([$user['id'], $name, unique_slug($name), $brief]);
        redirect('editor.php?id=' . db()->lastInsertId() . '&build=1');
    }
}

$stmt = db()->prepare(
    'SELECT s.*, (SELECT COUNT(*) FROM submissions m WHERE m.site_id = s.id AND m.is_read = 0) AS unread,
            (SELECT COALESCE(SUM(views), 0) FROM page_views p WHERE p.site_id = s.id AND p.day >= date(\'now\', \'-29 days\')) AS views30
     FROM sites s WHERE s.user_id = ? ORDER BY s.updated_at DESC'
);
$stmt->execute([$user['id']]);
$sites = $stmt->fetchAll();
$used = ai_uses_this_month((int) $user['id']);
$limit = ai_limit($user);
$plan = user_plan($user);
$ids = array_map(fn($s) => (int) $s['id'], $sites);
$daily = visits_by_day($ids, 60);
$thisMonth = $lastMonth = 0;
foreach ($daily as $days) {
    $thisMonth += array_sum(array_slice($days, 30));
    $lastMonth += array_sum(array_slice($days, 0, 30));
}
$canBuild = count($sites) < max_sites($user);

// Recent activity: form messages, AI and hand edits, domains connected.
$activity = [];
if ($ids) {
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $q = db()->prepare("SELECT m.created_at, m.data, s.name, s.id FROM submissions m JOIN sites s ON s.id = m.site_id
                        WHERE m.site_id IN ($marks) ORDER BY m.id DESC LIMIT 5");
    $q->execute($ids);
    foreach ($q->fetchAll() as $r) {
        $d = json_decode((string) $r['data'], true) ?: [];
        $from = trim((string) ($d['name'] ?? $d['Name'] ?? $d['email'] ?? $d['Email'] ?? ''));
        $activity[] = ['when' => $r['created_at'], 'icon' => 'inbox', 'text' => 'New message' . ($from !== '' ? ' from ' . $from : ''),
            'site' => $r['name'], 'url' => base_url('inbox.php?id=' . $r['id'])];
    }
    $q = db()->prepare("SELECT v.created_at, v.instruction, s.name, s.id FROM versions v JOIN sites s ON s.id = v.site_id
                        WHERE v.site_id IN ($marks) ORDER BY v.id DESC LIMIT 5");
    $q->execute($ids);
    foreach ($q->fetchAll() as $r) {
        $what = trim((string) $r['instruction']);
        $text = $what === 'Edited the code by hand' ? 'You edited the code'
            : (str_starts_with($what, 'Copied from') ? $what : 'AI updated your site' . ($what !== '' ? ': “' . mb_strimwidth($what, 0, 60, '…') . '”' : ''));
        $activity[] = ['when' => $r['created_at'], 'icon' => 'sparkles', 'text' => $text, 'site' => $r['name'],
            'url' => base_url('editor.php?id=' . $r['id'])];
    }
    foreach ($sites as $s) {
        if (!empty($s['domain_connected_at']) && !empty($s['custom_domain'])) {
            $activity[] = ['when' => $s['domain_connected_at'], 'icon' => 'globe', 'text' => $s['custom_domain'] . ' was connected',
                'site' => $s['name'], 'url' => base_url('editor.php?id=' . $s['id'])];
        }
    }
    usort($activity, fn($a, $b) => strcmp($b['when'], $a['when']));
    $activity = array_slice($activity, 0, 6);
}

$tz = new DateTimeZone((string) cfg('timezone', 'America/New_York'));
$hour = (int) (new DateTimeImmutable('now', $tz))->format('G');
$greeting = $hour < 12 ? 'Good morning' : ($hour < 18 ? 'Good afternoon' : 'Good evening');
$first = strtok((string) $user['name'], ' ') ?: 'there';
$change = $lastMonth > 0 ? (int) round(($thisMonth - $lastMonth) / $lastMonth * 100) : null;

page_header('My sites');
?>
<div class="pt">
  <div class="dash-top">
    <section class="card hello">
      <p class="hello-kicker"><?= h($greeting) ?>,</p>
      <h1><?= h($first) ?> <span class="wave" aria-hidden="true">👋</span></h1>
      <p class="muted">
        <?php if (!$sites): ?>
          Let's build your first website. It takes about a minute.
        <?php elseif ($thisMonth === 0): ?>
          Your websites haven't had visitors in the last 30 days yet. Share your link to get started.
        <?php else: ?>
          Your website<?= count($sites) > 1 ? 's' : '' ?> had <strong><?= number_format($thisMonth) ?></strong> visit<?= $thisMonth === 1 ? '' : 's' ?> in the last 30 days<?php if ($change !== null && $change !== 0): ?>, <?= $change > 0 ? 'up' : 'down' ?> <?= abs($change) ?>%<?php endif; ?>.
        <?php endif; ?>
      </p>
    </section>
    <section class="card usage">
      <?= usage_ring($used, $limit) ?>
      <div>
        <p class="kicker"><?= h($plan['name']) ?> plan</p>
        <p class="usage-title">AI designs &amp; edits</p>
        <p class="muted small"><?= max(0, $limit - $used) ?> left · resets <?= h((new DateTimeImmutable('first day of next month', $tz))->format('M j')) ?></p>
        <a class="link-accent" href="<?= h(base_url('billing.php')) ?>"><?= plan_key($user) === 'free' ? 'Upgrade' : 'Need more?' ?></a>
      </div>
    </section>
  </div>

  <?php if ($user['subscription_status'] === 'past_due'): ?>
    <div class="notice">⚠️ Your last payment didn't go through. <a href="<?= h(base_url('billing.php')) ?>">Update your card</a> to keep your plan.</div>
  <?php endif; ?>
  <?php if (!is_verified($user)): ?>
    <div class="notice">
      <span>📧 Please confirm your email (<?= h($user['email']) ?>) so you can publish your websites.</span>
      <form method="post" action="<?= h(base_url('verify.php')) ?>" class="inline"><?= csrf_field() ?><button class="btn btn-sm btn-ghost">Resend link</button></form>
    </div>
  <?php endif; ?>

  <?php if (referrals_enabled()): ?>
    <div class="promo" data-dismiss-key="rc-hide-referral">
      <span class="promo-ico"><?= icon('gift') ?></span>
      <div><strong>Give a friend a free month, get one free</strong><span>Share your link. You both win when they sign up.</span></div>
      <a class="btn btn-sm btn-accent" href="<?= h(base_url('referrals.php')) ?>">Share link</a>
      <button type="button" class="promo-x" data-dismiss aria-label="Hide this"><?= icon('x') ?></button>
    </div>
  <?php endif; ?>

  <?php $hosting = user_hosting_domains((int) $user['id']); if ($hosting): ?>
    <div class="section-head"><h2>Your domains and email</h2></div>
    <div class="domain-grid">
      <?php foreach ($hosting as $d): ?>
        <a class="card domain-card" href="<?= h(base_url('domain.php?id=' . $d['id'])) ?>">
          <?= icon('globe') ?><span><strong><?= h($d['domain']) ?></strong><small class="muted">Manage email accounts and DNS records</small></span>
        </a>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>

  <div class="section-head">
    <h2>Your websites</h2>
    <span class="muted small"><?= count($sites) ?> of <?= max_sites($user) ?> on your plan</span>
  </div>
  <div class="sites">
    <?php foreach ($sites as $s): [$mod, $label] = site_status($s); $live = $s['published_version_id'] && empty($s['taken_down']); ?>
      <article class="card site" data-site="<?= (int) $s['id'] ?>">
        <a class="site-thumb" href="<?= h(base_url('editor.php?id=' . $s['id'])) ?>" tabindex="-1" aria-hidden="true">
          <?php if ($s['current_version_id']): ?>
            <iframe src="<?= h(base_url('preview.php?id=' . $s['id'])) ?>" loading="lazy" sandbox="allow-scripts" tabindex="-1" title=""></iframe>
          <?php else: ?>
            <span class="thumb-empty"><?= icon('sparkles') ?><span>Not built yet</span></span>
          <?php endif; ?>
          <span class="status status-<?= h($mod) ?>"><i></i><?= h($label) ?></span>
        </a>
        <div class="site-body">
          <div class="site-info">
            <h3><a href="<?= h(base_url('editor.php?id=' . $s['id'])) ?>"><?= h($s['name']) ?></a></h3>
            <span class="muted small site-url"><?= h(preg_replace('#^https?://#', '', public_url($s))) ?></span>
          </div>
          <div class="site-visits">
            <?= sparkline(array_slice($daily[(int) $s['id']], 30)) ?>
            <span class="muted small"><?= number_format((int) $s['views30']) ?> visits · 30d</span>
          </div>
        </div>
        <?php if ($s['unread']): ?>
          <a class="site-msgs" href="<?= h(base_url('inbox.php?id=' . $s['id'])) ?>"><?= icon('inbox') ?> <?= (int) $s['unread'] ?> new message<?= $s['unread'] > 1 ? 's' : '' ?></a>
        <?php endif; ?>
        <div class="site-actions">
          <a class="btn btn-sm" href="<?= h(base_url('editor.php?id=' . $s['id'])) ?>"><?= icon('pencil') ?> Edit</a>
          <?php if ($mod === 'draft' || $mod === 'changes'): ?>
            <button type="button" class="btn btn-sm btn-accent" data-publish="<?= (int) $s['id'] ?>" <?= $s['current_version_id'] ? '' : 'disabled' ?>><?= icon('rocket') ?> Publish</button>
          <?php elseif ($live): ?>
            <a class="btn btn-sm btn-ghost" href="<?= h(public_url($s)) ?>" target="_blank" rel="noopener"><?= icon('external') ?> View site</a>
          <?php endif; ?>
          <details class="menu">
            <summary class="btn btn-sm btn-ghost" aria-label="More actions for <?= h($s['name']) ?>"><?= icon('more') ?></summary>
            <div class="menu-list">
              <?php if ($live && $mod === 'changes'): ?><a href="<?= h(public_url($s)) ?>" target="_blank" rel="noopener"><?= icon('external') ?> View live site</a><?php endif; ?>
              <a href="<?= h(base_url('inbox.php?id=' . $s['id'])) ?>"><?= icon('inbox') ?> Messages</a>
              <?php if ($s['current_version_id']): ?><a href="<?= h(base_url('download.php?id=' . $s['id'])) ?>"><?= icon('download') ?> Download HTML</a><?php endif; ?>
              <a href="<?= h(base_url('editor.php?id=' . $s['id'])) ?>#settings"><?= icon('settings') ?> Site settings</a>
            </div>
          </details>
        </div>
      </article>
    <?php endforeach; ?>

    <button type="button" class="card site-new" id="new-site" data-builder-open <?= $canBuild ? '' : 'disabled' ?>>
      <span class="plus"><?= icon('plus') ?></span>
      <strong><?= $sites ? 'Build a new website' : 'Build your first website' ?></strong>
      <span class="muted"><?= $canBuild ? 'Describe your business. The AI does the rest.' : 'Your plan\'s websites are all in use. Upgrade on Billing for more.' ?></span>
    </button>
  </div>

  <?php if ($activity): ?>
    <section class="card activity">
      <h2>Recent activity</h2>
      <ol>
        <?php foreach ($activity as $a): ?>
          <li><span class="act-ico"><?= icon($a['icon']) ?></span>
            <a href="<?= h($a['url']) ?>"><strong><?= h($a['text']) ?></strong><small class="muted"><?= h($a['site']) ?> · <?= h(time_ago($a['when'])) ?></small></a></li>
        <?php endforeach; ?>
      </ol>
    </section>
  <?php endif; ?>
</div>

<dialog class="builder" id="builder" aria-labelledby="builder-title" <?= $error ? 'data-open-on-load' : '' ?>>
  <form method="post" id="builder-form">
    <?= csrf_field() ?>
    <div class="builder-head">
      <h2 id="builder-title">Build a new website</h2>
      <button type="button" class="promo-x" data-builder-close aria-label="Close"><?= icon('x') ?></button>
    </div>
    <ol class="steps" aria-label="Steps"><li class="on">Name</li><li>About</li><li>Style</li></ol>
    <?php if ($error): ?><p class="error"><?= h($error) ?></p><?php endif; ?>

    <section class="step" data-step="1">
      <label>What's your business called?
        <input name="name" required maxlength="80" placeholder="e.g. Maple Street Bakery" value="<?= h(post_str('name', 80)) ?>"></label>
    </section>
    <section class="step" data-step="2" hidden>
      <label>Describe your business and the website you want
        <textarea name="brief" required rows="6" maxlength="4000" placeholder="e.g. We're a family-owned bakery in Columbia, MD. We sell sourdough, pastries and custom cakes. Include our menu, a section about our story, our hours (Tue–Sun 7am–3pm), and a form to order custom cakes."><?= h(post_str('brief', 4000)) ?></textarea>
      </label>
      <div class="hint-row">
        <button type="button" class="chip" data-add="Include a services section with prices.">+ Services &amp; prices</button>
        <button type="button" class="chip" data-add="Include a contact form.">+ Contact form</button>
        <button type="button" class="chip" data-add="Include our hours and location.">+ Hours &amp; location</button>
        <button type="button" class="chip" data-add="Include a frequently asked questions section.">+ FAQ</button>
      </div>
      <p class="muted small">The more detail, the better your site.</p>
    </section>
    <section class="step" data-step="3" hidden>
      <p class="step-q">Pick a style. You can change anything later.</p>
      <div class="styles">
        <?php foreach ([
            'warm' => ['Warm & friendly', 'Soft colors, rounded shapes, welcoming', 'Make it warm and friendly, with soft colors and rounded shapes.'],
            'modern' => ['Modern & minimal', 'Clean, lots of white space', 'Make it look modern and minimal, with lots of white space.'],
            'bold' => ['Bold & colorful', 'Big type, strong colors', 'Make it bold and colorful, with big headings and strong colors.'],
            'classic' => ['Classic & elegant', 'Serif type, refined', 'Make it classic and elegant, with serif headings and a refined look.'],
        ] as $key => [$name, $desc, $text]): ?>
          <label class="style-card style-<?= $key ?>">
            <input type="radio" name="style" value="<?= h($text) ?>" <?= $key === 'warm' ? 'checked' : '' ?>>
            <span class="style-swatch" aria-hidden="true"></span>
            <strong><?= h($name) ?></strong><small class="muted"><?= h($desc) ?></small>
          </label>
        <?php endforeach; ?>
      </div>
    </section>
    <div class="building" hidden>
      <span class="spinner" aria-hidden="true"></span>
      <strong>Building your website…</strong>
      <span class="muted">This usually takes under a minute.</span>
    </div>

    <div class="builder-foot">
      <button type="button" class="btn btn-ghost" data-step-back hidden>Back</button>
      <span class="spacer"></span>
      <button type="button" class="btn" data-step-next>Next</button>
      <button type="submit" class="btn btn-accent" data-step-build hidden <?= $used >= $limit ? 'disabled' : '' ?>><?= icon('sparkles') ?> Build my website</button>
    </div>
    <?php if ($used >= $limit): ?><p class="error small">You've used this month's AI designs and edits. <a href="<?= h(base_url('billing.php')) ?>">Upgrade</a> for more.</p><?php endif; ?>
  </form>
</dialog>
<script>window.RC_DASH = { csrf: <?= json_encode(csrf_token()) ?>, siteApi: <?= json_encode(base_url('api/site.php')) ?> };</script>
<script src="<?= h(base_url('assets/dashboard.js')) ?>"></script>
<?php page_footer();
