<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();
$site = owned_site((int) ($_GET['id'] ?? 0), $user);

$html = '';
if ($site['current_version_id']) {
    $stmt = db()->prepare('SELECT html FROM versions WHERE id = ?');
    $stmt->execute([$site['current_version_id']]);
    $html = render_site_html((string) $stmt->fetchColumn(), $site);
}

$stmt = db()->prepare('SELECT id, instruction, created_at FROM versions WHERE site_id = ? ORDER BY id DESC LIMIT 50');
$stmt->execute([$site['id']]);
$versions = $stmt->fetchAll();

$images = array_map(fn ($i) => $i + ['url' => image_url($i)], site_images((int) $site['id']));

$unread = db()->prepare('SELECT COUNT(*) FROM submissions WHERE site_id = ? AND is_read = 0');
$unread->execute([$site['id']]);
$unread = (int) $unread->fetchColumn();

$views = db()->prepare("SELECT
    COALESCE(SUM(CASE WHEN day = date('now') THEN views END), 0) AS today,
    COALESCE(SUM(CASE WHEN day >= date('now', '-6 days') THEN views END), 0) AS week,
    COALESCE(SUM(views), 0) AS month
    FROM page_views WHERE site_id = ? AND day >= date('now', '-29 days')");
$views->execute([$site['id']]);
$views = $views->fetch();
$appHost = (string) parse_url((string) cfg('base_url'), PHP_URL_HOST);

$state = [
    'siteId' => (int) $site['id'],
    'csrf' => csrf_token(),
    'html' => $html,
    'currentVersionId' => (int) $site['current_version_id'],
    'publishedVersionId' => (int) $site['published_version_id'],
    'versions' => $versions,
    'images' => $images,
    'used' => ai_uses_this_month((int) $user['id']),
    'verified' => is_verified($user),
    'limit' => ai_limit($user),
    'autoBuild' => !$site['current_version_id'] && isset($_GET['build']),
    'urls' => [
        'generate' => base_url('api/generate.php'),
        'site' => base_url('api/site.php'),
        'dashboard' => base_url('dashboard.php'),
    ],
];

page_header('Editing ' . $site['name'], 'editor-page');
?>
<div class="editor">
  <aside class="panel">
    <div class="panel-head">
      <a href="<?= h(base_url('dashboard.php')) ?>" class="back">← My sites</a>
      <h1 id="site-name"><?= h($site['name']) ?></h1>
      <div class="status-row">
        <span id="status-badge" class="badge"></span>
        <a id="live-link" class="small" href="<?= h(public_url($site)) ?>" target="_blank" rel="noopener"><?= h(public_url($site)) ?></a>
      </div>
      <div class="btn-row">
        <button id="publish-btn" class="btn">Publish</button>
        <button id="unpublish-btn" class="btn btn-ghost btn-sm" hidden>Take offline</button>
      </div>
    </div>

    <div class="tabs" role="tablist">
      <button class="tab active" data-tab="chat">Design</button>
      <button class="tab" data-tab="images">Images</button>
      <button class="tab" data-tab="history">History</button>
      <button class="tab" data-tab="stats">Visitors</button>
      <button class="tab" data-tab="settings">Settings</button>
    </div>

    <section class="tab-body" data-body="chat">
      <form id="chat-form">
        <label for="instruction">What would you like to change?</label>
        <textarea id="instruction" rows="4" maxlength="4000" placeholder="e.g. Make the header dark green, add a section with our three service packages, and use my logo at the top."></textarea>
        <div class="hint-row">
          <span class="chip" data-add="Make the design more modern.">More modern</span>
          <span class="chip" data-add="Add a testimonials section with placeholders I can fill in.">+ Testimonials</span>
          <span class="chip" data-add="Add a photo gallery using my uploaded images.">+ Gallery</span>
          <span class="chip" data-add="Change the color scheme to ">Colors…</span>
        </div>
        <button id="send-btn" class="btn btn-block">Update my site</button>
        <p class="muted small"><span id="usage"></span> · <a href="#" id="rebuild-link">Start over with a fresh design</a></p>
      </form>
      <div id="progress" class="progress" hidden>
        <div class="spinner" aria-hidden="true"></div>
        <div><strong id="progress-title">Designing your site…</strong><br><span id="progress-detail" class="muted small">This usually takes 1–3 minutes.</span></div>
      </div>
      <p id="chat-error" class="error" hidden></p>
      <a class="inbox-link" href="<?= h(base_url('inbox.php?id=' . $site['id'])) ?>">📬 Messages from your site<?= $unread ? ' <span class="badge badge-msg">' . $unread . ' new</span>' : '' ?></a>
    </section>

    <section class="tab-body" data-body="images" hidden>
      <p class="muted small">Upload your logo and photos, then ask the designer to use them (for example "use the storefront photo in the header").</p>
      <form id="upload-form">
        <input type="file" id="image-file" accept="image/jpeg,image/png,image/gif,image/webp" required>
        <input id="image-label" maxlength="120" placeholder="Describe it, e.g. Our logo">
        <button class="btn btn-sm">Upload</button>
      </form>
      <ul id="image-list" class="image-list"></ul>
    </section>

    <section class="tab-body" data-body="history" hidden>
      <p class="muted small">Every change is saved. Restore any earlier version; nothing is lost.</p>
      <ul id="history-list" class="history-list"></ul>
    </section>

    <section class="tab-body" data-body="stats" hidden>
      <div class="stat-row">
        <div class="stat"><strong><?= number_format((int) $views['today']) ?></strong><span>today</span></div>
        <div class="stat"><strong><?= number_format((int) $views['week']) ?></strong><span>last 7 days</span></div>
        <div class="stat"><strong><?= number_format((int) $views['month']) ?></strong><span>last 30 days</span></div>
      </div>
      <p class="muted small">Page visits to your published site. Search engines and bots aren't counted, and no cookies are used.</p>
    </section>

    <section class="tab-body" data-body="settings" hidden>
      <form id="settings-form">
        <label>Site name <input name="name" maxlength="80" value="<?= h($site['name']) ?>" required></label>
        <label>Web address
          <div class="slug-field"><span class="muted small"><?= h(base_url('s/')) ?></span><input name="slug" maxlength="40" value="<?= h($site['slug']) ?>" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"></div>
        </label>
        <label>About your business (used for fresh designs)
          <textarea name="brief" rows="6" maxlength="4000"><?= h($site['brief']) ?></textarea>
        </label>
        <button class="btn">Save settings</button>
      </form>
      <hr>
      <h2>Your own domain</h2>
      <p class="muted small">Use a domain you own (like <em>mybakery.com</em>) instead of the Rowan Copy address.</p>
      <?php if (!plan_feature($user, 'custom_domain') && !$site['custom_domain']): ?>
        <p class="notice small">Your own domain is included in paid plans. <a href="<?= h(base_url('billing.php')) ?>">See plans</a></p>
      <?php endif; ?>
      <form id="domain-form">
        <label>Domain <input name="domain" maxlength="253" placeholder="mybakery.com" value="<?= h($site['custom_domain']) ?>"></label>
        <button class="btn btn-sm">Save domain</button>
      </form>
      <div id="domain-help" class="muted small" <?= $site['custom_domain'] ? '' : 'hidden' ?>>
        <p><strong>Next steps:</strong> at the company where you bought the domain, open its DNS settings and
        <?php if (cfg('server_ip')): ?>
          add an <strong>A record</strong> for <code>@</code> and for <code>www</code> pointing to <code><?= h((string) cfg('server_ip')) ?></code>.
        <?php else: ?>
          add a <strong>CNAME record</strong> for <code>www</code> pointing to <code><?= h($appHost) ?></code>.
        <?php endif; ?>
        Then click <strong>Connect</strong>. DNS changes can take a few hours to reach everyone.</p>
        <p id="domain-status" class="domain-status <?= $site['domain_connected_at'] ? 'ok' : '' ?>"><?= $site['domain_connected_at'] ? '✓ Connected' : 'Not connected yet' ?></p>
        <button type="button" id="connect-domain" class="btn btn-sm"><?= $site['domain_connected_at'] ? 'Check again' : 'Connect' ?></button>
      </div>
      <p class="muted small">Don't have a domain yet? <a href="<?= h(base_url('domains.php')) ?>">Find one</a></p>
      <hr>
      <h2>Tools</h2>
      <div class="row-actions">
        <a class="btn btn-ghost btn-sm" href="<?= h(base_url('download.php?id=' . $site['id'])) ?>">Download HTML</a>
        <button id="duplicate-site" class="btn btn-ghost btn-sm">Duplicate site</button>
        <button id="toggle-code" class="btn btn-ghost btn-sm">Edit code (advanced)</button>
      </div>
      <div id="code-panel" hidden>
        <p class="muted small">For people who know HTML. Saving creates a new version you can undo from History.</p>
        <textarea id="code" class="code-area" spellcheck="false"></textarea>
        <button id="save-code" class="btn btn-sm">Save code</button>
      </div>
      <hr>
      <button id="delete-site" class="btn btn-danger btn-sm">Delete this website</button>
    </section>
  </aside>

  <section class="preview">
    <div class="preview-bar">
      <span class="muted small">Preview (draft)</span>
      <div class="device-toggle">
        <button class="dev active" data-w="100%">Desktop</button>
        <button class="dev" data-w="390px">Phone</button>
      </div>
    </div>
    <div class="frame-wrap">
      <!-- sandbox without allow-same-origin: the customer's page can't touch Rowan Copy -->
      <iframe id="preview" sandbox="allow-scripts allow-popups" title="Website preview"></iframe>
      <div id="empty-state" class="empty-state" hidden>
        <h2>Your site will appear here</h2>
        <p class="muted">Click <strong>Update my site</strong> to create the first design.</p>
      </div>
    </div>
  </section>
</div>
<script>window.RC = <?= json_encode($state, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
<script src="<?= h(base_url('assets/editor.js')) ?>"></script>
<?php page_footer();
