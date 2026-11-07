<?php
// ============================================================================
// ROWAN COPY: CADDY ON-DEMAND TLS GATE
// GET /caddy/domain-check?domain=example.com
// Caddy asks this before getting a certificate for a domain. Answer 200 only
// for a live customer site's domain (or its www. form), otherwise 404.
// No login, no cookies, empty body: the answer says nothing beyond yes/no.
// ============================================================================

require __DIR__ . '/lib/bootstrap.php';

header('Cache-Control: no-store');
header('Content-Type: text/plain; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$ok = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET'
    && is_string($_GET['domain'] ?? null)
    && domain_is_active((string) $_GET['domain']);
http_response_code($ok ? 200 : 404);
