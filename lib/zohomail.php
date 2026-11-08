<?php
// ============================================================================
// ROWAN COPY: ZOHO MAIL (email accounts on customers' and staff domains)
// Every mailbox anyone creates through Rowan Copy is a Zoho Mail account in
// Rowan Copy's Zoho organization (zoid). Uses the same Zoho connection as CRM
// (Admin -> Integrations); the connection needs the ZohoMail scopes too.
// API reference: https://www.zoho.com/mail/help/api/
// ============================================================================

declare(strict_types=1);

const ZOHO_MAIL_SCOPES = 'ZohoMail.organization.accounts.ALL,ZohoMail.organization.domains.ALL,ZohoMail.accounts.READ';

/** Zoho's regional suffix (zoho.com, zoho.eu, ...) for the connected account. */
function zoho_region_suffix(): string
{
    $host = app_secret('ZOHO_ACCOUNTS_HOST') ?: 'accounts.zoho.com';
    return (string) preg_replace('/^accounts\./', '', $host);
}

function zoho_mail_base(): string
{
    $test = getenv('RC_ZOHO_TEST_URL');
    return is_string($test) && $test !== '' ? rtrim($test, '/') : 'https://mail.' . zoho_region_suffix();
}

function zoho_mail_webmail_url(): string
{
    return 'https://mail.' . zoho_region_suffix();
}

function zoho_mail_enabled(): bool
{
    return zoho_crm_enabled() && app_secret('ZOHO_MAIL_ZOID') !== '';
}

/** The DNS records a domain needs for Zoho Mail (MX + SPF), per Zoho's regional servers. */
function zoho_mail_dns_records(string $verifyCode = '', ?string $dkimSelector = null, ?string $dkimValue = null): array
{
    $suffix = zoho_region_suffix();
    $spfInclude = $suffix === 'zohocloud.ca' ? 'zohocloud.ca' : preg_replace('/^zoho\./', 'zohomail.', $suffix);
    $records = [];
    if ($verifyCode !== '') {
        $records[] = ['type' => 'TXT', 'host' => '@', 'value' => "zoho-verification=$verifyCode.zmverify.$suffix", 'purpose' => 'Proves you own the domain'];
    }
    foreach ([['mx', 10], ['mx2', 20], ['mx3', 50]] as [$mx, $priority]) {
        $records[] = ['type' => 'MX', 'host' => '@', 'value' => "$mx.$suffix", 'priority' => $priority, 'purpose' => 'Delivers email to Zoho'];
    }
    $records[] = ['type' => 'TXT', 'host' => '@', 'value' => "v=spf1 include:$spfInclude ~all", 'purpose' => 'SPF: lets Zoho send as you (merge into any existing SPF record)'];
    if ($dkimSelector && $dkimValue) {
        $records[] = ['type' => 'TXT', 'host' => $dkimSelector . '._domainkey', 'value' => $dkimValue, 'purpose' => 'DKIM: signs your email so it isn\'t marked as spam'];
    }
    return $records;
}

/** Call the Zoho Mail API. Returns the response's data; throws ZohoError with Zoho's reason on failure. */
function zmail(string $method, string $path, ?array $body = null): array
{
    [$status, $res] = zoho_http($method, zoho_mail_base() . $path, null, $body, zoho_access_token());
    $code = (int) ($res['status']['code'] ?? $status);
    if ($status >= 400 || $code >= 400) {
        $why = (string) ($res['data']['moreInfo'] ?? $res['status']['description'] ?? "HTTP $status");
        if ($status === 401 || str_contains(strtolower($why), 'scope')) {
            $why .= ' (reconnect Zoho on Admin -> Integrations with the Mail scopes included)';
        }
        throw new ZohoError("Zoho Mail: $why");
    }
    return is_array($res['data'] ?? null) ? $res['data'] : [];
}

function zmail_org_path(string $suffix = ''): string
{
    $zoid = app_secret('ZOHO_MAIL_ZOID');
    if (!preg_match('/^\d+$/', $zoid)) {
        throw new ZohoError('Zoho Mail isn\'t connected yet (no organization ID).');
    }
    return "/api/organization/$zoid$suffix";
}

/** Find the organization ID from the connected admin's own account (GET /api/accounts). */
function zoho_mail_detect_zoid(): string
{
    $data = zmail('GET', '/api/accounts');
    $find = function ($v) use (&$find) {
        if (is_array($v)) {
            if (isset($v['zoid']) && preg_match('/^\d+$/', (string) $v['zoid'])) {
                return (string) $v['zoid'];
            }
            foreach ($v as $x) {
                if (($r = $find($x)) !== '') {
                    return $r;
                }
            }
        }
        return '';
    };
    $zoid = $find($data);
    if ($zoid === '') {
        throw new ZohoError('Couldn\'t find your Zoho Mail organization. Is the connected Zoho user a Zoho Mail admin?');
    }
    save_secrets(['ZOHO_MAIL_ZOID' => $zoid]);
    return $zoid;
}

function zmail_add_domain(string $domain): string
{
    $data = zmail('POST', zmail_org_path('/domains'), ['domainName' => $domain]);
    return (string) ($data['CNAMEVerificationCode'] ?? '');
}

function zmail_domain_info(string $domain): array
{
    return zmail('GET', zmail_org_path('/domains/' . rawurlencode($domain)));
}

function zmail_domain_action(string $domain, array $body): array
{
    return zmail('PUT', zmail_org_path('/domains/' . rawurlencode($domain)), $body);
}

function zmail_delete_domain(string $domain): void
{
    zmail('DELETE', zmail_org_path('/domains/' . rawurlencode($domain)));
}

/** @return array{zuid:string, account_id:string} */
function zmail_create_account(string $email, string $password, string $name): array
{
    $parts = preg_split('/\s+/', trim($name)) ?: [];
    $last = count($parts) > 1 ? (string) array_pop($parts) : '';
    $data = zmail('POST', zmail_org_path('/accounts'), array_filter([
        'primaryEmailAddress' => $email, 'password' => $password,
        'firstName' => implode(' ', $parts) ?: strtok($email, '@'), 'lastName' => $last,
        'displayName' => trim($name) ?: strtok($email, '@'), 'role' => 'member', 'oneTimePassword' => false,
    ], fn ($v) => $v !== ''));
    return ['zuid' => (string) ($data['zuid'] ?? ''), 'account_id' => (string) ($data['accountId'] ?? '')];
}

function zmail_reset_password(string $zuid, string $password): void
{
    zmail('PUT', zmail_org_path('/accounts/' . rawurlencode($zuid)), [
        'password' => $password, 'zuid' => $zuid, 'mode' => 'resetPassword', 'oneTimePassword' => false,
    ]);
}

function zmail_delete_account(string $email): void
{
    zmail('DELETE', zmail_org_path('/accounts'), ['emailList' => [$email]]);
}

// ---------------------------------------------------------------------------
// Customer domains and mailboxes (tables mail_domains, mail_accounts)
// ---------------------------------------------------------------------------

function user_mail_domains(int $userId): array
{
    $stmt = db()->prepare('SELECT * FROM mail_domains WHERE user_id = ? ORDER BY domain');
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
}

function mail_domain_accounts(int $mailDomainId): array
{
    $stmt = db()->prepare('SELECT * FROM mail_accounts WHERE mail_domain_id = ? ORDER BY email');
    $stmt->execute([$mailDomainId]);
    return $stmt->fetchAll();
}

/** Domains a customer may not add: Rowan Copy's own (staff email) and its subdomains. */
function mail_domain_reserved(string $domain): bool
{
    $own = array_filter([
        strtolower((string) parse_url((string) cfg('base_url'), PHP_URL_HOST)),
        strtolower((string) cfg('mail_domain', '')),
    ]);
    foreach ($own as $o) {
        $o = (string) preg_replace('/^(www|app|portal)\./', '', $o);
        if ($domain === $o || str_ends_with($domain, '.' . $o)) {
            return true;
        }
    }
    return false;
}

/** Put the records in DNS automatically when Rowan Copy sold the domain (Name.com). Returns true if done. */
function mail_domain_autodns(string $domain, array $records): bool
{
    if (!domain_was_bought($domain) || !registrar_enabled()) {
        return false;
    }
    foreach ($records as $r) {
        $body = ['host' => $r['host'] === '@' ? '' : $r['host'], 'type' => $r['type'], 'answer' => $r['value'], 'ttl' => 300];
        if (isset($r['priority'])) {
            $body['priority'] = $r['priority'];
        }
        try {
            registrar_request('POST', '/domains/' . rawurlencode($domain) . '/records', $body);
        } catch (RegistrarError $e) {
            if (!preg_match('/exist|duplicate/i', $e->getMessage())) {
                throw $e;
            }
        }
    }
    return true;
}

/** Re-check a domain with Zoho and store its verification, MX, SPF and DKIM status. */
function mail_domain_refresh(array $md): array
{
    $domain = (string) $md['domain'];
    $set = [];
    if (!$md['verified']) {
        $r = zmail_domain_action($domain, ['mode' => 'verifyDomainByTXT']);
        if (!empty($r['status'])) {
            $set['verified'] = 1;
            zmail_domain_action($domain, ['mode' => 'enableMailHosting']);
        }
    }
    if (($set['verified'] ?? $md['verified']) && !$md['dkim_id']) {
        $d = zmail_domain_action($domain, ['mode' => 'addDkimDetail', 'selector' => 'zmail', 'isDefault' => true, 'keySize' => 1024]);
        $set += ['dkim_selector' => (string) ($d['selector'] ?? 'zmail'), 'dkim_value' => (string) ($d['publicKey'] ?? ''),
            'dkim_id' => (string) ($d['dkimId'] ?? $d['id'] ?? '')];
        if ($set['dkim_value'] !== '') {
            $dkimRecords = zoho_mail_dns_records('', $set['dkim_selector'], $set['dkim_value']);
            try {
                mail_domain_autodns($domain, [end($dkimRecords)]);
            } catch (Throwable $e) {
                error_log("Rowan Copy: could not add the DKIM record for $domain automatically: " . $e->getMessage());
            }
        }
    }
    if ($set['verified'] ?? $md['verified']) {
        $set['mx_ok'] = (int) !empty(zmail_domain_action($domain, ['mode' => 'verifyMxRecord'])['mxstatus']);
        $set['spf_ok'] = (int) !empty(zmail_domain_action($domain, ['mode' => 'verifySpfRecord'])['spfstatus']);
        $dkimId = $set['dkim_id'] ?? $md['dkim_id'];
        if ($dkimId && !$md['dkim_ok']) {
            $set['dkim_ok'] = (int) !empty(zmail_domain_action($domain, ['mode' => 'verifyDkimKey', 'dkimId' => $dkimId])['dkimstatus']);
        }
    }
    if ($set) {
        $cols = implode(', ', array_map(fn ($k) => "$k = ?", array_keys($set)));
        db()->prepare("UPDATE mail_domains SET $cols WHERE id = ?")->execute([...array_values($set), $md['id']]);
    }
    $stmt = db()->prepare('SELECT * FROM mail_domains WHERE id = ?');
    $stmt->execute([$md['id']]);
    return $stmt->fetch();
}

/** Remove everything a customer has in Zoho Mail (account deletion). Best effort; logs failures. */
function mail_cleanup_user(int $userId): void
{
    if (!zoho_mail_enabled()) {
        return;
    }
    foreach (user_mail_domains($userId) as $md) {
        try {
            foreach (mail_domain_accounts((int) $md['id']) as $a) {
                zmail_delete_account((string) $a['email']);
            }
            zmail_delete_domain((string) $md['domain']);
        } catch (Throwable $e) {
            error_log('Rowan Copy Zoho Mail cleanup for user ' . $userId . ': ' . $e->getMessage());
        }
    }
}
