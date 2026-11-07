<?php
// Tests for the Caddy domain check and the static-files publisher.
// Run: php tests/hosting_test.php   (uses a temporary database and folders; touches nothing real)
declare(strict_types=1);

$tmp = sys_get_temp_dir() . '/rc-hosting-test-' . bin2hex(random_bytes(4));
mkdir($tmp, 0700, true);
file_put_contents("$tmp/config.php", '<?php return ' . var_export([
    'base_url' => 'https://rowancopy.test',
    'data_dir' => "$tmp/data",
    'show_badge' => true,
    'plans' => [],
    'hosting' => ['provider' => 'files', 'sites_root' => "$tmp/srv/sites", 'releases_root' => "$tmp/srv/releases", 'lb_ip' => '203.0.113.7'],
], true) . ';');
putenv("RC_CONFIG=$tmp/config.php");
require __DIR__ . '/../lib/bootstrap.php';

$failed = 0;
function check(string $name, bool $ok): void
{
    global $failed;
    echo ($ok ? 'ok   ' : 'FAIL ') . $name . "\n";
    $failed += $ok ? 0 : 1;
}

$pdo = db();
$pdo->exec("INSERT INTO users (id, email, name, password_hash) VALUES (1, 'joe@example.com', 'Joe', 'x')");
$pdo->exec("INSERT INTO sites (id, user_id, name, slug) VALUES (1, 1, 'Joe''s Bakery', 'joes-bakery')");
$img = ['site_id' => 1, 'filename' => 'abc123.png'];
@mkdir(uploads_dir(1), 0755, true);
file_put_contents(uploads_dir(1) . '/abc123.png', 'PNGDATA');
$pdo->exec("INSERT INTO images (site_id, filename, label) VALUES (1, 'abc123.png', 'logo')");
$html1 = '<html><body><h1>Version one</h1><img src="' . image_url($img) . '"><form action="{{FORM_ACTION}}"></form></body></html>';
$pdo->prepare("INSERT INTO versions (id, site_id, html, instruction) VALUES (1, 1, ?, 'v1')")->execute([$html1]);
$pdo->exec("UPDATE sites SET current_version_id = 1, published_version_id = 1, custom_domain = 'joesbakery.com' WHERE id = 1");

$live = "$tmp/srv/sites/joesbakery.com";

// --- Domain check -----------------------------------------------------------
check('not active before DNS is checked', !domain_is_active('joesbakery.com'));
$pdo->exec("UPDATE sites SET domain_connected_at = CURRENT_TIMESTAMP WHERE id = 1");
check('active once connected', domain_is_active('joesbakery.com'));
check('www form is active', domain_is_active('www.joesbakery.com'));
check('uppercase input accepted', domain_is_active('JoesBakery.com'));
check('unknown domain refused', !domain_is_active('example.org'));
check('subdomain other than www refused', !domain_is_active('shop.joesbakery.com'));
check('the app\'s own domain refused', !domain_is_active('rowancopy.test'));
foreach (['', '..', '../etc', 'joesbakery.com/', 'joesbakery.com:443', "joesbakery.com\0", 'joes bakery.com', str_repeat('a', 300) . '.com'] as $bad) {
    check('garbage refused: ' . json_encode($bad), !domain_is_active($bad));
}
$pdo->exec("UPDATE sites SET taken_down = 1 WHERE id = 1");
check('taken-down site refused', !domain_is_active('joesbakery.com'));
$pdo->exec("UPDATE sites SET taken_down = 0 WHERE id = 1; UPDATE users SET suspended = 1 WHERE id = 1");
check('suspended owner refused', !domain_is_active('joesbakery.com'));
$pdo->exec("UPDATE users SET suspended = 0 WHERE id = 1; UPDATE sites SET published_version_id = NULL WHERE id = 1");
check('unpublished site refused', !domain_is_active('joesbakery.com'));
$pdo->exec("UPDATE sites SET published_version_id = 1 WHERE id = 1");

// --- Publishing ----------------------------------------------------------------
check('publish succeeds', sync_site_hosting(1) === null);
check('live path is a symlink', is_link($live));
$page = (string) @file_get_contents("$live/index.html");
check('page content written', str_contains($page, 'Version one'));
check('form address filled in', str_contains($page, 'https://rowancopy.test/form.php?s=joes-bakery'));
check('badge on free plan', str_contains($page, 'Made with Rowan Copy'));
check('visit counter added', str_contains($page, 'https://rowancopy.test/v.php?s=joes-bakery'));
check('image copied', @file_get_contents("$live/rc-media/abc123.png") === 'PNGDATA');
check('image address rewritten', str_contains($page, 'src="/rc-media/abc123.png"') && !str_contains($page, '/uploads/'));
$first = readlink($live);

$pdo->prepare("INSERT INTO versions (id, site_id, html, instruction) VALUES (2, 1, ?, 'v2')")->execute([str_replace('Version one', 'Version two', $html1)]);
$pdo->exec("UPDATE sites SET published_version_id = 2 WHERE id = 1");
usleep(1100000); // release names have one-second resolution
sync_site_hosting(1);
check('republish swaps in new version', str_contains((string) file_get_contents("$live/index.html"), 'Version two'));
check('previous release kept for in-flight visitors', is_dir($first));
$pdo->exec("UPDATE sites SET published_version_id = 1 WHERE id = 1");
usleep(1100000);
sync_site_hosting(1);
check('older releases pruned (keeps 2)', count(glob("$tmp/srv/releases/joesbakery.com/*")) === 2 && !is_dir($first));
check('no temp links left behind', !glob("$tmp/srv/sites/.tmp-*"));

// Manually copied plain folder gets replaced by the symlink
$pdo->exec("UPDATE sites SET custom_domain = 'www.manual.com', domain_connected_at = CURRENT_TIMESTAMP WHERE id = 1");
@mkdir("$tmp/srv/sites/manual.com", 0755, true);
file_put_contents("$tmp/srv/sites/manual.com/index.html", 'old');
check('www. domain published under bare domain', sync_site_hosting(1) === null && is_link("$tmp/srv/sites/manual.com"));
check('plain folder replaced', str_contains((string) file_get_contents("$tmp/srv/sites/manual.com/index.html"), 'Version one'));
check('www folder not created', !file_exists("$tmp/srv/sites/www.manual.com"));
$pdo->exec("UPDATE sites SET custom_domain = 'joesbakery.com' WHERE id = 1");

// Takedown / unpublish removes the site
$pdo->exec("UPDATE sites SET taken_down = 1 WHERE id = 1");
sync_site_hosting(1);
check('takedown removes the site', !file_exists($live) && !is_dir("$tmp/srv/releases/joesbakery.com"));
$pdo->exec("UPDATE sites SET taken_down = 0 WHERE id = 1");
sync_site_hosting(1);
check('restore brings it back', is_file("$live/index.html"));

// Paid plan without badge
$GLOBALS['RC_CONFIG']['plans'] = ['pro' => ['name' => 'Pro', 'remove_badge' => true]];
$pdo->exec("UPDATE users SET plan = 'pro' WHERE id = 1");
sync_user_hosting(1);
check('badge removed on plan change', !str_contains((string) file_get_contents("$live/index.html"), 'Made with Rowan Copy'));

// Disconnect removes it
$stmt = $pdo->query('SELECT * FROM sites WHERE id = 1');
disconnect_custom_domain($stmt->fetch());
check('disconnect removes the site', !file_exists($live));

// Bad domains never touch the filesystem
foreach (['../../etc', '..', 'a/b.com'] as $bad) {
    try {
        hosting()->publishSite(['id' => 1, 'html' => 'x', 'slug' => 'joes-bakery'], $bad);
        check('publisher refuses ' . $bad, false);
    } catch (HostingError $e) {
        check('publisher refuses ' . $bad, true);
    }
}

// Clean up
array_map('unlink', glob(uploads_dir(1) . '/*') ?: []);
@rmdir(uploads_dir(1));
exec('rm -rf ' . escapeshellarg($tmp));
echo $failed ? "\n$failed FAILED\n" : "\nAll passed\n";
exit($failed ? 1 : 0);
