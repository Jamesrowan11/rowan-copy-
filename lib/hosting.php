<?php
// ============================================================================
// ROWAN COPY: HOSTING PROVIDERS
// Everything that puts a customer site on its own domain goes through
// hosting(). config.php 'hosting' => ['provider' => ...] picks:
//   'plesk' – today's setup. Sites are rendered live by index.php; Plesk
//             aliases / add-on domains route the domain to this app.
//   'files' – DigitalOcean + Caddy. Each site is published as static files
//             to <sites_root>/<domain>/ on the shared NFS mount.
// Sites without a custom domain (rowancopy.com/s/slug) are always rendered
// live by this app, whichever provider is active.
// ============================================================================

declare(strict_types=1);

final class HostingError extends RuntimeException
{
}

interface HostingProvider
{
    /** Make a site's published version live on its domain. */
    public function publishSite(array $site, string $domain): void;

    /** Take whatever is served on a domain offline. */
    public function removeSite(string $domain): void;

    /** Start routing a domain to us. $bought: registered through Rowan Copy (gets email where the provider offers it). */
    public function addDomain(string $domain, int $userId, bool $bought): void;

    /** Stop routing a domain to us. */
    public function removeDomain(string $domain, bool $bought): void;

    /** The IPv4 address customers point their A records at. */
    public function targetIp(): string;

    /** Whether domains on this provider can have email accounts managed in the portal. */
    public function offersEmail(): bool;
}

/** Today's Plesk server: the app renders sites live, Plesk routes the domains. */
final class PleskHostingProvider implements HostingProvider
{
    public function publishSite(array $site, string $domain): void
    {
        // Nothing to copy: index.php renders the published version on every visit.
    }

    public function removeSite(string $domain): void
    {
        // index.php stops serving it as soon as the database says so.
    }

    public function addDomain(string $domain, int $userId, bool $bought): void
    {
        if (!$bought) {
            plesk_add_site_alias($domain);
            return;
        }
        // A real Plesk domain (not an alias), so it can have email accounts.
        plesk_add_hosted_domain($domain);
        $pleskSiteId = plesk_find_domain($domain);
        if ($pleskSiteId) {
            db()->prepare('INSERT INTO hosting_domains (user_id, domain, plesk_site_id) VALUES (?, ?, ?)
                ON CONFLICT(domain) DO UPDATE SET user_id = excluded.user_id, plesk_site_id = excluded.plesk_site_id')
                ->execute([$userId, $domain, $pleskSiteId]);
        }
    }

    public function removeDomain(string $domain, bool $bought): void
    {
        if (!$bought) {
            plesk_remove_site_alias($domain);
        }
    }

    public function targetIp(): string
    {
        return (string) cfg('server_ip', '');
    }

    public function offersEmail(): bool
    {
        return true;
    }
}

/**
 * Static files on shared storage, served by Caddy.
 *   <sites_root>/<domain>          symlink to the live release
 *   <releases_root>/<domain>/<id>/ index.html + rc-media/ (the site's images)
 * Publishing writes a complete new release, then swaps the symlink with one
 * rename(), so visitors see either the old site or the new one, never a mix.
 */
final class FilesHostingProvider implements HostingProvider
{
    private const KEEP_RELEASES = 2;

    public function __construct(private string $sitesRoot, private string $releasesRoot, private string $ip)
    {
        $this->sitesRoot = rtrim($sitesRoot, '/');
        $this->releasesRoot = rtrim($releasesRoot, '/');
    }

    public function publishSite(array $site, string $domain): void
    {
        $domain = $this->checkDomain($domain);
        $releaseDir = $this->releasesRoot . '/' . $domain . '/' . gmdate('YmdHis') . '-' . bin2hex(random_bytes(4));
        $this->mkdir($releaseDir . '/rc-media');

        $html = build_site_page($site, true);
        // Copy the images this version uses, so the site doesn't depend on the builder being up.
        foreach (site_images((int) $site['id']) as $img) {
            $url = image_url($img);
            if (!str_contains($html, $url)) {
                continue;
            }
            $file = basename((string) $img['filename']);
            if (!@copy(uploads_dir((int) $site['id']) . '/' . $file, $releaseDir . '/rc-media/' . $file)) {
                throw new HostingError("Could not copy image $file for $domain.");
            }
            $html = str_replace($url, '/rc-media/' . $file, $html);
        }
        $this->write($releaseDir . '/index.html', $html);

        // Swap it in.
        $live = $this->sitesRoot . '/' . $domain;
        $this->mkdir($this->sitesRoot);
        if (is_dir($live) && !is_link($live)) {
            // A plain folder from a manual copy: move it aside so the symlink can take its place.
            if (!@rename($live, $this->releasesRoot . '/' . $domain . '/manual-' . gmdate('YmdHis'))) {
                throw new HostingError("Could not replace $live.");
            }
        }
        $tmp = $this->sitesRoot . '/.tmp-' . $domain . '-' . bin2hex(random_bytes(4));
        if (!@symlink($releaseDir, $tmp) || !@rename($tmp, $live)) {
            @unlink($tmp);
            throw new HostingError("Could not switch $domain to its new version.");
        }
        $this->pruneReleases($domain, $releaseDir);
    }

    public function removeSite(string $domain): void
    {
        $domain = $this->checkDomain($domain);
        $live = $this->sitesRoot . '/' . $domain;
        if (is_link($live)) {
            @unlink($live);
        }
        $this->deleteTree($this->releasesRoot . '/' . $domain);
        if (file_exists($live) || is_link($live)) {
            throw new HostingError("Could not take $domain offline.");
        }
    }

    public function addDomain(string $domain, int $userId, bool $bought): void
    {
        $this->checkDomain($domain);
        // Nothing to set up: Caddy serves any folder in sites_root once the domain-check endpoint approves it.
    }

    public function removeDomain(string $domain, bool $bought): void
    {
        $this->removeSite($domain);
    }

    public function targetIp(): string
    {
        return $this->ip;
    }

    public function offersEmail(): bool
    {
        return false;
    }

    private function checkDomain(string $domain): string
    {
        $d = site_host($domain);
        // Only plain hostnames: no slashes, dots-only names or anything else that could escape the folder.
        if ($d === '' || normalize_domain($d) !== $d || str_contains($d, '..')) {
            throw new HostingError('Invalid domain: ' . $domain);
        }
        return $d;
    }

    private function mkdir(string $dir): void
    {
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new HostingError("Could not create $dir. Check that the hosting folders exist and the app can write to them.");
        }
    }

    private function write(string $path, string $data): void
    {
        if (@file_put_contents($path, $data, LOCK_EX) !== strlen($data)) {
            throw new HostingError("Could not write $path.");
        }
        @chmod($path, 0644);
    }

    private function pruneReleases(string $domain, string $current): void
    {
        $all = glob($this->releasesRoot . '/' . $domain . '/*', GLOB_ONLYDIR) ?: [];
        rsort($all); // newest first (names start with a timestamp)
        $kept = 0;
        foreach ($all as $dir) {
            if ($dir === $current) {
                continue;
            }
            // Keep the previous release too, in case a visitor is mid-load when the switch happens.
            if (!str_contains($dir, '/manual-') && $kept < self::KEEP_RELEASES - 1) {
                $kept++;
                continue;
            }
            $this->deleteTree($dir);
        }
    }

    private function deleteTree(string $path): void
    {
        if (is_link($path) || is_file($path)) {
            @unlink($path);
            return;
        }
        if (!is_dir($path)) {
            return;
        }
        foreach (scandir($path) ?: [] as $f) {
            if ($f !== '.' && $f !== '..') {
                $this->deleteTree($path . '/' . $f);
            }
        }
        @rmdir($path);
    }
}

function hosting(): HostingProvider
{
    static $provider = null;
    if ($provider) {
        return $provider;
    }
    $c = hosting_settings();
    return $provider = match ($c['provider']) {
        'files' => new FilesHostingProvider($c['sites_root'], $c['releases_root'], $c['lb_ip']),
        'plesk' => new PleskHostingProvider(),
        default => throw new HostingError('Unknown hosting provider in config.php: ' . $c['provider']),
    };
}

function hosting_settings(): array
{
    $c = (array) cfg('hosting', []) + ['provider' => 'plesk', 'sites_root' => '/srv/sites', 'releases_root' => '/srv/releases', 'lb_ip' => ''];
    $c['provider'] = (string) (getenv('RC_HOSTING_PROVIDER') ?: $c['provider']);
    return $c;
}

/** Whether a site's domain was registered through Rowan Copy. */
function domain_was_bought(string $domain): bool
{
    $stmt = db()->prepare("SELECT 1 FROM domain_orders WHERE domain = ? AND status IN ('active', 'registered')");
    $stmt->execute([site_host($domain)]);
    return (bool) $stmt->fetchColumn();
}

/**
 * Bring a site's domain in line with the database: publish it if it should be
 * live there, take it down otherwise. Call after anything that changes what a
 * visitor should see (publish, unpublish, takedown, suspension, plan, slug).
 * Returns null on success, or a message to show.
 */
function sync_site_hosting(int $siteId): ?string
{
    $stmt = db()->prepare('SELECT s.*, v.html, u.suspended AS owner_suspended, u.plan AS owner_plan FROM sites s
        LEFT JOIN versions v ON v.id = s.published_version_id JOIN users u ON u.id = s.user_id WHERE s.id = ?');
    $stmt->execute([$siteId]);
    $site = $stmt->fetch();
    if (!$site || (string) $site['custom_domain'] === '') {
        return null;
    }
    $domain = site_host((string) $site['custom_domain']);
    $live = $site['html'] !== null && !$site['taken_down'] && !$site['owner_suspended'] && $site['domain_connected_at'];
    try {
        $live ? hosting()->publishSite($site, $domain) : hosting()->removeSite($domain);
        return null;
    } catch (Throwable $e) {
        error_log("Rowan Copy hosting: site $siteId ($domain): " . $e->getMessage());
        return "We couldn't update $domain just now. Please try again in a minute; if it keeps happening, contact support.";
    }
}

/** Sync every site a customer owns (after a plan change or suspension). */
function sync_user_hosting(int $userId): void
{
    $stmt = db()->prepare("SELECT id FROM sites WHERE user_id = ? AND custom_domain IS NOT NULL AND custom_domain != ''");
    $stmt->execute([$userId]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
        sync_site_hosting((int) $id);
    }
}

/** Take a site's domain offline before the site is deleted. */
function remove_site_hosting(array $site): void
{
    if ((string) ($site['custom_domain'] ?? '') === '') {
        return;
    }
    try {
        hosting()->removeSite(site_host((string) $site['custom_domain']));
    } catch (Throwable $e) {
        error_log('Rowan Copy hosting: could not remove ' . $site['custom_domain'] . ': ' . $e->getMessage());
    }
}
