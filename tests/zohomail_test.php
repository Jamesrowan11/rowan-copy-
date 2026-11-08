<?php
// Tests Zoho Mail domains and mailboxes against a fake Zoho server on localhost.
// Run: php tests/zohomail_test.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$tmp = sys_get_temp_dir() . '/rc-zmail-test-' . bin2hex(random_bytes(4));
mkdir($tmp, 0700, true);
file_put_contents("$tmp/config.php", '<?php return ' . var_export(['base_url' => 'https://rowancopy.test', 'data_dir' => "$tmp/data", 'mail_domain' => 'rowancopy.test',
    'plans' => ['free' => ['name' => 'Free', 'max_mailboxes' => 0], 'pro' => ['name' => 'Pro', 'max_mailboxes' => 2]]], true) . ';');
file_put_contents("$tmp/fake.php", <<<'PHP'
<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$m = $_SERVER['REQUEST_METHOD'];
$json = json_decode(file_get_contents('php://input'), true) ?: [];
file_put_contents(__DIR__ . '/req.jsonl', json_encode(['m' => $m, 'path' => $path, 'json' => $json, 'auth' => getallheaders()['Authorization'] ?? '']) . "\n", FILE_APPEND);
header('Content-Type: application/json');
$ok = fn ($data = null) => print(json_encode(['status' => ['code' => 200, 'description' => 'success']] + ($data === null ? [] : ['data' => $data])));
if ($path === '/oauth/v2/token') { echo '{"access_token":"at","refresh_token":"rt","api_domain":"https://www.zohoapis.com","expires_in":3600}'; return; }
if ($path === '/api/accounts') { $ok([['accountId' => '9', 'primaryEmailAddress' => 'admin@rowancopy.test', 'policyId' => ['1' => 'x', 'zoid' => 55501]]]); return; }
if ($path === '/api/organization/55501/domains' && $m === 'POST') { http_response_code(201); echo json_encode(['status' => ['code' => 201], 'data' => ['CNAMEVerificationCode' => 'zb4242', 'domainName' => $json['domainName']]]); return; }
if (preg_match('#^/api/organization/55501/domains/([^/]+)$#', $path, $d)) {
    if ($m === 'DELETE') { $ok(); return; }
    $mode = $json['mode'] ?? '';
    $pass = !str_contains($d[1], 'unverified');
    match ($mode) {
        'verifyDomainByTXT' => $ok(['status' => $pass]),
        'enableMailHosting' => $ok(),
        'addDkimDetail' => $ok(['selector' => $json['selector'], 'publicKey' => 'v=DKIM1; k=rsa; p=ABC', 'dkimId' => '8800']),
        'verifyMxRecord' => $ok(['mxstatus' => true]),
        'verifySpfRecord' => $ok(['spfstatus' => false]),
        'verifyDkimKey' => $ok(['dkimstatus' => true]),
        default => print('{"status":{"code":400,"description":"bad mode"}}'),
    };
    return;
}
if ($path === '/api/organization/55501/accounts' && $m === 'POST') {
    if (str_starts_with($json['primaryEmailAddress'], 'taken@')) { http_response_code(400); echo '{"status":{"code":400,"description":"Invalid Input"},"data":{"moreInfo":"Email address already exists"}}'; return; }
    $ok(['zuid' => 777, 'accountId' => 'a1', 'primaryEmailAddress' => $json['primaryEmailAddress']]); return;
}
if ($path === '/api/organization/55501/accounts' && $m === 'DELETE') { $ok(); return; }
if ($path === '/api/organization/55501/accounts/777' && $m === 'PUT') { $ok(); return; }
http_response_code(404); echo '{"status":{"code":404,"description":"not found"}}';
PHP);
$port = random_int(20000, 40000);
$server = proc_open(['php', '-S', "127.0.0.1:$port", "$tmp/fake.php"], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
usleep(500000);
putenv("RC_CONFIG=$tmp/config.php");
putenv("RC_ZOHO_TEST_URL=http://127.0.0.1:$port");
require __DIR__ . '/../lib/bootstrap.php';

$failed = 0;
function check(string $name, bool $ok): void
{
    global $failed;
    echo ($ok ? 'ok   ' : 'FAIL ') . $name . "\n";
    $failed += $ok ? 0 : 1;
}
function reqs(string $tmp): array
{
    return array_map(fn ($l) => json_decode($l, true), array_values(array_filter(explode("\n", (string) @file_get_contents("$tmp/req.jsonl")))));
}

check('mail off before connecting', !zoho_mail_enabled());
zoho_connect('accounts.zoho.com', '1000.ABCDEFGHIJ', 'secretsecret', 'good-code');
check('connected but no organization yet', zoho_crm_enabled() && !zoho_mail_enabled());
check('organization detected from the admin account', zoho_mail_detect_zoid() === '55501' && zoho_mail_enabled());
check('webmail address by region', zoho_mail_webmail_url() === 'https://mail.zoho.com');

// DNS records
$recs = zoho_mail_dns_records('zb4242');
check('verification TXT', $recs[0]['value'] === 'zoho-verification=zb4242.zmverify.zoho.com');
check('three MX records', count(array_filter($recs, fn ($r) => $r['type'] === 'MX')) === 3 && $recs[1]['value'] === 'mx.zoho.com');
check('SPF include', in_array('v=spf1 include:zohomail.com ~all', array_column($recs, 'value'), true));
save_secrets(['ZOHO_ACCOUNTS_HOST' => 'accounts.zoho.eu']);
check('EU region records', zoho_mail_dns_records()[0]['value'] === 'mx.zoho.eu' && zoho_mail_dns_records()[3]['value'] === 'v=spf1 include:zohomail.eu ~all');
save_secrets(['ZOHO_ACCOUNTS_HOST' => 'accounts.zoho.com']);

// Reserved domains
check('own domain reserved', mail_domain_reserved('rowancopy.test') && mail_domain_reserved('staff.rowancopy.test'));
check('customer domain allowed', !mail_domain_reserved('joesbakery.com'));

// Customer flow
db()->exec("INSERT INTO users (id, email, name, password_hash, plan) VALUES (1, 'joe@example.com', 'Joe', 'x', 'pro')");
$code = zmail_add_domain('joesbakery.com');
check('domain added, verification code returned', $code === 'zb4242');
db()->prepare('INSERT INTO mail_domains (user_id, domain, verify_code) VALUES (1, ?, ?)')->execute(['joesbakery.com', $code]);
$md = mail_domain_refresh(user_mail_domains(1)[0]);
check('verified, hosting enabled, DKIM created', $md['verified'] == 1 && $md['dkim_selector'] === 'zmail' && $md['dkim_value'] === 'v=DKIM1; k=rsa; p=ABC' && $md['dkim_id'] === '8800');
check('MX/SPF/DKIM status stored', $md['mx_ok'] == 1 && $md['spf_ok'] == 0 && $md['dkim_ok'] == 1);
$modes = array_column(array_column(array_values(array_filter(reqs($tmp), fn ($r) => str_contains($r['path'], '/domains/joesbakery.com'))), 'json'), 'mode');
check('Zoho calls in order', $modes === ['verifyDomainByTXT', 'enableMailHosting', 'addDkimDetail', 'verifyMxRecord', 'verifySpfRecord', 'verifyDkimKey']);
$md2 = mail_domain_refresh($md);
$after = array_column(array_column(array_values(array_filter(reqs($tmp), fn ($r) => str_contains($r['path'], '/domains/joesbakery.com'))), 'json'), 'mode');
check('a re-check does not re-verify or re-create DKIM', count($after) === count($modes) + 2 && !in_array('addDkimDetail', array_slice($after, count($modes)), true));

// Unverified domain stays unverified
db()->prepare('INSERT INTO mail_domains (user_id, domain, verify_code) VALUES (1, ?, ?)')->execute(['unverified.com', 'zb1']);
$u = mail_domain_refresh(user_mail_domains(1)[1]);
check('unverified domain stays unverified and gets no DKIM', $u['verified'] == 0 && $u['dkim_id'] === null);

// Mailboxes
$acct = zmail_create_account('info@joesbakery.com', 'Secret12345', 'Joe Q Baker');
$all = reqs($tmp);
$last = end($all);
check('mailbox created', $acct['zuid'] === '777');
check('mailbox request fields', $last['json']['primaryEmailAddress'] === 'info@joesbakery.com' && $last['json']['firstName'] === 'Joe Q' && $last['json']['lastName'] === 'Baker'
    && $last['json']['role'] === 'member' && $last['json']['oneTimePassword'] === false && $last['auth'] === 'Zoho-oauthtoken at');
try {
    zmail_create_account('taken@joesbakery.com', 'Secret12345', '');
    check('duplicate address reported', false);
} catch (ZohoError $e) {
    check('duplicate address reported with Zoho\'s reason', str_contains($e->getMessage(), 'already exists'));
}
db()->prepare('INSERT INTO mail_accounts (user_id, mail_domain_id, email, zuid) VALUES (1, ?, ?, ?)')->execute([$md['id'], 'info@joesbakery.com', '777']);
check('mailbox counted toward the plan', count_user_mailboxes(1) === 1 && max_mailboxes(['plan' => 'pro']) === 2);
zmail_reset_password('777', 'NewSecret123');
$all = reqs($tmp);
$last = end($all);
check('password reset request', $last['m'] === 'PUT' && $last['json']['mode'] === 'resetPassword' && $last['json']['password'] === 'NewSecret123' && $last['json']['oneTimePassword'] === false);
zmail_delete_account('info@joesbakery.com');
$all = reqs($tmp);
$last = end($all);
check('delete by email address', $last['m'] === 'DELETE' && $last['json']['emailList'] === ['info@joesbakery.com']);

// Account deletion removes everything in Zoho
$before = count(reqs($tmp));
mail_cleanup_user(1);
$calls = array_slice(reqs($tmp), $before);
check('account deletion removes mailboxes and domains', count(array_filter($calls, fn ($r) => $r['m'] === 'DELETE')) === 3);

proc_terminate($server);
exec('rm -rf ' . escapeshellarg($tmp));
echo $failed ? "\n$failed FAILED\n" : "\nAll passed\n";
exit($failed ? 1 : 0);
