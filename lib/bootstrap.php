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
    SQL);
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
    $stmt = db()->prepare('SELECT id, email, name, created_at FROM users WHERE id = ?');
    $stmt->execute([$id]);
    return $user = ($stmt->fetch() ?: null);
}

function require_login(): array
{
    $user = current_user();
    if (!$user) {
        redirect('login.php');
    }
    return $user;
}

function is_admin(?array $user): bool
{
    if (!$user) {
        return false;
    }
    $admins = array_map('strtolower', (array) cfg('admin_emails', []));
    return in_array(strtolower($user['email']), $admins, true);
}

function log_in(int $userId): void
{
    start_session();
    session_regenerate_id(true);
    $_SESSION['uid'] = $userId;
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

function ai_limit(): int
{
    return (int) cfg('monthly_ai_limit', 40);
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

/** Fill in the placeholders the AI puts in generated HTML. */
function render_site_html(string $html, array $site): string
{
    return str_replace('{{FORM_ACTION}}', h(base_url('form.php?s=' . rawurlencode($site['slug']))), $html);
}

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
