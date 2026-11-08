<?php
// ============================================================================
// ROWAN COPY: ZOHO (CRM leads, Desk help link)
// Admin -> Integrations connects Zoho once (a "Self Client" from Zoho's API
// Console). The client secret and refresh token are saved in
// data_dir/secrets.json, outside the app folder, never in code or Git.
//
// New sign-ups and quote requests become Zoho CRM Leads. They're written to an
// outbox table first and sent after the visitor's page has loaded, so a slow or
// unreachable Zoho never slows the site down or loses a lead; failures are
// retried on later requests and from the Integrations page.
// ============================================================================

declare(strict_types=1);

final class ZohoError extends RuntimeException
{
}

const ZOHO_ACCOUNTS_HOSTS = [
    'accounts.zoho.com' => 'United States (zoho.com)',
    'accounts.zoho.eu' => 'Europe (zoho.eu)',
    'accounts.zoho.in' => 'India (zoho.in)',
    'accounts.zoho.com.au' => 'Australia (zoho.com.au)',
    'accounts.zoho.jp' => 'Japan (zoho.jp)',
    'accounts.zohocloud.ca' => 'Canada (zohocloud.ca)',
    'accounts.zoho.sa' => 'Saudi Arabia (zoho.sa)',
];

function zoho_crm_enabled(): bool
{
    return app_secret('ZOHO_REFRESH_TOKEN') !== '' && app_secret('ZOHO_CLIENT_ID') !== '' && app_secret('ZOHO_CLIENT_SECRET') !== '';
}

/** Where the portal's Help link goes (Zoho Desk help center), or ''. */
function support_url(): string
{
    $url = app_secret('SUPPORT_URL');
    return preg_match('#^https://[^\s"<>]+$#', $url) ? $url : '';
}

function zoho_accounts_url(string $host, string $path): string
{
    $test = getenv('RC_ZOHO_TEST_URL'); // tests/zoho_test.php only
    if (is_string($test) && $test !== '') {
        return rtrim($test, '/') . $path;
    }
    if (!isset(ZOHO_ACCOUNTS_HOSTS[$host])) {
        throw new ZohoError('Unknown Zoho region.');
    }
    return "https://$host$path";
}

function zoho_api_url(string $path): string
{
    $test = getenv('RC_ZOHO_TEST_URL');
    if (is_string($test) && $test !== '') {
        return rtrim($test, '/') . $path;
    }
    $domain = app_secret('ZOHO_API_DOMAIN') ?: 'https://www.zohoapis.com';
    if (!preg_match('#^https://(www\.)?zohoapis\.[a-z.]+$#', $domain)) {
        throw new ZohoError('Unexpected Zoho API address.');
    }
    return $domain . $path;
}

/** POST a form to Zoho Accounts or send JSON to the CRM API. Returns [status, decoded body]. */
function zoho_http(string $method, string $url, ?array $form = null, ?array $json = null, ?string $token = null): array
{
    $ch = curl_init($url);
    $headers = ['Accept: application/json'];
    if ($token !== null) {
        $headers[] = 'Authorization: Zoho-oauthtoken ' . $token;
    }
    $opts = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 15];
    if ($form !== null) {
        $opts[CURLOPT_POSTFIELDS] = http_build_query($form);
        $headers[] = 'Content-Type: application/x-www-form-urlencoded';
    } elseif ($json !== null) {
        $opts[CURLOPT_POSTFIELDS] = json_encode($json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $headers[] = 'Content-Type: application/json';
    }
    $opts[CURLOPT_HTTPHEADER] = $headers;
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false) {
        throw new ZohoError('Could not reach Zoho' . ($err ? ": $err" : '') . '.');
    }
    return [$status, json_decode((string) $raw, true) ?: []];
}

/**
 * One-time connection: exchange the grant code from a Self Client (Zoho API
 * Console) for a refresh token, and save everything to the secrets file.
 */
function zoho_connect(string $accountsHost, string $clientId, string $clientSecret, string $grantCode): void
{
    [$status, $body] = zoho_http('POST', zoho_accounts_url($accountsHost, '/oauth/v2/token'), [
        'grant_type' => 'authorization_code', 'client_id' => $clientId,
        'client_secret' => $clientSecret, 'code' => $grantCode,
    ]);
    if ($status !== 200 || empty($body['refresh_token'])) {
        $why = (string) ($body['error'] ?? "HTTP $status");
        throw new ZohoError($why === 'invalid_code'
            ? 'Zoho says the grant code is invalid or expired (they last 10 minutes). Generate a new one and try again.'
            : "Zoho didn't accept these details ($why). Check the client ID, secret and region.");
    }
    save_secrets([
        'ZOHO_ACCOUNTS_HOST' => $accountsHost, 'ZOHO_CLIENT_ID' => $clientId, 'ZOHO_CLIENT_SECRET' => $clientSecret,
        'ZOHO_REFRESH_TOKEN' => (string) $body['refresh_token'],
        'ZOHO_API_DOMAIN' => (string) ($body['api_domain'] ?? 'https://www.zohoapis.com'),
    ]);
    zoho_cache_token((string) ($body['access_token'] ?? ''), (int) ($body['expires_in'] ?? 0));
}

function zoho_disconnect(): void
{
    save_secrets(['ZOHO_CLIENT_ID' => '', 'ZOHO_CLIENT_SECRET' => '', 'ZOHO_REFRESH_TOKEN' => '', 'ZOHO_API_DOMAIN' => '']);
    @unlink(zoho_token_cache_path());
}

function zoho_token_cache_path(): string
{
    return rtrim((string) cfg('data_dir'), '/') . '/zoho-token.json';
}

function zoho_cache_token(string $token, int $expiresIn): void
{
    if ($token === '' || $expiresIn <= 0) {
        return;
    }
    $old = umask(0077);
    @file_put_contents(zoho_token_cache_path(), json_encode(['token' => $token, 'expires' => time() + $expiresIn - 120]));
    umask($old);
}

/** A current access token (they last an hour), refreshing it when needed. */
function zoho_access_token(): string
{
    $cached = json_decode((string) @file_get_contents(zoho_token_cache_path()), true);
    if (is_array($cached) && ($cached['expires'] ?? 0) > time() && !empty($cached['token'])) {
        return (string) $cached['token'];
    }
    [$status, $body] = zoho_http('POST', zoho_accounts_url(app_secret('ZOHO_ACCOUNTS_HOST') ?: 'accounts.zoho.com', '/oauth/v2/token'), [
        'grant_type' => 'refresh_token', 'refresh_token' => app_secret('ZOHO_REFRESH_TOKEN'),
        'client_id' => app_secret('ZOHO_CLIENT_ID'), 'client_secret' => app_secret('ZOHO_CLIENT_SECRET'),
    ]);
    if ($status !== 200 || empty($body['access_token'])) {
        throw new ZohoError('Zoho refused to renew access (' . ($body['error'] ?? "HTTP $status") . '). Reconnect on Admin -> Integrations.');
    }
    zoho_cache_token((string) $body['access_token'], (int) ($body['expires_in'] ?? 3600));
    return (string) $body['access_token'];
}

/**
 * Turn a person into a Zoho CRM Lead record. Last_Name and Company are
 * required by Zoho's standard Leads layout, so both always get a value.
 */
function crm_lead_record(string $name, string $email, string $description, string $company = '', string $phone = ''): array
{
    $name = trim(preg_replace('/\s+/', ' ', $name) ?? '');
    $parts = $name === '' ? [] : explode(' ', $name);
    $last = count($parts) > 1 ? (string) array_pop($parts) : ($parts[0] ?? '');
    $first = count($parts) > 0 && $last !== ($parts[0] ?? null) ? implode(' ', $parts) : '';
    $lead = array_filter([
        'First_Name' => mb_substr($first, 0, 40),
        'Last_Name' => mb_substr($last !== '' ? $last : strtok($email, '@'), 0, 80),
        'Company' => mb_substr($company !== '' ? $company : ($name !== '' ? $name : $email), 0, 200),
        'Email' => strtolower($email),
        'Phone' => mb_substr($phone, 0, 30),
        'Description' => mb_substr($description, 0, 32000),
    ], fn ($v) => $v !== '');
    $source = app_secret('ZOHO_LEAD_SOURCE');
    if ($source !== '') {
        $lead['Lead_Source'] = $source;
    }
    return $lead;
}

/** Queue a lead for Zoho CRM and send it once the visitor's page is done. No-op when CRM isn't connected. */
function crm_queue_lead(array $lead): void
{
    if (!zoho_crm_enabled() || empty($lead['Email'])) {
        return;
    }
    db()->prepare('INSERT INTO crm_outbox (payload) VALUES (?)')->execute([json_encode($lead, JSON_UNESCAPED_UNICODE)]);
    static $scheduled = false;
    if (!$scheduled) {
        $scheduled = true;
        register_shutdown_function(function (): void {
            if (function_exists('fastcgi_finish_request')) {
                fastcgi_finish_request(); // the visitor gets their page now; Zoho is contacted afterwards
            }
            crm_flush(10);
        });
    }
}

/** Send waiting leads (oldest first). Returns [sent, failed]. */
function crm_flush(int $limit = 10): array
{
    if (!zoho_crm_enabled()) {
        return [0, 0];
    }
    $rows = db()->query('SELECT * FROM crm_outbox WHERE sent_at IS NULL AND attempts < 10 ORDER BY id LIMIT ' . max(1, $limit))->fetchAll();
    $sent = $failed = 0;
    foreach ($rows as $row) {
        try {
            [$status, $body] = zoho_http('POST', zoho_api_url('/crm/v7/Leads/upsert'), null, [
                'data' => [json_decode((string) $row['payload'], true)],
                'duplicate_check_fields' => ['Email'],
            ], zoho_access_token());
            $result = $body['data'][0] ?? [];
            if ($status >= 200 && $status < 300 && ($result['status'] ?? '') === 'success') {
                db()->prepare('UPDATE crm_outbox SET sent_at = CURRENT_TIMESTAMP, zoho_id = ?, last_error = NULL WHERE id = ?')
                    ->execute([(string) ($result['details']['id'] ?? ''), $row['id']]);
                $sent++;
                continue;
            }
            $error = trim(($result['code'] ?? $body['code'] ?? "HTTP $status") . ': ' . ($result['message'] ?? $body['message'] ?? ''));
        } catch (Throwable $e) {
            $error = $e->getMessage();
        }
        db()->prepare('UPDATE crm_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?')->execute([mb_substr($error, 0, 500), $row['id']]);
        error_log('Rowan Copy Zoho CRM: lead ' . $row['id'] . ' not sent: ' . $error);
        $failed++;
    }
    return [$sent, $failed];
}

function crm_outbox_counts(): array
{
    return db()->query("SELECT SUM(sent_at IS NOT NULL) AS sent, SUM(sent_at IS NULL AND attempts < 10) AS waiting,
        SUM(sent_at IS NULL AND attempts >= 10) AS gave_up FROM crm_outbox")->fetch() ?: [];
}
