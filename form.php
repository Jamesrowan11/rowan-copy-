<?php
// ============================================================================
// Receives contact-form submissions from published customer sites.
// ============================================================================

require __DIR__ . '/lib/bootstrap.php';

function thanks_page(string $title, string $message, string $backUrl): never
{
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . h($title) . '</title>'
        . '<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#333;background:#faf8f5;margin:0">'
        . '<div style="text-align:center;padding:16px;max-width:480px"><h1>' . h($title) . '</h1><p>' . h($message) . '</p>'
        . '<p><a href="' . h($backUrl) . '">← Back to the website</a></p></div>';
    exit;
}

$slug = strtolower((string) ($_GET['s'] ?? ''));
$stmt = db()->prepare('SELECT s.*, u.email AS owner_email FROM sites s JOIN users u ON u.id = s.user_id WHERE s.slug = ? AND s.published_version_id IS NOT NULL');
$stmt->execute([$slug]);
$site = $stmt->fetch();

if (!$site || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(404);
    exit('Not found.');
}
$back = site_url($site['slug']);

// Spam trap: real people never fill in the hidden _hp field.
if (!empty($_POST['_hp'])) {
    thanks_page('Thank you!', 'Your message was sent.', $back);
}
if (!throttle('form:' . $site['id'] . ':' . client_ip(), 5, 600)) {
    http_response_code(429);
    thanks_page('Please slow down', 'You have sent several messages already. Please try again in a few minutes.', $back);
}

$fields = [];
foreach ($_POST as $key => $value) {
    if (count($fields) >= 25 || str_starts_with((string) $key, '_')) {
        continue;
    }
    $key = mb_substr(preg_replace('/[^\p{L}\p{N} _-]+/u', '', str_replace('_', ' ', (string) $key)) ?? '', 0, 60);
    $value = is_array($value) ? implode(', ', array_filter($value, 'is_string')) : (string) $value;
    $value = mb_substr(trim($value), 0, 5000);
    if ($key !== '' && $value !== '') {
        $fields[$key] = $value;
    }
}
if (!$fields) {
    thanks_page('Nothing to send', 'The form was empty. Please go back and fill it in.', $back);
}

db()->prepare('INSERT INTO submissions (site_id, data, ip) VALUES (?, ?, ?)')
    ->execute([$site['id'], json_encode($fields, JSON_UNESCAPED_UNICODE), client_ip()]);

// Optional email alert to the site owner.
$from = (string) cfg('notify_email_from', '');
if ($from !== '') {
    $subject = 'New message from your website: ' . preg_replace('/[\r\n]+/', ' ', $site['name']);
    $body = "You received a new message through {$back}\n\n";
    foreach ($fields as $k => $v) {
        $body .= ucfirst($k) . ": {$v}\n";
    }
    $body .= "\nRead and manage messages: " . base_url('inbox.php?id=' . $site['id']) . "\n";
    @mail($site['owner_email'], $subject, $body, 'From: Rowan Copy <' . preg_replace('/[\r\n]+/', '', $from) . '>');
}

thanks_page('Thank you!', 'Your message was sent. We\'ll be in touch soon.', $back);
