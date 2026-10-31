<?php
// ============================================================================
// POST api/generate.php: build a site or apply a change, streaming the result.
// Responds with Server-Sent Events: "chunk" (HTML text), "ping", "done", "error".
// ============================================================================

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/ai.php';

$user = current_user();
if (!$user) {
    json_out(['error' => 'Please log in again.'], 401);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['error' => 'POST only.'], 405);
}
require_csrf();

$site = owned_site((int) ($_POST['site_id'] ?? 0), $user);
$instruction = post_str('instruction', 4000);
$isCreate = !$site['current_version_id'] || ($_POST['mode'] ?? '') === 'rebuild';

if (!$isCreate && mb_strlen($instruction) < 3) {
    json_out(['error' => 'Tell us what you would like to change.'], 422);
}
if (ai_uses_this_month((int) $user['id']) >= ai_limit()) {
    json_out(['error' => 'You have used all of this month\'s AI designs and edits. Your allowance resets on the 1st.'], 429);
}
if (!throttle('gen:' . $user['id'], 3, 60)) {
    json_out(['error' => 'Please wait a few seconds before the next request.'], 429);
}

// Build the request for Claude.
$images = site_images((int) $site['id']);
if ($isCreate) {
    $brief = $site['brief'] . ($instruction !== '' ? "\n\nExtra direction: " . $instruction : '');
    $message = ai_create_message($site, $brief, $images);
    $label = $instruction !== '' ? 'Rebuilt: ' . $instruction : 'First design';
} else {
    $stmt = db()->prepare('SELECT html FROM versions WHERE id = ?');
    $stmt->execute([$site['current_version_id']]);
    $message = ai_edit_message((string) $stmt->fetchColumn(), $instruction, $images);
    $label = $instruction;
}

// Release the session lock so the customer can keep using other pages while this runs.
session_write_close();
ignore_user_abort(true); // finish and save even if the browser tab is closed
@set_time_limit(0);
@ini_set('zlib.output_compression', '0');
while (ob_get_level() > 0) {
    ob_end_flush();
}
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache, no-transform');
header('X-Accel-Buffering: no');

$send = function (string $event, array $data): void {
    if (connection_aborted()) {
        return;
    }
    echo "event: {$event}\ndata: " . json_encode($data) . "\n\n";
    flush();
};
$lastPing = 0.0;
$ping = function () use ($send, &$lastPing): void {
    if (microtime(true) - $lastPing > 2) {
        $lastPing = microtime(true);
        $send('ping', []);
    }
};

$logUsage = function (string $status, int $in = 0, int $out = 0) use ($user, $site): void {
    db()->prepare('INSERT INTO ai_usage (user_id, site_id, model, input_tokens, output_tokens, status) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$user['id'], $site['id'], (string) cfg('model'), $in, $out, $status]);
};

$send('ping', []);

try {
    $result = ai_generate($message, fn (string $t) => $send('chunk', ['t' => $t]), $ping);
} catch (Throwable $e) {
    error_log('Rowan Copy generation failed: ' . $e->getMessage());
    $logUsage('error');
    $send('error', ['message' => 'The designer had a problem reaching the AI service. Please try again in a minute.']);
    exit;
}

if ($result['stop_reason'] === 'refusal') {
    $logUsage('refused', $result['input_tokens'], $result['output_tokens']);
    $send('error', ['message' => 'The AI declined this request. Try describing the change differently.']);
    exit;
}
$html = extract_html($result['html']);
if ($result['stop_reason'] === 'max_tokens' || $html === null) {
    $logUsage('incomplete', $result['input_tokens'], $result['output_tokens']);
    $send('error', ['message' => 'The design came back incomplete. Please try again, or ask for a smaller change.']);
    exit;
}

$pdo = db();
$pdo->beginTransaction();
$pdo->prepare('INSERT INTO versions (site_id, html, instruction) VALUES (?, ?, ?)')
    ->execute([$site['id'], $html, mb_substr($label, 0, 500)]);
$versionId = (int) $pdo->lastInsertId();
$pdo->prepare('UPDATE sites SET current_version_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    ->execute([$versionId, $site['id']]);
$pdo->commit();
$logUsage('ok', $result['input_tokens'], $result['output_tokens']);

$send('done', [
    'html' => render_site_html($html, $site),
    'version' => ['id' => $versionId, 'instruction' => $label, 'created_at' => gmdate('Y-m-d H:i:s')],
    'used' => ai_uses_this_month((int) $user['id']),
]);
