<?php
// Quote requests from the Lovable marketing site (same domain). JSON in, JSON out.
require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/marketing.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['ok' => false, 'errors' => ['form' => 'POST only.']], 405);
}
// Only accept requests from our own pages. Browsers always send Origin on a cross-site
// POST, so this blocks other websites from submitting through visitors' browsers.
$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
$ourHost = strtolower((string) parse_url((string) cfg('base_url'), PHP_URL_HOST));
if ($origin !== '' && strtolower((string) parse_url($origin, PHP_URL_HOST)) !== $ourHost) {
    json_out(['ok' => false, 'errors' => ['form' => 'Not allowed.']], 403);
}
$in = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($in)) {
    json_out(['ok' => false, 'errors' => ['form' => 'Invalid request.']], 400);
}
if (!empty($in['website'])) {
    json_out(['ok' => true]); // spam trap: pretend it worked
}
$errors = save_inquiry(inquiry_fields($in));
json_out($errors ? ['ok' => false, 'errors' => $errors] : ['ok' => true], $errors ? 422 : 200);
