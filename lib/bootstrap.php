<?php
// ============================================================================
// ROWAN COPY: BOOTSTRAP
// Loads config, opens the database, starts the session and defines helpers.
// Every page includes this file first.
// ============================================================================

declare(strict_types=1);

const RC_ROOT = __DIR__ . '/..';

$configFile = RC_ROOT . '/config.php';
if (!is_file($configFile)) {
    http_response_code(500);
    exit('Rowan Copy is not configured yet. Copy config.sample.php to config.php and fill it in.');
}
$GLOBALS['RC_CONFIG'] = require $configFile;

require_once __DIR__ . '/billing.php';
require_once __DIR__ . '/plesk.php';
require_once RC_ROOT . '/vendor/autoload.php';

function cfg(string $key, mixed $default = null): mixed
{
    return $GLOBALS['RC_CONFIG'][$key] ?? $default;
}

function base_url(string $path = ''): string
{
    return rtrim((string) cfg('base_url', ''), '/') . '/' . ltrim($path, '/');
}

// ---------------------------------------------------------------------------
// Database (SQLite, created automatically on first run)
// ---------------------------------------------------------------------------

function db(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $dir = (string) cfg('data_dir');
    if (!is_dir($dir) && !mkdir($dir, 0700, true)) {
        http_response_code(500);
        exit('Could not create the data folder. Check data_dir in config.php.');
    }
    $pdo = new PDO('sqlite:' . $dir . '/rowancopy.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    migrate($pdo);
    return $pdo;
}

function migrate(PDO $pdo): void
{
    $pdo->exec(<<<SQL
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sites (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        brief TEXT NOT NULL DEFAULT '',
        current_version_id INTEGER,
        published_version_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS versions (
        id INTEGER PRIMARY KEY,
        site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        html TEXT NOT NULL,
        instruction TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY,
        site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY,
        site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        ip TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ai_usage (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        site_id INTEGER,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS throttle (
        id INTEGER PRIMARY KEY,
        bucket TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_versions_site ON versions(site_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_site ON submissions(site_id);
    CREATE INDEX IF NOT EXISTS idx_usage_user ON ai_usage(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_throttle ON throttle(bucket, created_at);
    CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS page_views (
        site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (site_id, day)
    );
    SQL);

    // Columns added after the first release. Existing installs get them automatically.
    if (add_column($pdo, 'users', 'email_verified_at', 'TEXT')) {
        // Accounts created before verification existed are trusted as-is.
        $pdo->exec('UPDATE users SET email_verified_at = created_at');
    }
    add_column($pdo, 'users', 'session_version', 'INTEGER NOT NULL DEFAULT 1');
    add_column($pdo, 'users', 'suspended', 'INTEGER NOT NULL DEFAULT 0');
    add_column($pdo, 'users', 'ai_limit_override', 'INTEGER');
    add_column($pdo, 'users', 'plan', "TEXT NOT NULL DEFAULT 'free'");
    add_column($pdo, 'users', 'plan_source', "TEXT NOT NULL DEFAULT 'free'"); // free | stripe | manual
    add_column($pdo, 'users', 'stripe_customer_id', 'TEXT');
    add_column($pdo, 'users', 'stripe_subscription_id', 'TEXT');
    add_column($pdo, 'users', 'subscription_status', 'TEXT');
    add_column($pdo, 'users', 'plan_renews_at', 'TEXT');
    add_column($pdo, 'users', 'plan_cancels', 'INTEGER NOT NULL DEFAULT 0');
    add_column($pdo, 'users', 'role', "TEXT NOT NULL DEFAULT 'customer'"); // customer | employee | admin
    $pdo->exec('CREATE TABLE IF NOT EXISTS inquiries (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        business TEXT NOT NULL DEFAULT \'\',
        email TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT \'\',
        service TEXT NOT NULL,
        budget TEXT NOT NULL DEFAULT \'\',
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT \'new\',
        ip TEXT NOT NULL DEFAULT \'\',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS hosting_domains (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        domain TEXT NOT NULL UNIQUE,
        plesk_site_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    add_column($pdo, 'sites', 'custom_domain', 'TEXT');
    add_column($pdo, 'sites', 'taken_down', 'INTEGER NOT NULL DEFAULT 0');
    $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_domain ON sites(custom_domain)');
}

/** Add a column if it doesn't exist yet. Returns true when it was added. */
function add_column(PDO $pdo, string $table, string $column, string $definition): bool
{
    foreach ($pdo->query("PRAGMA table_info($table)") as $col) {
        if ($col['name'] === $column) {
            return false;
        }
    }
    $pdo->exec("ALTER TABLE $table ADD COLUMN $column $definition");
    return true;
}

// ---------------------------------------------------------------------------
// Sessions and authentication
// ---------------------------------------------------------------------------

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $secure = str_starts_with((string) cfg('base_url', ''), 'https://');
    session_name('rc_session');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function current_user(): ?array
{
    static $user = false;
    if ($user !== false) {
        return $user;
    }
    start_session();
    $id = $_SESSION['uid'] ?? null;
    if (!$id) {
        return $user = null;
    }
    $stmt = db()->prepare('SELECT id, email, name, created_at, email_verified_at, session_version, suspended, ai_limit_override,
        plan, plan_source, stripe_customer_id, subscription_status, plan_renews_at, plan_cancels, role FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    // A password change or reset bumps session_version, which logs out every other device.
    if (!$row || $row['suspended'] || (int) ($_SESSION['sv'] ?? 0) !== (int) $row['session_version']) {
        $_SESSION = [];
        return $user = null;
    }
    return $user = $row;
}

/** Log the user out everywhere else (call after password changes). */
function bump_session_version(int $userId): void
{
    db()->prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?')->execute([$userId]);
}

function require_login(): array
{
    $user = current_user();
    if (!$user) {
        redirect('login.php');
    }
    return $user;
}

/**
 * customer, employee or admin. Emails in config.php's admin_emails are always admins
 * (so the owner can never be locked out); everyone else gets the role set on the Team page.
 */
function user_role(?array $user): string
{
    if (!$user) {
        return 'guest';
    }
    if (is_owner_email((string) $user['email'])) {
        return 'admin';
    }
    return in_array($user['role'] ?? '', ['employee', 'admin'], true) ? $user['role'] : 'customer';
}

function is_owner_email(string $email): bool
{
    return in_array(strtolower($email), array_map('strtolower', (array) cfg('admin_emails', [])), true);
}

/** Full control: plans, suspensions, takedowns, team. */
function is_admin(?array $user): bool
{
    return user_role($user) === 'admin';
}

/** Admins and employees: customer support, inquiries, hosting email and DNS. */
function is_staff(?array $user): bool
{
    return in_array(user_role($user), ['admin', 'employee'], true);
}

function require_staff(): array
{
    $user = require_login();
    if (!is_staff($user)) {
        http_response_code(403);
        exit('Staff only.');
    }
    return $user;
}

function require_admin(): array
{
    $user = require_login();
    if (!is_admin($user)) {
        http_response_code(403);
        exit('Admins only.');
    }
    return $user;
}

function log_in(int $userId): void
{
    start_session();
    session_regenerate_id(true);
    $stmt = db()->prepare('SELECT session_version FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $_SESSION['uid'] = $userId;
    $_SESSION['sv'] = (int) $stmt->fetchColumn();
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

function mail_from(): string
{
    return (string) (cfg('mail_from') ?: cfg('notify_email_from', ''));
}

function mail_enabled(): bool
{
    return filter_var(mail_from(), FILTER_VALIDATE_EMAIL) !== false;
}

/** Send a plain-text email through the server's mail system. Returns false if email isn't set up. */
function send_email(string $to, string $subject, string $body): bool
{
    if (!mail_enabled() || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    $from = mail_from();
    $subject = mb_encode_mimeheader(preg_replace('/[\r\n]+/', ' ', $subject) ?? '', 'UTF-8');
    $headers = implode("\r\n", [
        'From: Rowan Copy <' . $from . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ]);
    $ok = @mail($to, $subject, $body, $headers, '-f' . $from);
    if (!$ok) {
        error_log("Rowan Copy: could not send email to $to");
    }
    return $ok;
}

/** Whether customers must confirm their email before publishing. Off when email isn't set up. */
function verification_required(): bool
{
    return (bool) cfg('require_email_verification', true) && mail_enabled();
}

function is_verified(array $user): bool
{
    return !verification_required() || !empty($user['email_verified_at']);
}

// ---------------------------------------------------------------------------
// One-time links (password reset, email verification). Only a hash is stored.
// ---------------------------------------------------------------------------

function create_token(int $userId, string $purpose, int $ttlSeconds): string
{
    $token = bin2hex(random_bytes(32));
    db()->prepare('DELETE FROM tokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL')->execute([$userId, $purpose]);
    db()->prepare('INSERT INTO tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)')
        ->execute([$userId, $purpose, hash('sha256', $token), time() + $ttlSeconds]);
    return $token;
}

/** Returns the token row if valid (not used, not expired), without consuming it. */
function find_token(string $token, string $purpose): ?array
{
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        return null;
    }
    $stmt = db()->prepare('SELECT * FROM tokens WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?');
    $stmt->execute([hash('sha256', $token), $purpose, time()]);
    return $stmt->fetch() ?: null;
}

function use_token(int $tokenId): void
{
    db()->prepare('UPDATE tokens SET used_at = ? WHERE id = ?')->execute([time(), $tokenId]);
}

function send_verification_email(array $user): bool
{
    $token = create_token((int) $user['id'], 'verify', 7 * 86400);
    return send_email($user['email'], 'Confirm your email for Rowan Copy',
        "Hi {$user['name']},\n\nPlease confirm your email address by opening this link:\n\n"
        . base_url('verify.php?token=' . $token)
        . "\n\nThe link works for 7 days. If you didn't create a Rowan Copy account, you can ignore this email.\n\n- Rowan Copy\n");
}

function password_reset_link(int $userId): string
{
    return base_url('reset.php?token=' . create_token($userId, 'reset', 3600));
}

/** Load a site and make sure the logged-in user owns it. */
function owned_site(int $siteId, array $user): array
{
    $stmt = db()->prepare('SELECT * FROM sites WHERE id = ? AND user_id = ?');
    $stmt->execute([$siteId, $user['id']]);
    $site = $stmt->fetch();
    if (!$site) {
        http_response_code(404);
        exit('Site not found.');
    }
    return $site;
}

// ---------------------------------------------------------------------------
// CSRF protection: every POST form and API call must send this token.
// ---------------------------------------------------------------------------

function csrf_token(): string
{
    start_session();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf" value="' . h(csrf_token()) . '">';
}

function require_csrf(): void
{
    $sent = $_POST['csrf'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (!is_string($sent) || !hash_equals(csrf_token(), $sent)) {
        http_response_code(403);
        exit('Your session expired. Please go back, refresh the page, and try again.');
    }
}

// ---------------------------------------------------------------------------
// Rate limiting (simple sliding window stored in SQLite)
// ---------------------------------------------------------------------------

/** Returns true if the action is allowed, and records it. */
function throttle(string $bucket, int $max, int $windowSeconds): bool
{
    $now = time();
    $pdo = db();
    $pdo->prepare('DELETE FROM throttle WHERE created_at < ?')->execute([$now - 86400]);
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM throttle WHERE bucket = ? AND created_at > ?');
    $stmt->execute([$bucket, $now - $windowSeconds]);
    if ((int) $stmt->fetchColumn() >= $max) {
        return false;
    }
    $pdo->prepare('INSERT INTO throttle (bucket, created_at) VALUES (?, ?)')->execute([$bucket, $now]);
    return true;
}

function client_ip(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

// ---------------------------------------------------------------------------
// AI usage limits
// ---------------------------------------------------------------------------

function ai_uses_this_month(int $userId): int
{
    $stmt = db()->prepare(
        "SELECT COUNT(*) FROM ai_usage WHERE user_id = ? AND status = 'ok'
         AND created_at >= strftime('%Y-%m-01 00:00:00', 'now')"
    );
    $stmt->execute([$userId]);
    return (int) $stmt->fetchColumn();
}

/** Monthly AI allowance from the customer's plan; an admin can override it for one customer. */
function ai_limit(?array $user = null): int
{
    if ($user && ($user['ai_limit_override'] ?? null) !== null) {
        return (int) $user['ai_limit_override'];
    }
    return (int) (user_plan($user)['ai_limit'] ?? cfg('monthly_ai_limit', 10));
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

const RESERVED_SLUGS = ['admin', 'api', 'app', 'assets', 'login', 'logout', 'register', 'dashboard',
    'editor', 'www', 'mail', 'help', 'support', 'rowancopy', 'rowan-copy', 'uploads', 's'];

function slugify(string $text): string
{
    $slug = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $text) ?? '', '-'));
    return substr($slug, 0, 40) ?: 'site';
}

function valid_slug(string $slug): bool
{
    return (bool) preg_match('/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/', $slug)
        && !in_array($slug, RESERVED_SLUGS, true);
}

function unique_slug(string $base): string
{
    $base = slugify($base);
    if (strlen($base) < 3 || in_array($base, RESERVED_SLUGS, true)) {
        $base = 'site-' . $base;
    }
    $slug = $base;
    $stmt = db()->prepare('SELECT 1 FROM sites WHERE slug = ?');
    for ($i = 2; ; $i++) {
        $stmt->execute([$slug]);
        if (!$stmt->fetchColumn()) {
            return $slug;
        }
        $slug = substr($base, 0, 34) . '-' . $i;
    }
}

function site_url(string $slug): string
{
    return base_url('s/' . rawurlencode($slug));
}

function site_images(int $siteId): array
{
    $stmt = db()->prepare('SELECT * FROM images WHERE site_id = ? ORDER BY id');
    $stmt->execute([$siteId]);
    return $stmt->fetchAll();
}

function image_url(array $image): string
{
    return base_url('uploads/' . $image['site_id'] . '/' . $image['filename']);
}

function uploads_dir(int $siteId): string
{
    return RC_ROOT . '/uploads/' . $siteId;
}

/** Public address of a site: its custom domain if connected, otherwise /s/slug. */
function public_url(array $site): string
{
    return !empty($site['custom_domain']) ? 'https://' . $site['custom_domain'] : site_url($site['slug']);
}

/** Fill in the placeholders the AI puts in generated HTML. */
function render_site_html(string $html, array $site): string
{
    return str_replace('{{FORM_ACTION}}', h(base_url('form.php?s=' . rawurlencode($site['slug']))), $html);
}

/** Lowercase a hostname typed by a customer and strip any http:// or path. Returns '' if invalid. */
function normalize_domain(string $input): string
{
    $d = strtolower(trim($input));
    $d = preg_replace('#^https?://#', '', $d) ?? '';
    $d = rtrim(explode('/', $d)[0], '.');
    $ok = strlen($d) <= 253
        && preg_match('/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $d);
    $appHost = strtolower((string) parse_url((string) cfg('base_url'), PHP_URL_HOST));
    return $ok && $d !== $appHost ? $d : '';
}

/**
 * Serve a published customer site (from /s/slug or a custom domain) and count the visit.
 * Sites are shown in a browser sandbox so their scripts can't touch Rowan Copy accounts.
 */
function serve_site(?array $site): never
{
    if (!$site || $site['taken_down'] || !empty($site['owner_suspended'])) {
        http_response_code(404);
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Site not found</title>'
            . '<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#333;background:#faf8f5;margin:0">'
            . '<div style="text-align:center;padding:16px"><h1>This website isn’t available</h1><p>It may not be published yet.</p>'
            . '<p><a href="' . h(base_url()) . '">Build your own with Rowan Copy</a></p></div>';
        exit;
    }

    // Count real visits (skip bots and link previews). No cookies, no personal data.
    $ua = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
    if ($ua !== '' && !preg_match('/bot|crawl|spider|slurp|preview|facebookexternalhit|curl|wget|python|monitor/i', $ua)) {
        db()->prepare('INSERT INTO page_views (site_id, day, views) VALUES (?, date(\'now\'), 1)
                       ON CONFLICT(site_id, day) DO UPDATE SET views = views + 1')->execute([$site['id']]);
    }

    $html = render_site_html($site['html'], $site);
    if (cfg('show_badge', true) && empty(user_plan(['plan' => $site['owner_plan'] ?? 'free'])['remove_badge'])) {
        $badge = '<a href="' . h(base_url()) . '" target="_blank" rel="noopener" style="position:fixed;right:12px;bottom:12px;z-index:2147483647;'
            . 'background:#14233f;color:#fff;font:600 12px/1 system-ui,sans-serif;padding:8px 12px;border-radius:999px;text-decoration:none;'
            . 'box-shadow:0 2px 8px rgba(0,0,0,.2)">Made with Rowan Copy</a>';
        $pos = strripos($html, '</body>');
        $html = $pos === false ? $html . $badge : substr_replace($html, $badge, $pos, 0);
    }

    header('Content-Type: text/html; charset=utf-8');
    header('Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox');
    header('Cache-Control: no-cache');
    echo $html;
    exit;
}

const SITE_SERVE_SQL = 'SELECT s.*, v.html, u.suspended AS owner_suspended, u.plan AS owner_plan FROM sites s
    JOIN versions v ON v.id = s.published_version_id JOIN users u ON u.id = s.user_id';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function h(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function redirect(string $path): never
{
    header('Location: ' . base_url($path));
    exit;
}

function flash(?string $message = null, string $type = 'ok'): ?array
{
    start_session();
    if ($message !== null) {
        $_SESSION['flash'] = ['msg' => $message, 'type' => $type];
        return null;
    }
    $f = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    return $f;
}

function post_str(string $key, int $maxLen = 5000): string
{
    $v = $_POST[$key] ?? '';
    return is_string($v) ? mb_substr(trim($v), 0, $maxLen) : '';
}

function json_out(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

// Security headers for the app's own pages (customer sites set their own in site.php).
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
