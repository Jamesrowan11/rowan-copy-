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
$daily = visits_by_day([(int) $site['id']], 30)[(int) $site['id']];

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
    'canEditCode' => can_edit_code($user),
    'liveUrl' => $site['published_version_id'] && empty($site['taken_down']) ? public_url($site) : '',
    'publicUrl' => public_url($site),
    'autoBuild' => !$site['current_version_id'] && isset($_GET['build']),
    'urls' => [
        'generate' => base_url('api/generate.php'),
        'site' => base_url('api/site.php'),
        'dashboard' => base_url('dashboard.php'),
    ],
];

page_header('Editing ' . $site['name'], 'editor-page');
$targetIp = hosting()->targetIp();
?>
<div class="ed">
  <header class="ed-head">
    <a class="ed-back" href="<?= h(base_url('dashboard.php')) ?>" aria-label="Back to My sites"><?= icon('arrow-left') ?></a>
    <div class="ed-title">
      <h1 id="site-name"><?= h($site['name']) ?></h1>
      <div class="ed-meta">
        <span id="status-badge" class="status"></span>
        <a id="live-link" class="small" href="<?= h(public_url($site)) ?>" target="_blank" rel="noopener"><?= h(preg_replace('#^https?://#', '', public_url($site))) ?></a>
      </div>
    </div>
    <div class="ed-actions">
      <details class="menu menu-down">
        <summary class="btn btn-ghost" aria-label="More actions"><?= icon('more') ?></summary>
        <div class="menu-list">
          <a id="menu-live" href="<?= h(public_url($site)) ?>" target="_blank" rel="noopener"><?= icon('external') ?> View live site</a>
          <a href="<?= h(base_url('inbox.php?id=' . $site['id'])) ?>"><?= icon('inbox') ?> Messages<?= $unread ? ' (' . $unread . ' new)' : '' ?></a>
          <a href="<?= h(base_url('download.php?id=' . $site['id'])) ?>"><?= icon('download') ?> Download HTML</a>
          <a href="#" id="unpublish-btn" hidden><?= icon('x') ?> Take offline</a>
        </div>
      </details>
      <button id="publish-btn" class="btn btn-accent ed-publish"><?= icon('rocket') ?> <span>Publish</span></button>
    </div>
  </header>

  <div class="ed-body">
    <aside class="panel card">
      <div class="tabs" role="tablist" aria-label="Editor">
        <button class="tab active" role="tab" data-tab="chat">Design</button>
        <button class="tab" role="tab" data-tab="images">Images</button>
        <button class="tab" role="tab" data-tab="history">History</button>
        <button class="tab" role="tab" data-tab="stats">Visitors</button>
        <button class="tab" role="tab" data-tab="settings">Settings</button>
      </div>

      <section class="tab-body chat" data-body="chat">
        <div id="chat-log" class="chat-log" aria-live="polite"></div>
        <div id="progress" class="bubble bubble-ai typing" hidden>
          <span class="bubble-ico"><?= icon('sparkles') ?></span>
          <div><strong id="progress-title">Designing your site…</strong><span id="progress-detail" class="muted small">This usually takes 1–3 minutes.</span><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></div>
        </div>
        <p id="chat-error" class="error" hidden></p>
        <form id="chat-form" class="chat-form">
          <div class="hint-row">
            <button type="button" class="chip" data-add="Make the design more modern.">More modern</button>
            <button type="button" class="chip" data-add="Add a testimonials section with placeholders I can fill in.">+ Testimonials</button>
            <button type="button" class="chip" data-add="Add a photo gallery using my uploaded images.">+ Gallery</button>
            <button type="button" class="chip" data-add="Add our opening hours and location.">+ Hours</button>
            <button type="button" class="chip" data-add="Change the color scheme to ">Colors…</button>
          </div>
          <label for="instruction" class="sr-only">Tell the AI what to change</label>
          <div class="chat-input">
            <textarea id="instruction" rows="2" maxlength="4000" placeholder="Tell the AI what to change…"></textarea>
            <button id="send-btn" class="btn btn-accent" aria-label="Update my site"><?= icon('sparkles') ?><span>Update</span></button>
          </div>
          <p class="muted small chat-foot"><span id="usage"></span> · <a href="#" id="rebuild-link">Start over with a fresh design</a> · Enter to send, Shift+Enter for a new line</p>
        </form>
      </section>

      <section class="tab-body" data-body="images" hidden>
        <form id="upload-form" class="dropzone">
          <label class="drop" id="drop">
            <?= icon('download', 'ico drop-ico') ?>
            <strong>Drop a photo here or click to choose</strong>
            <span class="muted small">JPG, PNG, GIF or WebP · then ask the AI to use it ("use the storefront photo in the header")</span>
            <input type="file" id="image-file" accept="image/jpeg,image/png,image/gif,image/webp" class="sr-only">
          </label>
          <div class="upload-row">
            <input id="image-label" maxlength="120" placeholder="Describe it, e.g. Our logo" aria-label="Describe the image">
            <button class="btn btn-sm" id="upload-btn">Upload</button>
          </div>
          <p id="upload-name" class="muted small" hidden></p>
        </form>
        <ul id="image-list" class="image-grid"></ul>
      </section>

      <section class="tab-body" data-body="history" hidden>
        <p class="muted small">Every change is saved. Restore any earlier version; nothing is lost.</p>
        <ol id="history-list" class="timeline"></ol>
      </section>

      <section class="tab-body" data-body="stats" hidden>
        <div class="stat-row">
          <div class="stat"><strong><?= number_format((int) $views['today']) ?></strong><span>today</span></div>
          <div class="stat"><strong><?= number_format((int) $views['week']) ?></strong><span>last 7 days</span></div>
          <div class="stat"><strong><?= number_format((int) $views['month']) ?></strong><span>last 30 days</span></div>
        </div>
        <div class="visits-chart"><?= visits_chart($daily) ?></div>
        <p class="muted small">Page visits to your published site over the last 30 days. Search engines and bots aren't counted, and no cookies are used.</p>
      </section>

      <section class="tab-body" data-body="settings" hidden>
        <form id="settings-form">
          <label>Site name <input name="name" maxlength="80" value="<?= h($site['name']) ?>" required></label>
          <label>Web address
            <div class="slug-field"><span class="muted small"><?= h(base_url('s/')) ?></span><input name="slug" maxlength="40" value="<?= h($site['slug']) ?>" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"></div>
          </label>
          <label>About your business (used for fresh designs)
            <textarea name="brief" rows="5" maxlength="4000"><?= h($site['brief']) ?></textarea>
          </label>
          <button class="btn btn-sm">Save settings</button>
        </form>

        <h2 class="set-h">Use your own domain</h2>
        <p class="muted small">Use a domain you own (like <em>mybakery.com</em>) instead of the Rowan Copy address.</p>
        <?php if (!plan_feature($user, 'custom_domain') && !$site['custom_domain']): ?>
          <p class="notice small">Your own domain is included in paid plans. <a href="<?= h(base_url('billing.php')) ?>">See plans</a></p>
        <?php endif; ?>
        <form id="domain-form" class="inline-form">
          <label class="sr-only" for="domain-input">Domain</label>
          <input id="domain-input" name="domain" maxlength="253" placeholder="mybakery.com" value="<?= h($site['custom_domain']) ?>">
          <button class="btn btn-sm">Save</button>
        </form>
        <div id="domain-help" <?= $site['custom_domain'] ? '' : 'hidden' ?>>
          <?php if ($targetIp !== ''): ?>
            <ol class="dns-checklist">
              <li><strong>Open your domain's DNS settings</strong><span class="muted small">At the company where you bought it (GoDaddy, Namecheap, Name.com…).</span></li>
              <li><strong>Add two A records</strong>
                <span class="dns-rec"><code>A</code> <code>@</code> → <code><?= h($targetIp) ?></code></span>
                <span class="dns-rec"><code>A</code> <code>www</code> → <code><?= h($targetIp) ?></code></span></li>
              <li><strong>Delete other A / AAAA records</strong><span class="muted small">for <code>@</code> and <code>www</code>.</span></li>
              <li><strong>Check, then wait a little</strong><span class="muted small">Changes can take a few hours to reach everyone; your site goes live on the domain once the check passes.</span></li>
            </ol>
          <?php else: ?>
            <p class="muted small"><strong>Next steps:</strong> contact us and we'll send you the DNS settings for your domain.</p>
          <?php endif; ?>
          <div class="dns-check">
            <button type="button" id="connect-domain" class="btn btn-sm btn-ghost"><?= $site['domain_connected_at'] ? 'Check again' : 'Check my DNS' ?></button>
            <span id="domain-status" class="domain-status <?= $site['domain_connected_at'] ? 'ok' : '' ?>"><?= $site['domain_connected_at'] ? '✓ Connected' : 'Not connected yet' ?></span>
          </div>
        </div>
        <p class="muted small">Don't have a domain yet? <a href="<?= h(base_url('domains.php')) ?>">Find one</a></p>

        <h2 class="set-h">Tools</h2>
        <div class="tool-list">
          <a class="btn btn-ghost btn-sm" href="<?= h(base_url('download.php?id=' . $site['id'])) ?>"><?= icon('download') ?> Download HTML</a>
          <button id="duplicate-site" class="btn btn-ghost btn-sm"><?= icon('plus') ?> Duplicate site</button>
          <?php if (can_edit_code($user)): ?>
            <button id="toggle-code" class="btn btn-ghost btn-sm"><?= icon('pencil') ?> Edit code (advanced)</button>
          <?php else: ?>
            <a class="btn btn-ghost btn-sm locked" href="<?= h(base_url('billing.php')) ?>" title="Editing your website's code is included on Starter and higher plans"><?= icon('shield') ?> Edit code <span class="chip">Starter and up</span></a>
          <?php endif; ?>
        </div>
        <dialog id="code-warning" class="code-warning">
          <form method="dialog">
            <h2>Before you edit your website's code</h2>
            <p>You're about to change your website's code directly. Please read this first:</p>
            <ul>
              <li><strong>A mistake can break your website</strong>, its layout, its contact form, or other features.</li>
              <li><strong>Rowan Copy support can't fix or rewrite code you change by hand.</strong> You are responsible for your edits.</li>
              <li>Saving creates a new <strong>draft</strong>. Nothing changes on your live website until you click <strong>Publish</strong>.</li>
              <li>If something goes wrong, you can go back to an earlier version from <strong>History</strong>.</li>
              <li>AI edits after a hand edit start from your edited code.</li>
            </ul>
            <label class="code-warning-ack">
              <input type="checkbox" id="code-warning-ack">
              <span>I understand, and I've read <a href="<?= h(base_url('terms.php')) ?>#editing-code" target="_blank" rel="noopener">Editing your website's code</a> in the Terms of Service.</span>
            </label>
            <div class="row-actions">
              <button value="cancel" class="btn btn-ghost btn-sm">Cancel</button>
              <button value="ok" id="code-warning-ok" class="btn btn-sm" disabled>Edit code</button>
            </div>
          </form>
        </dialog>
        <div id="code-panel" hidden>
          <p class="muted small">You're editing your website's code. Saving creates a new draft version; it goes live when you click Publish, and you can go back to an earlier version from History.</p>
          <textarea id="code" class="code-area" spellcheck="false" aria-label="Website code"></textarea>
          <button id="save-code" class="btn btn-sm">Save code</button>
        </div>

        <h2 class="set-h danger-h">Danger zone</h2>
        <button id="delete-site" class="btn btn-danger btn-sm">Delete this website</button>
      </section>
    </aside>

    <section class="preview card">
      <div class="preview-bar">
        <div class="device-toggle" role="radiogroup" aria-label="Preview size">
          <button class="dev active" role="radio" aria-checked="true" data-w="100%" title="Desktop" aria-label="Desktop"><?= icon('monitor') ?></button>
          <button class="dev" role="radio" aria-checked="false" data-w="768px" title="Tablet" aria-label="Tablet"><?= icon('tablet') ?></button>
          <button class="dev" role="radio" aria-checked="false" data-w="390px" title="Phone" aria-label="Phone"><?= icon('phone') ?></button>
        </div>
        <div class="view-toggle" role="radiogroup" aria-label="Version">
          <button class="view active" role="radio" aria-checked="true" data-view="draft"><i class="dot dot-draft"></i>Draft</button>
          <button class="view" role="radio" aria-checked="false" data-view="live" id="view-live"><i class="dot dot-live"></i>Live</button>
        </div>
      </div>
      <div class="frame-wrap">
        <div class="frame" id="frame">
          <div class="frame-bar"><i></i><i></i><i></i><span id="frame-url"><?= h(preg_replace('#^https?://#', '', public_url($site))) ?></span></div>
          <!-- sandbox without allow-same-origin: the customer's page can't touch Rowan Copy -->
          <iframe id="preview" sandbox="allow-scripts allow-popups" title="Website preview (draft)"></iframe>
          <iframe id="live-frame" sandbox="allow-scripts allow-popups" title="Website preview (live)" hidden></iframe>
          <div id="empty-state" class="empty-state" hidden>
            <span class="plus"><?= icon('sparkles') ?></span>
            <h2>Your site will appear here</h2>
            <p class="muted">Click <strong>Update</strong> to create the first design.</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>
<script>window.RC = <?= json_encode($state, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
<script src="<?= h(base_url('assets/editor.js')) ?>"></script>
<?php page_footer();
