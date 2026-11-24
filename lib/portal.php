<?php
declare(strict_types=1);

// ============================================================================
// The customer portal's look: app shell (sidebar, phone tab bar, Ctrl+K
// search, toasts) and small drawing helpers (icons, usage ring, sparklines).
// Design: the "Rowan Customer Portal" prototype made in Lovable.
// ============================================================================

/** Logged-in pages that use the portal shell (public marketing pages keep the site header). */
function is_portal_page(string $script): bool
{
    return in_array($script, ['dashboard.php', 'editor.php', 'domains.php', 'domain.php', 'email.php', 'billing.php',
        'referrals.php', 'account.php', 'inbox.php', 'admin.php', 'site-portal.php'], true)
        || str_starts_with($script, 'admin-');
}

/** Inline SVG icons (Lucide shapes, MIT). */
function icon(string $name, string $class = 'ico'): string
{
    static $paths = [
        'sites' => '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
        'inbox' => '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
        'globe' => '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
        'mail' => '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
        'card' => '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
        'gift' => '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
        'settings' => '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
        'help' => '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
        'shield' => '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
        'server' => '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
        'search' => '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
        'collapse' => '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
        'logout' => '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
        'menu' => '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
        'plus' => '<path d="M5 12h14"/><path d="M12 5v14"/>',
        'pencil' => '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
        'external' => '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
        'rocket' => '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
        'more' => '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
        'sparkles' => '<path d="M9.94 14.06A2 2 0 0 0 8.5 12.6l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 8.5A2 2 0 0 0 9.94 7.06l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13A2 2 0 0 0 15.5 8.5l6.13 1.58a.5.5 0 0 1 0 .96L15.5 12.6a2 2 0 0 0-1.44 1.46l-1.58 6.13a.5.5 0 0 1-.96 0z"/>',
        'x' => '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        'check' => '<path d="M20 6 9 17l-5-5"/>',
        'arrow-left' => '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
        'monitor' => '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
        'tablet' => '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="12" x2="12.01" y1="18" y2="18"/>',
        'phone' => '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
        'restore' => '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
        'download' => '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    ];
    return '<svg class="' . h($class) . '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
        . ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
        . ($paths[$name] ?? '') . '</svg>';
}

/** Sidebar links for this customer: [href, label, icon, badge count]. */
function portal_nav(array $user): array
{
    $unread = db()->prepare('SELECT COUNT(*) FROM submissions m JOIN sites s ON s.id = m.site_id WHERE s.user_id = ? AND m.is_read = 0');
    $unread->execute([$user['id']]);
    $items = [['dashboard.php', 'My sites', 'sites', 0], ['inbox.php', 'Inbox', 'inbox', (int) $unread->fetchColumn()]];
    $items[] = ['domains.php', 'Domains', 'globe', 0];
    if (zoho_mail_enabled()) {
        $items[] = ['email.php', 'Email', 'mail', 0];
    }
    $items[] = ['billing.php', 'Billing', 'card', 0];
    if (referrals_enabled()) {
        $items[] = ['referrals.php', 'Refer a friend', 'gift', 0];
    }
    $items[] = ['account.php', 'Settings', 'settings', 0];
    if (is_staff($user)) {
        if (plesk_enabled()) {
            $items[] = ['admin-hosting.php', 'Hosting', 'server', 0];
        }
        $items[] = ['admin.php', is_admin($user) ? 'Admin' : 'Staff', 'shield', 0];
    }
    return $items;
}

/** What the Ctrl+K palette can jump to: pages, then the customer's sites. */
function portal_palette(array $user, array $nav): array
{
    $out = [];
    foreach ($nav as [$href, $label]) {
        $out[] = ['label' => $label, 'hint' => 'Page', 'url' => base_url($href)];
    }
    $stmt = db()->prepare('SELECT id, name FROM sites WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50');
    $stmt->execute([$user['id']]);
    foreach ($stmt->fetchAll() as $s) {
        $out[] = ['label' => 'Edit ' . $s['name'], 'hint' => 'Website', 'url' => base_url('editor.php?id=' . $s['id'])];
    }
    $out[] = ['label' => 'Build a new website', 'hint' => 'Action', 'url' => base_url('dashboard.php#new-site')];
    if (support_url() !== '') {
        $out[] = ['label' => 'Help', 'hint' => 'Support', 'url' => support_url()];
    }
    return $out;
}

/** The portal's opening markup (called by page_header for portal pages). */
function portal_shell_open(array $user, string $current, ?array $flash): void
{
    $nav = portal_nav($user);
    $plan = user_plan($user);
    $initial = mb_strtoupper(mb_substr(trim((string) $user['name']) ?: (string) $user['email'], 0, 1));
    $palette = portal_palette($user, $nav);
    // The bottom tab bar on phones: the first four links, then "Menu" for the rest.
    $tabs = array_slice($nav, 0, 4);
    ?>
<a class="skip" href="#main">Skip to content</a>
<div class="shell" id="shell">
  <aside class="sidebar" id="sidebar" aria-label="Portal">
    <div class="sb-top">
      <a class="sb-brand" href="<?= h(base_url('dashboard.php')) ?>"><span class="brand-mark" aria-hidden="true">R</span><span class="sb-label"><?= h(company()['name']) ?></span></a>
      <button type="button" class="sb-close" data-sidebar-close aria-label="Close menu"><?= icon('x') ?></button>
    </div>
    <button type="button" class="sb-search" data-palette-open>
      <?= icon('search') ?><span class="sb-label">Search</span><kbd class="sb-label">Ctrl K</kbd>
    </button>
    <nav class="sb-nav" aria-label="Main">
      <?php foreach ($nav as [$href, $label, $ico, $badge]): ?>
        <a href="<?= h(base_url($href)) ?>"<?= $current === $href || ($href === 'dashboard.php' && in_array($current, ['editor.php', 'site-portal.php'], true)) ? ' aria-current="page"' : '' ?> title="<?= h($label) ?>">
          <?= icon($ico) ?><span class="sb-label"><?= h($label) ?></span>
          <?php if ($badge): ?><span class="sb-badge" aria-label="<?= $badge ?> unread"><?= $badge ?></span><?php endif; ?>
        </a>
      <?php endforeach; ?>
      <?php if (support_url() !== ''): ?>
        <a href="<?= h(support_url()) ?>" target="_blank" rel="noopener" title="Help"><?= icon('help') ?><span class="sb-label">Help</span></a>
      <?php endif; ?>
    </nav>
    <div class="sb-bottom">
      <button type="button" class="sb-collapse" data-sidebar-collapse><?= icon('collapse') ?><span class="sb-label">Collapse</span></button>
      <div class="sb-user">
        <span class="sb-avatar" aria-hidden="true"><?= h($initial) ?></span>
        <span class="sb-label sb-who"><strong><?= h($user['name'] ?: $user['email']) ?></strong><small><?= h($plan['name']) ?> plan</small></span>
        <form method="post" action="<?= h(base_url('logout.php')) ?>" class="sb-label"><?= csrf_field() ?>
          <button class="sb-logout" title="Log out" aria-label="Log out"><?= icon('logout') ?></button>
        </form>
      </div>
    </div>
  </aside>
  <div class="sb-scrim" data-sidebar-close></div>
  <div class="shell-main">
    <main id="main">
<?php if ($flash): ?>
  <div class="toast-seed" hidden data-type="<?= h($flash['type']) ?>"><?= h($flash['msg']) ?></div>
<?php endif; ?>
<?php
    $GLOBALS['RC_PORTAL'] = ['tabs' => $tabs, 'current' => $current, 'palette' => $palette];
}

/** The portal's closing markup (called by page_footer for portal pages). */
function portal_shell_close(): void
{
    $p = $GLOBALS['RC_PORTAL'];
    ?>
    </main>
    <footer class="portal-foot"><a href="<?= h(base_url('terms.php')) ?>">Terms</a> · <a href="<?= h(base_url('privacy.php')) ?>">Privacy</a> · © <?= date('Y') ?> <?= h(company()['name']) ?></footer>
  </div>
</div>
<nav class="tabbar" aria-label="Main">
  <?php foreach ($p['tabs'] as [$href, $label, $ico, $badge]): ?>
    <a href="<?= h(base_url($href)) ?>"<?= $p['current'] === $href ? ' aria-current="page"' : '' ?>>
      <?= icon($ico) ?><span><?= h($label) ?></span><?php if ($badge): ?><i class="tb-dot" aria-label="unread"></i><?php endif; ?>
    </a>
  <?php endforeach; ?>
  <button type="button" data-sidebar-open><?= icon('menu') ?><span>Menu</span></button>
</nav>
<div class="toasts" id="toasts" role="status" aria-live="polite"></div>
<dialog class="palette" id="palette" aria-label="Search">
  <div class="palette-box">
    <label class="palette-input"><?= icon('search') ?><span class="sr-only">Search pages and websites</span>
      <input type="text" id="palette-q" placeholder="Jump to a page or website…" autocomplete="off"></label>
    <ul id="palette-list" role="listbox" aria-label="Results"></ul>
    <p class="palette-hint"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</p>
  </div>
</dialog>
<script>window.RC_PALETTE = <?= json_encode($p['palette'], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
<script src="<?= h(base_url('assets/portal.js')) ?>"></script>
<?php
}

/** A ring showing used / limit (AI designs and edits this month). */
function usage_ring(int $used, int $limit, int $size = 96): string
{
    $r = 40;
    $c = 2 * M_PI * $r;
    $pct = $limit > 0 ? min(1, $used / $limit) : 1;
    $tone = $pct >= 1 ? 'var(--err)' : ($pct >= .8 ? 'var(--accent-ink)' : 'var(--accent)');
    return '<svg class="ring" width="' . $size . '" height="' . $size . '" viewBox="0 0 100 100" role="img" aria-label="'
        . $used . ' of ' . $limit . ' used">'
        . '<circle cx="50" cy="50" r="' . $r . '" fill="none" stroke="var(--line)" stroke-width="9"/>'
        . '<circle class="ring-bar" cx="50" cy="50" r="' . $r . '" fill="none" stroke="' . $tone . '" stroke-width="9" stroke-linecap="round"'
        . ' stroke-dasharray="' . round($c, 2) . '" stroke-dashoffset="' . round($c * (1 - $pct), 2) . '" transform="rotate(-90 50 50)"/>'
        . '<text x="50" y="50" text-anchor="middle" class="ring-num">' . $used . '</text>'
        . '<text x="50" y="66" text-anchor="middle" class="ring-of">of ' . $limit . '</text></svg>';
}

/** Daily visits for the last $days days, oldest first, for each site id. */
function visits_by_day(array $siteIds, int $days = 30): array
{
    $out = [];
    foreach ($siteIds as $id) {
        $out[$id] = array_fill(0, $days, 0);
    }
    if (!$siteIds) {
        return $out;
    }
    $marks = implode(',', array_fill(0, count($siteIds), '?'));
    $stmt = db()->prepare("SELECT site_id, day, views FROM page_views WHERE site_id IN ($marks) AND day >= date('now', ?)");
    $stmt->execute([...$siteIds, '-' . ($days - 1) . ' days']);
    $start = new DateTimeImmutable(gmdate('Y-m-d') . ' -' . ($days - 1) . ' days', new DateTimeZone('UTC'));
    foreach ($stmt->fetchAll() as $row) {
        $i = (int) $start->diff(new DateTimeImmutable($row['day'], new DateTimeZone('UTC')))->format('%r%a');
        if ($i >= 0 && $i < $days) {
            $out[(int) $row['site_id']][$i] = (int) $row['views'];
        }
    }
    return $out;
}

/** A small area chart of daily values. */
function sparkline(array $values, int $w = 112, int $h = 30): string
{
    $n = count($values);
    $max = max(1, ...$values ?: [0]);
    $pts = [];
    foreach ($values as $i => $v) {
        $pts[] = round($n > 1 ? $i * $w / ($n - 1) : 0, 1) . ',' . round($h - 2 - ($v / $max) * ($h - 4), 1);
    }
    $line = implode(' ', $pts);
    return '<svg class="spark" width="' . $w . '" height="' . $h . '" viewBox="0 0 ' . $w . ' ' . $h . '" aria-hidden="true">'
        . '<polygon points="0,' . $h . ' ' . $line . ' ' . $w . ',' . $h . '" fill="var(--brand-soft)"/>'
        . '<polyline points="' . $line . '" fill="none" stroke="var(--accent-ink)" stroke-width="1.6" stroke-linejoin="round"/></svg>';
}

/** Status for a site card: [css modifier, label]. */
function site_status(array $s): array
{
    if (!empty($s['taken_down'])) {
        return ['down', 'Taken down'];
    }
    if (!$s['published_version_id']) {
        return ['draft', 'Draft'];
    }
    if ((int) $s['current_version_id'] !== (int) $s['published_version_id']) {
        return ['changes', 'Changes not published'];
    }
    return ['live', 'Published'];
}

/** "3 hours ago" for a UTC 'Y-m-d H:i:s' timestamp. */
function time_ago(string $utc): string
{
    $secs = max(0, time() - strtotime($utc . ' UTC'));
    foreach ([[86400 * 30, 'month'], [86400 * 7, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']] as [$unit, $name]) {
        if ($secs >= $unit) {
            $n = intdiv($secs, $unit);
            return $n === 1 && $name === 'day' ? 'Yesterday' : $n . ' ' . $name . ($n === 1 ? '' : 's') . ' ago';
        }
    }
    return 'Just now';
}

/** The Visitors chart in the editor: an area chart of daily visits (oldest first) with day labels. */
function visits_chart(array $values): string
{
    $w = 340; $h = 140; $pad = 18;
    $n = count($values);
    $max = max(1, ...$values ?: [0]);
    $pts = [];
    foreach ($values as $i => $v) {
        $pts[] = round($n > 1 ? $i * $w / ($n - 1) : 0, 1) . ',' . round($h - $pad - ($v / $max) * ($h - $pad - 8), 1);
    }
    $line = implode(' ', $pts);
    $grid = '';
    foreach ([0.25, 0.5, 0.75] as $f) {
        $y = round(8 + ($h - $pad - 8) * $f, 1);
        $grid .= '<line x1="0" x2="' . $w . '" y1="' . $y . '" y2="' . $y . '" stroke="var(--line)" stroke-dasharray="3 4"/>';
    }
    $labels = '';
    foreach ([0, (int) floor(($n - 1) / 2), $n - 1] as $k => $i) {
        $date = (new DateTimeImmutable(gmdate('Y-m-d') . ' -' . ($n - 1 - $i) . ' days'))->format('M j');
        $x = $n > 1 ? $i * $w / ($n - 1) : 0;
        $anchor = $k === 0 ? 'start' : ($k === 2 ? 'end' : 'middle');
        $labels .= '<text x="' . round($x, 1) . '" y="' . ($h - 3) . '" text-anchor="' . $anchor . '" class="chart-lbl">' . $date . '</text>';
    }
    return '<svg viewBox="0 0 ' . $w . ' ' . $h . '" role="img" aria-label="Daily visits, last ' . $n . ' days, most ' . $max . ' in a day" preserveAspectRatio="none">'
        . '<defs><linearGradient id="vg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e08a3c" stop-opacity=".35"/><stop offset="1" stop-color="#e08a3c" stop-opacity="0"/></linearGradient></defs>'
        . $grid . '<polygon points="0,' . ($h - $pad) . ' ' . $line . ' ' . $w . ',' . ($h - $pad) . '" fill="url(#vg)"/>'
        . '<polyline points="' . $line . '" fill="none" stroke="#9a521a" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'
        . $labels . '</svg>';
}
