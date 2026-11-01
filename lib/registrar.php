<?php
// ============================================================================
// ROWAN COPY: NAME.COM DOMAIN REGISTRAR CONNECTOR
// Rowan Copy resells domains through a Name.com reseller account. Every call
// to Name.com is in this file. 'namecom' in config.php sets the account,
// the API address (sandbox for testing, production for real domains) and
// your markup.
// ============================================================================

declare(strict_types=1);

final class RegistrarError extends RuntimeException
{
}

function registrar_settings(): array
{
    return (array) cfg('namecom', []) + [
        'username' => '', 'token' => '',
        'api_base' => 'https://api.dev.name.com/core/v1',
        'markup' => 5.00, 'tlds' => ['com', 'net', 'org', 'co', 'us'],
        'tax_code' => '', 'currency' => 'usd',
    ];
}

function registrar_enabled(): bool
{
    $s = registrar_settings();
    return $s['username'] !== '' && $s['token'] !== '';
}

function registrar_is_sandbox(): bool
{
    return str_contains((string) registrar_settings()['api_base'], '.dev.');
}

/** Call the Name.com API. Throws RegistrarError with Name.com's own message on failure. */
function registrar_request(string $method, string $path, ?array $body = null): array
{
    $s = registrar_settings();
    if (!registrar_enabled()) {
        throw new RegistrarError('Domain sales aren\'t set up yet (Name.com account missing in config.php).');
    }
    $ch = curl_init(rtrim((string) $s['api_base'], '/') . $path);
    $opts = [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_USERPWD => $s['username'] . ':' . $s['token'],
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_CONNECTTIMEOUT => 10,
    ];
    if ($body !== null) {
        $opts[CURLOPT_POSTFIELDS] = json_encode($body);
    }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $json = is_string($raw) ? json_decode($raw, true) : null;
    if ($raw === false || $status >= 400 || !is_array($json)) {
        $msg = is_array($json) ? trim(($json['message'] ?? '') . ' ' . ($json['details'] ?? '')) : '';
        error_log("Rowan Copy Name.com $method $path HTTP $status $err " . substr((string) $raw, 0, 800));
        throw new RegistrarError($msg !== '' ? "Name.com: $msg" : 'Couldn\'t reach Name.com' . ($err ? ": $err" : " (HTTP $status)") . '.');
    }
    return $json;
}

/** Our selling price for one year, in cents: Name.com's price plus the markup, rounded up to .99. */
function domain_sale_cents(float $wholesale): int
{
    $total = $wholesale + (float) registrar_settings()['markup'];
    return (int) (ceil($total) * 100 - 1);
}

/**
 * Check availability and prices.
 * @param list<string> $domains
 * @return list<array{domain:string, available:bool, wholesale:float, renewal:float, price_cents:int}>
 */
function registrar_check(array $domains): array
{
    $json = registrar_request('POST', '/domains:checkAvailability', ['domainNames' => array_values($domains)]);
    $out = [];
    foreach ((array) ($json['results'] ?? []) as $r) {
        $name = strtolower((string) ($r['domainName'] ?? ''));
        // Premium and aftermarket names have unusual prices; only sell regular registrations.
        $available = !empty($r['purchasable']) && empty($r['premium'])
            && (($r['purchaseType'] ?? 'registration') === 'registration');
        $wholesale = (float) ($r['purchasePrice'] ?? 0);
        $out[] = [
            'domain' => $name,
            'available' => $available && $wholesale > 0,
            'wholesale' => $wholesale,
            'renewal' => (float) ($r['renewalPrice'] ?? $wholesale),
            'price_cents' => $wholesale > 0 ? domain_sale_cents(max($wholesale, (float) ($r['renewalPrice'] ?? 0))) : 0,
        ];
    }
    return $out;
}

/** Register a domain for one year with the customer as the owner. Returns Name.com's domain record. */
function registrar_register(string $domain, array $contact, float $maxPrice): array
{
    $c = [
        'firstName' => $contact['first_name'], 'lastName' => $contact['last_name'],
        'companyName' => $contact['company'] ?? '', 'address1' => $contact['address1'], 'address2' => $contact['address2'] ?? '',
        'city' => $contact['city'], 'state' => $contact['state'], 'zip' => $contact['zip'], 'country' => $contact['country'],
        'phone' => $contact['phone'], 'email' => $contact['email'],
    ];
    $json = registrar_request('POST', '/domains', [
        'domain' => [
            'domainName' => $domain,
            'contacts' => ['registrant' => $c, 'admin' => $c, 'tech' => $c, 'billing' => $c],
            // Rowan Copy renews it when the customer's yearly payment goes through.
            'autorenewEnabled' => false,
        ],
        // Name.com refuses the purchase if its price is now higher than this.
        'purchasePrice' => $maxPrice,
        'years' => 1,
    ]);
    return (array) ($json['domain'] ?? $json);
}

function registrar_renew(string $domain, float $maxPrice): array
{
    return registrar_request('POST', '/domains/' . rawurlencode($domain) . ':renew', ['purchasePrice' => $maxPrice, 'years' => 1]);
}

/** Point the domain at Rowan Copy: website (root and www) and email (MX, SPF). */
function registrar_point_to_server(string $domain): void
{
    $ip = (string) cfg('server_ip');
    if ($ip === '') {
        throw new RegistrarError('Set server_ip in config.php so new domains can be pointed at your server.');
    }
    $records = [
        ['host' => '', 'type' => 'A', 'answer' => $ip, 'ttl' => 300],
        ['host' => 'www', 'type' => 'A', 'answer' => $ip, 'ttl' => 300],
        ['host' => 'mail', 'type' => 'A', 'answer' => $ip, 'ttl' => 300],
        ['host' => 'webmail', 'type' => 'A', 'answer' => $ip, 'ttl' => 300],
        ['host' => '', 'type' => 'MX', 'answer' => 'mail.' . $domain, 'priority' => 10, 'ttl' => 300],
        ['host' => '', 'type' => 'TXT', 'answer' => 'v=spf1 a mx ip4:' . $ip . ' ~all', 'ttl' => 300],
    ];
    foreach ($records as $r) {
        registrar_request('POST', '/domains/' . rawurlencode($domain) . '/records', $r);
    }
}

/** Contact details Name.com needs for the domain owner (they're published to WHOIS privacy where supported). */
function validate_registrant(array $in): array
{
    $v = [];
    foreach (['first_name' => 60, 'last_name' => 60, 'company' => 100, 'address1' => 100, 'address2' => 100, 'city' => 60,
        'state' => 60, 'zip' => 20, 'country' => 2, 'phone' => 30, 'email' => 200] as $k => $max) {
        $v[$k] = is_string($in[$k] ?? null) ? mb_substr(trim($in[$k]), 0, $max) : '';
    }
    $v['country'] = strtoupper($v['country'] ?: 'US');
    $errors = [];
    foreach (['first_name' => 'first name', 'last_name' => 'last name', 'address1' => 'street address', 'city' => 'city', 'zip' => 'ZIP / postal code'] as $k => $label) {
        if ($v[$k] === '') {
            $errors[$k] = "Enter your $label.";
        }
    }
    if ($v['country'] === 'US' && !preg_match('/^[A-Z]{2}$/i', $v['state'])) {
        $errors['state'] = 'Enter the 2-letter state, like MD.';
    }
    if (!preg_match('/^[A-Z]{2}$/', $v['country'])) {
        $errors['country'] = 'Use a 2-letter country code, like US.';
    }
    if (!filter_var($v['email'], FILTER_VALIDATE_EMAIL)) {
        $errors['email'] = 'Enter a valid email.';
    }
    // Registrars want phones as +CountryCode.Number, e.g. +1.4105551234
    $digits = preg_replace('/\D/', '', $v['phone']) ?? '';
    if ($v['country'] === 'US' && strlen($digits) === 10) {
        $v['phone'] = '+1.' . $digits;
    } elseif ($v['country'] === 'US' && strlen($digits) === 11 && $digits[0] === '1') {
        $v['phone'] = '+1.' . substr($digits, 1);
    } elseif (preg_match('/^\+(\d{1,3})[ .-]?(\d{4,14})$/', preg_replace('/[\s()-]/', '', $v['phone']) ?? '', $m)) {
        $v['phone'] = '+' . $m[1] . '.' . $m[2];
    } else {
        $errors['phone'] = 'Enter a phone number, like 410-555-1234.';
    }
    $v['state'] = strtoupper($v['state']);
    return [$v, $errors];
}
