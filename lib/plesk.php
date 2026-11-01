<?php
// ============================================================================
// ROWAN COPY: PLESK CONNECTOR
// Talks to this server's Plesk through its XML management API
// (https://<host>:8443/enterprise/control/agent.php) using a secret key that
// only works from 127.0.0.1. Customers never talk to Plesk directly: every
// call here is made on behalf of a domain they've been linked to, and every
// value is validated before it is sent.
// ============================================================================

declare(strict_types=1);

final class PleskError extends RuntimeException
{
}

function plesk_enabled(): bool
{
    $p = (array) cfg('plesk', []);
    return !empty($p['url']) && !empty($p['key']);
}

/** Send one XML packet to Plesk and return the parsed response. Throws PleskError. */
function plesk_request(string $innerXml): SimpleXMLElement
{
    if (!plesk_enabled()) {
        throw new PleskError('Plesk is not connected yet. Add the Plesk API key to config.php.');
    }
    $p = (array) cfg('plesk');
    $url = rtrim((string) $p['url'], '/') . '/enterprise/control/agent.php';
    $host = strtolower((string) parse_url($url, PHP_URL_HOST));
    // Certificate checks may only be skipped for this machine itself.
    $verify = (bool) ($p['verify_tls'] ?? true) || !in_array($host, ['127.0.0.1', 'localhost', '::1', '[::1]'], true);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => '<?xml version="1.0" encoding="UTF-8"?><packet>' . $innerXml . '</packet>',
        CURLOPT_HTTPHEADER => ['Content-Type: text/xml', 'KEY: ' . $p['key']],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_CONNECTTIMEOUT => 10,
        // Plesk on 127.0.0.1 usually has a self-signed certificate. The traffic never
        // leaves this machine, so verify_tls may be false for a loopback URL only.
        CURLOPT_SSL_VERIFYPEER => $verify,
        CURLOPT_SSL_VERIFYHOST => $verify ? 2 : 0,
    ]);
    $body = curl_exec($ch);
    $err = curl_error($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false || $code !== 200) {
        error_log("Rowan Copy: Plesk API HTTP $code $err");
        throw new PleskError('Could not reach the Plesk API' . ($err ? ': ' . $err : " (HTTP $code)") . '.');
    }
    $prev = libxml_use_internal_errors(true);
    $xml = simplexml_load_string((string) $body, SimpleXMLElement::class, LIBXML_NONET);
    libxml_use_internal_errors($prev);
    if (!$xml) {
        throw new PleskError('Plesk sent back a response we could not read.');
    }
    // Packet-level failure (bad key, API disabled, ...)
    if (isset($xml->system) && (string) $xml->system->status === 'error') {
        throw new PleskError('Plesk: ' . (string) $xml->system->errtext);
    }
    return $xml;
}

/** Throw if any <result> in the response failed; returns the list of <result> nodes. */
function plesk_results(SimpleXMLElement $xml, bool $allowEmpty = true): array
{
    $results = $xml->xpath('//result') ?: [];
    foreach ($results as $r) {
        if ((string) $r->status === 'error') {
            throw new PleskError((string) $r->errtext ?: 'Plesk reported an error.');
        }
    }
    if (!$allowEmpty && !$results) {
        throw new PleskError('Plesk returned no result.');
    }
    return $results;
}

function plesk_x(string $v): string
{
    return htmlspecialchars($v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

/**
 * Every domain hosted in Plesk: subscriptions (webspaces) and their extra sites.
 * @return array<int, array{id:int, name:string}> keyed by Plesk site id
 */
function plesk_list_domains(): array
{
    $domains = [];
    foreach (['webspace', 'site'] as $op) {
        $xml = plesk_request("<$op><get><filter/><dataset><gen_info/></dataset></get></$op>");
        foreach (plesk_results($xml) as $r) {
            $name = strtolower((string) ($r->data->gen_info->name ?? ''));
            $id = (int) $r->id;
            if ($id > 0 && $name !== '') {
                $domains[$id] = ['id' => $id, 'name' => $name];
            }
        }
    }
    uasort($domains, fn ($a, $b) => strcmp($a['name'], $b['name']));
    return $domains;
}

/** Find the Plesk site id for a domain name, or null if it isn't hosted here. */
function plesk_find_domain(string $name): ?int
{
    foreach (plesk_list_domains() as $d) {
        if ($d['name'] === strtolower($name)) {
            return $d['id'];
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Email accounts
// ---------------------------------------------------------------------------

const MAIL_LOCAL_RE = '/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/';

function valid_mail_local(string $local): bool
{
    return (bool) preg_match(MAIL_LOCAL_RE, $local) && !str_contains($local, '..');
}

/** @return list<array{name:string, enabled:bool}> mailbox names (the part before @) */
function plesk_list_mailboxes(int $siteId): array
{
    $xml = plesk_request('<mail><get_info><filter><site-id>' . $siteId . '</site-id></filter><mailbox/></get_info></mail>');
    plesk_results($xml);
    $boxes = [];
    foreach ($xml->xpath('//mailname') ?: [] as $m) {
        $name = strtolower((string) $m->name);
        if ($name !== '') {
            $boxes[$name] = [
                'name' => $name,
                'enabled' => !isset($m->mailbox->enabled) || (string) $m->mailbox->enabled !== 'false',
            ];
        }
    }
    ksort($boxes);
    return array_values($boxes);
}

function plesk_create_mailbox(int $siteId, string $local, string $password): void
{
    if (!valid_mail_local($local)) {
        throw new PleskError('Use only letters, numbers, dots, dashes and underscores before the @.');
    }
    plesk_results(plesk_request(
        '<mail><create><filter><site-id>' . $siteId . '</site-id><mailname><name>' . plesk_x($local) . '</name>'
        . '<mailbox><enabled>true</enabled></mailbox>'
        . '<password><value>' . plesk_x($password) . '</value><type>plain</type></password>'
        . '</mailname></filter></create></mail>'
    ), false);
}

function plesk_set_mailbox_password(int $siteId, string $local, string $password): void
{
    if (!valid_mail_local($local)) {
        throw new PleskError('Invalid email account.');
    }
    plesk_results(plesk_request(
        '<mail><update><set><filter><site-id>' . $siteId . '</site-id><mailname><name>' . plesk_x($local) . '</name>'
        . '<password><value>' . plesk_x($password) . '</value><type>plain</type></password>'
        . '</mailname></filter></set></update></mail>'
    ), false);
}

function plesk_remove_mailbox(int $siteId, string $local): void
{
    if (!valid_mail_local($local)) {
        throw new PleskError('Invalid email account.');
    }
    plesk_results(plesk_request(
        '<mail><remove><filter><site-id>' . $siteId . '</site-id><name>' . plesk_x($local) . '</name></filter></remove></mail>'
    ), false);
}

// ---------------------------------------------------------------------------
// DNS records
// Only everyday record types are editable. NS and SOA are never touched, so a
// customer can't take their whole domain offline by accident.
// ---------------------------------------------------------------------------

const DNS_EDITABLE_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT'];

/** @return list<array{id:int, type:string, host:string, value:string, opt:string}> */
function plesk_list_dns(int $siteId): array
{
    $xml = plesk_request('<dns><get_rec><filter><site-id>' . $siteId . '</site-id></filter></get_rec></dns>');
    $records = [];
    foreach (plesk_results($xml) as $r) {
        if (!isset($r->data)) {
            continue;
        }
        $records[] = [
            'id' => (int) $r->id,
            'type' => strtoupper((string) $r->data->type),
            'host' => rtrim((string) $r->data->host, '.'),
            'value' => rtrim((string) $r->data->value, '.'),
            'opt' => (string) ($r->data->opt ?? ''),
        ];
    }
    usort($records, fn ($a, $b) => [$a['type'], $a['host']] <=> [$b['type'], $b['host']]);
    return $records;
}

/** Validate a record the customer typed. Returns [host, value, opt] ready for Plesk. */
function dns_validate(string $type, string $host, string $value, string $priority): array
{
    $type = strtoupper($type);
    if (!in_array($type, DNS_EDITABLE_TYPES, true)) {
        throw new PleskError('That record type can\'t be edited here.');
    }
    $host = strtolower(trim($host));
    $host = $host === '@' ? '' : rtrim($host, '.');
    if ($host !== '' && !preg_match('/^(\*|[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?)(\.[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?)*$/', $host)) {
        throw new PleskError('Host must be @ (the domain itself) or a name like www or mail.');
    }
    $value = trim($value);
    $hostname = '/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i';
    $opt = '';
    switch ($type) {
        case 'A':
            if (!filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                throw new PleskError('An A record needs an IPv4 address like 203.0.113.10.');
            }
            break;
        case 'AAAA':
            if (!filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
                throw new PleskError('An AAAA record needs an IPv6 address.');
            }
            break;
        case 'CNAME':
            if (!preg_match($hostname, $value)) {
                throw new PleskError('A CNAME record needs a hostname like example.com.');
            }
            if ($host === '') {
                throw new PleskError('A CNAME can\'t be used on the domain itself (@). Use an A record instead.');
            }
            break;
        case 'MX':
            if (!preg_match($hostname, $value)) {
                throw new PleskError('An MX record needs a mail server hostname.');
            }
            $opt = (string) max(0, min(65535, (int) ($priority !== '' ? $priority : 10)));
            break;
        case 'TXT':
            if ($value === '' || strlen($value) > 1024 || preg_match('/[\x00-\x1f]/', $value)) {
                throw new PleskError('TXT text must be 1 to 1024 characters on one line.');
            }
            break;
    }
    return [$host, rtrim($value, '.'), $opt];
}

function plesk_add_dns(int $siteId, string $type, string $host, string $value, string $priority = ''): void
{
    [$host, $value, $opt] = dns_validate($type, $host, $value, $priority);
    plesk_results(plesk_request(
        '<dns><add_rec><site-id>' . $siteId . '</site-id><type>' . plesk_x(strtoupper($type)) . '</type>'
        . '<host>' . plesk_x($host) . '</host><value>' . plesk_x($value) . '</value>'
        . ($opt !== '' ? '<opt>' . plesk_x($opt) . '</opt>' : '')
        . '</add_rec></dns>'
    ), false);
}

function plesk_delete_dns(int $siteId, int $recordId): void
{
    // Re-read the zone so a customer can only delete an editable record on their own domain.
    foreach (plesk_list_dns($siteId) as $r) {
        if ($r['id'] === $recordId) {
            if (!in_array($r['type'], DNS_EDITABLE_TYPES, true)) {
                throw new PleskError('That record type can\'t be edited here.');
            }
            plesk_results(plesk_request('<dns><del_rec><filter><id>' . $recordId . '</id></filter></del_rec></dns>'), false);
            return;
        }
    }
    throw new PleskError('Record not found.');
}

// ---------------------------------------------------------------------------
// Linking customers to their Plesk domains (stored in our database)
// ---------------------------------------------------------------------------

function user_hosting_domains(int $userId): array
{
    $stmt = db()->prepare('SELECT * FROM hosting_domains WHERE user_id = ? ORDER BY domain');
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
}

/** Load a linked domain and make sure it belongs to this user. */
function owned_hosting_domain(int $id, array $user): array
{
    $stmt = db()->prepare('SELECT * FROM hosting_domains WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $user['id']]);
    $d = $stmt->fetch();
    if (!$d) {
        http_response_code(404);
        exit('Domain not found.');
    }
    return $d;
}

// ---------------------------------------------------------------------------
// Plesk command-line actions, run through Plesk's REST API
// (POST /api/v2/cli/<command>/call) with the same secret key. Only the
// commands below are ever sent, with validated arguments.
// ---------------------------------------------------------------------------

/** @return array{code:int, stdout:string, stderr:string} */
function plesk_cli(string $command, array $params): array
{
    if (!in_array($command, ['site-alias', 'domain'], true)) {
        throw new PleskError('That Plesk command is not allowed.');
    }
    if (!plesk_enabled()) {
        throw new PleskError('Plesk is not connected yet. Add the Plesk API key to config.php.');
    }
    $p = (array) cfg('plesk');
    $url = rtrim((string) $p['url'], '/') . '/api/v2/cli/' . $command . '/call';
    $host = strtolower((string) parse_url($url, PHP_URL_HOST));
    $verify = (bool) ($p['verify_tls'] ?? true) || !in_array($host, ['127.0.0.1', 'localhost', '::1', '[::1]'], true);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(['params' => array_values(array_map('strval', $params))]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-API-Key: ' . $p['key']],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => $verify,
        CURLOPT_SSL_VERIFYHOST => $verify ? 2 : 0,
    ]);
    $body = curl_exec($ch);
    $err = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $json = is_string($body) ? json_decode($body, true) : null;
    if ($status !== 200 || !is_array($json)) {
        error_log("Rowan Copy: Plesk CLI $command HTTP $status $err " . substr((string) $body, 0, 500));
        throw new PleskError('Plesk did not accept the request' . ($err ? ": $err" : " (HTTP $status)") . '.');
    }
    $result = ['code' => (int) ($json['code'] ?? 1), 'stdout' => (string) ($json['stdout'] ?? ''), 'stderr' => (string) ($json['stderr'] ?? '')];
    if ($result['code'] !== 0) {
        error_log("Rowan Copy: Plesk CLI $command failed: " . $result['stderr'] . $result['stdout']);
        throw new PleskError('Plesk: ' . trim($result['stderr'] ?: $result['stdout'] ?: 'the command failed.'));
    }
    return $result;
}

/** The main Rowan Copy domain in Plesk (customer domains are attached to it). */
function main_plesk_domain(): string
{
    $host = strtolower((string) (cfg('mail_domain') ?: parse_url((string) cfg('base_url'), PHP_URL_HOST)));
    return preg_replace('/^(www|app|portal)\./', '', $host) ?? $host;
}

/** Point a customer's own domain (and www) at the Rowan Copy app as a Plesk domain alias. */
function plesk_add_site_alias(string $domain): void
{
    if (normalize_domain($domain) !== $domain) {
        throw new PleskError('Invalid domain.');
    }
    try {
        plesk_cli('site-alias', ['--create', $domain, '-domain', main_plesk_domain(), '-www', 'true']);
    } catch (PleskError $e) {
        if (stripos($e->getMessage(), 'exist') === false) {
            throw $e; // "already exists" means it's connected; anything else is a real failure
        }
    }
}

function plesk_remove_site_alias(string $domain): void
{
    if (normalize_domain($domain) !== $domain) {
        throw new PleskError('Invalid domain.');
    }
    plesk_cli('site-alias', ['--remove', $domain]);
}

/**
 * Create a purchased domain in Plesk as an add-on domain of the main subscription:
 * it gets its own email service, and its website is the Rowan Copy app (same
 * document root), which shows the customer's site for that domain.
 */
function plesk_add_hosted_domain(string $domain): void
{
    if (normalize_domain($domain) !== $domain) {
        throw new PleskError('Invalid domain.');
    }
    $params = ['--create', $domain, '-webspace-name', main_plesk_domain(), '-www-root', (string) cfg('plesk_docroot', 'httpdocs')];
    if (cfg('server_ip')) {
        array_push($params, '-ip', (string) cfg('server_ip'));
    }
    try {
        plesk_cli('domain', $params);
    } catch (PleskError $e) {
        if (stripos($e->getMessage(), 'exist') === false) {
            throw $e;
        }
    }
}

/**
 * Does the domain (and www) point at this server yet?
 * @return array{ok:bool, root:list<string>, www:list<string>}
 */
function domain_points_here(string $domain): array
{
    $ip = (string) cfg('server_ip');
    $lookup = function (string $host): array {
        $recs = @dns_get_record($host, DNS_A);
        return array_values(array_unique(array_map(fn ($r) => (string) ($r['ip'] ?? ''), is_array($recs) ? $recs : [])));
    };
    $root = $lookup($domain);
    $www = $lookup('www.' . $domain);
    return ['ok' => $ip !== '' && in_array($ip, $root, true), 'root' => $root, 'www' => $www];
}
