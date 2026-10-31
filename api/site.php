<?php
// ============================================================================
// POST api/site.php: everything in the editor that isn't AI.
// action = publish | unpublish | restore | settings | domain | get_html | save_html | duplicate | delete | upload | delete_image
// ============================================================================

require __DIR__ . '/../lib/bootstrap.php';

$user = current_user();
if (!$user) {
    json_out(['error' => 'Please log in again.'], 401);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['error' => 'POST only.'], 405);
}
require_csrf();

$site = owned_site((int) ($_POST['site_id'] ?? 0), $user);
$siteId = (int) $site['id'];
$pdo = db();

switch ($_POST['action'] ?? '') {
    case 'publish':
        if (!$site['current_version_id']) {
            json_out(['error' => 'Build your site before publishing.'], 422);
        }
        if (!is_verified($user)) {
            json_out(['error' => 'Please confirm your email address first. Check your inbox for our link, or resend it from My sites.'], 403);
        }
        if ($site['taken_down']) {
            json_out(['error' => 'This site was taken down by Rowan Copy. Please contact support.'], 403);
        }
        $pdo->prepare('UPDATE sites SET published_version_id = current_version_id, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$siteId]);
        json_out(['ok' => true, 'url' => public_url($site), 'published_version_id' => (int) $site['current_version_id']]);

    case 'unpublish':
        $pdo->prepare('UPDATE sites SET published_version_id = NULL WHERE id = ?')->execute([$siteId]);
        json_out(['ok' => true]);

    case 'restore':
        $stmt = $pdo->prepare('SELECT id, html FROM versions WHERE id = ? AND site_id = ?');
        $stmt->execute([(int) ($_POST['version_id'] ?? 0), $siteId]);
        $v = $stmt->fetch();
        if (!$v) {
            json_out(['error' => 'Version not found.'], 404);
        }
        $pdo->prepare('UPDATE sites SET current_version_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$v['id'], $siteId]);
        json_out(['ok' => true, 'html' => render_site_html($v['html'], $site), 'version_id' => (int) $v['id']]);

    case 'settings':
        $name = post_str('name', 80);
        $slug = strtolower(post_str('slug', 40));
        $brief = post_str('brief', 4000);
        if ($name === '') {
            json_out(['error' => 'Site name can\'t be empty.'], 422);
        }
        if (!valid_slug($slug)) {
            json_out(['error' => 'Web address must be 3–40 characters: lowercase letters, numbers and dashes.'], 422);
        }
        $taken = $pdo->prepare('SELECT 1 FROM sites WHERE slug = ? AND id != ?');
        $taken->execute([$slug, $siteId]);
        if ($taken->fetchColumn()) {
            json_out(['error' => 'That web address is taken. Try another.'], 422);
        }
        $pdo->prepare('UPDATE sites SET name = ?, slug = ?, brief = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$name, $slug, $brief !== '' ? $brief : $site['brief'], $siteId]);
        json_out(['ok' => true, 'url' => public_url(['slug' => $slug] + $site)]);

    case 'domain':
        $raw = post_str('domain', 260);
        $domain = $raw === '' ? '' : normalize_domain($raw);
        if ($raw !== '' && $domain === '') {
            json_out(['error' => 'That doesn\'t look like a domain name. Enter something like mybakery.com.'], 422);
        }
        if ($domain !== '') {
            $taken = $pdo->prepare('SELECT 1 FROM sites WHERE custom_domain IN (?, ?) AND id != ?');
            $taken->execute([$domain, preg_replace('/^www\./', '', $domain), $siteId]);
            if ($taken->fetchColumn()) {
                json_out(['error' => 'That domain is already connected to another Rowan Copy site.'], 422);
            }
        }
        $pdo->prepare('UPDATE sites SET custom_domain = ? WHERE id = ?')->execute([$domain !== '' ? $domain : null, $siteId]);
        json_out(['ok' => true, 'domain' => $domain, 'url' => public_url(['custom_domain' => $domain] + $site)]);

    case 'get_html':
        $v = $pdo->prepare('SELECT html FROM versions WHERE id = ?');
        $v->execute([(int) $site['current_version_id']]);
        json_out(['ok' => true, 'html' => (string) $v->fetchColumn()]);

    case 'save_html':
        $html = (string) ($_POST['html'] ?? '');
        if (strlen($html) > 1_000_000) {
            json_out(['error' => 'That page is too large (1 MB maximum).'], 422);
        }
        if (stripos($html, '<body') === false) {
            json_out(['error' => 'The code needs at least a <body> tag.'], 422);
        }
        $pdo->prepare('INSERT INTO versions (site_id, html, instruction) VALUES (?, ?, ?)')->execute([$siteId, $html, 'Edited the code by hand']);
        $vid = (int) $pdo->lastInsertId();
        $pdo->prepare('UPDATE sites SET current_version_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$vid, $siteId]);
        json_out(['ok' => true, 'html' => render_site_html($html, $site),
            'version' => ['id' => $vid, 'instruction' => 'Edited the code by hand', 'created_at' => gmdate('Y-m-d H:i:s')]]);

    case 'duplicate':
        $count = $pdo->prepare('SELECT COUNT(*) FROM sites WHERE user_id = ?');
        $count->execute([$user['id']]);
        if ((int) $count->fetchColumn() >= 10) {
            json_out(['error' => 'You can have up to 10 websites. Delete one to make room.'], 422);
        }
        $pdo->beginTransaction();
        $name = mb_substr($site['name'] . ' (copy)', 0, 80);
        $pdo->prepare('INSERT INTO sites (user_id, name, slug, brief) VALUES (?, ?, ?, ?)')
            ->execute([$user['id'], $name, unique_slug($name), $site['brief']]);
        $newId = (int) $pdo->lastInsertId();
        // Copy images first so the copied page can point at the new site's own files.
        $html = '';
        if ($site['current_version_id']) {
            $v = $pdo->prepare('SELECT html FROM versions WHERE id = ?');
            $v->execute([$site['current_version_id']]);
            $html = (string) $v->fetchColumn();
        }
        $images = site_images($siteId);
        if ($images && !is_dir(uploads_dir($newId))) {
            mkdir(uploads_dir($newId), 0755, true);
        }
        foreach ($images as $img) {
            $newFile = bin2hex(random_bytes(12)) . '.' . pathinfo($img['filename'], PATHINFO_EXTENSION);
            if (@copy(uploads_dir($siteId) . '/' . $img['filename'], uploads_dir($newId) . '/' . $newFile)) {
                $pdo->prepare('INSERT INTO images (site_id, filename, label) VALUES (?, ?, ?)')->execute([$newId, $newFile, $img['label']]);
                $html = str_replace(image_url($img), image_url(['site_id' => $newId, 'filename' => $newFile]), $html);
            }
        }
        if ($html !== '') {
            $pdo->prepare('INSERT INTO versions (site_id, html, instruction) VALUES (?, ?, ?)')->execute([$newId, $html, 'Copied from ' . $site['name']]);
            $pdo->prepare('UPDATE sites SET current_version_id = ? WHERE id = ?')->execute([(int) $pdo->lastInsertId(), $newId]);
        }
        $pdo->commit();
        json_out(['ok' => true, 'url' => base_url('editor.php?id=' . $newId)]);

    case 'delete':
        array_map('unlink', glob(uploads_dir($siteId) . '/*') ?: []);
        @rmdir(uploads_dir($siteId));
        $pdo->prepare('DELETE FROM sites WHERE id = ?')->execute([$siteId]);
        json_out(['ok' => true]);

    case 'upload':
        $file = $_FILES['image'] ?? null;
        if (!$file || !is_array($file) || $file['error'] !== UPLOAD_ERR_OK) {
            json_out(['error' => 'Upload failed. Images must be under 5 MB.'], 422);
        }
        if ($file['size'] > 5 * 1024 * 1024) {
            json_out(['error' => 'Images must be under 5 MB.'], 422);
        }
        if (count(site_images($siteId)) >= 30) {
            json_out(['error' => 'Each site can have up to 30 images.'], 422);
        }
        // Check the real file type from its contents, never trust the name.
        $info = @getimagesize($file['tmp_name']);
        $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp'];
        if (!$info || !isset($types[$info[2]])) {
            json_out(['error' => 'Please upload a JPG, PNG, GIF or WebP image.'], 422);
        }
        $dir = uploads_dir($siteId);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $filename = bin2hex(random_bytes(12)) . '.' . $types[$info[2]];
        if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $filename)) {
            json_out(['error' => 'Could not save the image.'], 500);
        }
        $label = post_str('label', 120) ?: pathinfo((string) $file['name'], PATHINFO_FILENAME);
        $label = mb_substr(preg_replace('/[^\p{L}\p{N} ._-]+/u', ' ', $label) ?? 'image', 0, 120);
        $pdo->prepare('INSERT INTO images (site_id, filename, label) VALUES (?, ?, ?)')->execute([$siteId, $filename, $label]);
        $img = ['id' => (int) $pdo->lastInsertId(), 'site_id' => $siteId, 'filename' => $filename, 'label' => $label];
        json_out(['ok' => true, 'image' => $img + ['url' => image_url($img)]]);

    case 'delete_image':
        $stmt = $pdo->prepare('SELECT * FROM images WHERE id = ? AND site_id = ?');
        $stmt->execute([(int) ($_POST['image_id'] ?? 0), $siteId]);
        $img = $stmt->fetch();
        if ($img) {
            @unlink(uploads_dir($siteId) . '/' . basename($img['filename']));
            $pdo->prepare('DELETE FROM images WHERE id = ?')->execute([$img['id']]);
        }
        json_out(['ok' => true]);

    default:
        json_out(['error' => 'Unknown action.'], 400);
}
