<?php
// Tests the Zoho CRM connection against a fake Zoho server on localhost.
// Run: php tests/zoho_test.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$tmp = sys_get_temp_dir() . '/rc-zoho-test-' . bin2hex(random_bytes(4));
mkdir($tmp, 0700, true);
file_put_contents("$tmp/config.php", '<?php return ' . var_export(['base_url' => 'https://rowancopy.test', 'data_dir' => "$tmp/data", 'plans' => []], true) . ';');
// Fake Zoho: accounts (token) and CRM (upsert) endpoints; logs every request.
file_put_contents("$tmp/fake.php", <<<'PHP'
<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$log = ['path' => $path, 'auth' => getallheaders()['Authorization'] ?? '', 'form' => $_POST, 'json' => json_decode(file_get_contents('php://input'), true)];
file_put_contents(__DIR__ . '/requests.jsonl', json_encode($log) . "\n", FILE_APPEND);
header('Content-Type: application/json');
if ($path === '/oauth/v2/token') {
    if (($_POST['grant_type'] ?? '') === 'authorization_code') {
        if (($_POST['code'] ?? '') !== 'good-code') { echo '{"error":"invalid_code"}'; return; }
        echo '{"access_token":"at-1","refresh_token":"rt-1","api_domain":"https://www.zohoapis.com","expires_in":3600}'; return;
    }
    echo '{"access_token":"at-2","expires_in":3600}'; return;
}
if ($path === '/crm/v7/Leads/upsert') {
    $email = $log['json']['data'][0]['Email'] ?? '';
    if (str_contains($email, 'fail')) { http_response_code(400); echo '{"data":[{"code":"INVALID_DATA","message":"bad","status":"error"}]}'; return; }
    http_response_code(201); echo '{"data":[{"code":"SUCCESS","details":{"id":"555"},"status":"success"}]}'; return;
}
http_response_code(404);
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
    return array_map(fn ($l) => json_decode($l, true), array_values(array_filter(explode("\n", (string) @file_get_contents("$tmp/requests.jsonl")))));
}

// Name handling
$r = crm_lead_record('Joe Q. Baker', 'Joe@Example.com', 'Hi', 'Joe\'s Bakery', '410-555-1234');
check('first/last name split', $r['First_Name'] === 'Joe Q.' && $r['Last_Name'] === 'Baker');
check('email lowercased, company and phone kept', $r['Email'] === 'joe@example.com' && $r['Company'] === 'Joe\'s Bakery' && $r['Phone'] === '410-555-1234');
$r = crm_lead_record('Cher', 'cher@example.com', 'Hi');
check('single name goes to Last_Name (required by Zoho)', $r['Last_Name'] === 'Cher' && !isset($r['First_Name']));
check('company falls back to the name (required by Zoho)', $r['Company'] === 'Cher');
$r = crm_lead_record('', 'nobody@example.com', 'Hi');
check('no name: Last_Name from the email', $r['Last_Name'] === 'nobody' && $r['Company'] === 'nobody@example.com');

// Not connected: nothing queued
crm_queue_lead(crm_lead_record('A B', 'a@example.com', 'x'));
check('nothing queued before connecting', (int) db()->query('SELECT COUNT(*) FROM crm_outbox')->fetchColumn() === 0);

// Connect
try {
    zoho_connect('accounts.zoho.com', '1000.ABCDEFGHIJ', 'secretsecret', 'bad-code');
    check('expired grant code rejected', false);
} catch (ZohoError $e) {
    check('expired grant code rejected with a clear message', str_contains($e->getMessage(), 'expired'));
}
zoho_connect('accounts.zoho.com', '1000.ABCDEFGHIJ', 'secretsecret', 'good-code');
check('connected', zoho_crm_enabled() && app_secret('ZOHO_REFRESH_TOKEN') === 'rt-1');
check('secrets file private', (fileperms(secrets_file_path()) & 0777) === 0600);

// Send a lead
crm_queue_lead(crm_lead_record('Joe Baker', 'joe@example.com', 'Signed up', '', ''));
[$sent, $failedCount] = crm_flush();
$up = array_values(array_filter(reqs($tmp), fn ($r) => $r['path'] === '/crm/v7/Leads/upsert'));
check('lead sent', $sent === 1 && $failedCount === 0);
check('uses cached access token', ($up[0]['auth'] ?? '') === 'Zoho-oauthtoken at-1');
check('upsert matches duplicates by email', ($up[0]['json']['duplicate_check_fields'] ?? []) === ['Email']);
check('lead fields', ($up[0]['json']['data'][0]['Last_Name'] ?? '') === 'Baker' && ($up[0]['json']['data'][0]['Email'] ?? '') === 'joe@example.com');
check('Zoho record id stored', db()->query("SELECT zoho_id FROM crm_outbox WHERE sent_at IS NOT NULL")->fetchColumn() === '555');

// Expired access token is renewed
file_put_contents(zoho_token_cache_path(), json_encode(['token' => 'old', 'expires' => time() - 10]));
crm_queue_lead(crm_lead_record('Ann Lee', 'ann@example.com', 'Quote'));
crm_flush();
$up = array_values(array_filter(reqs($tmp), fn ($r) => $r['path'] === '/crm/v7/Leads/upsert'));
check('expired token renewed with the refresh token', end($up)['auth'] === 'Zoho-oauthtoken at-2');

// Failure is kept and retried
crm_queue_lead(crm_lead_record('Bad Data', 'fail@example.com', 'x'));
[$s, $f] = crm_flush();
$row = db()->query("SELECT * FROM crm_outbox WHERE payload LIKE '%fail@%'")->fetch();
check('rejected lead stays waiting with the reason', $f === 1 && $row['sent_at'] === null && (int) $row['attempts'] === 1 && str_contains((string) $row['last_error'], 'INVALID_DATA'));
$c = crm_outbox_counts();
check('counts', (int) $c['sent'] === 2 && (int) $c['waiting'] === 1);

// Optional Lead Source
save_secrets(['ZOHO_LEAD_SOURCE' => 'Web Research']);
check('lead source added when set', (crm_lead_record('X Y', 'x@y.com', 'z')['Lead_Source'] ?? '') === 'Web Research');

zoho_disconnect();
check('disconnect removes the credentials', !zoho_crm_enabled() && !is_file(zoho_token_cache_path()));

// Help link
save_secrets(['SUPPORT_URL' => 'javascript:alert(1)']);
check('unsafe help link ignored', support_url() === '');
save_secrets(['SUPPORT_URL' => 'https://rowancopy.zohodesk.com/portal']);
check('help link', support_url() === 'https://rowancopy.zohodesk.com/portal');

proc_terminate($server);
exec('rm -rf ' . escapeshellarg($tmp));
echo $failed ? "\n$failed FAILED\n" : "\nAll passed\n";
exit($failed ? 1 : 0);
