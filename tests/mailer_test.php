<?php
// Tests the ZeptoMail mailer against a fake ZeptoMail server on localhost.
// Run: php tests/mailer_test.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$tmp = sys_get_temp_dir() . '/rc-mailer-test-' . bin2hex(random_bytes(4));
mkdir($tmp, 0700, true);
file_put_contents("$tmp/config.php", '<?php return ' . var_export(['base_url' => 'https://rowancopy.test', 'data_dir' => "$tmp/data", 'mail_from' => 'noreply@rowancopy.test'], true) . ';');
// Fake ZeptoMail: records each request; answers like the real API (201), or 401 for a bad token.
file_put_contents("$tmp/fake.php", '<?php
$h = getallheaders();
file_put_contents(__DIR__ . "/requests.jsonl", json_encode(["auth" => $h["Authorization"] ?? "", "path" => $_SERVER["REQUEST_URI"], "body" => json_decode(file_get_contents("php://input"), true)]) . "\n", FILE_APPEND);
if (($h["Authorization"] ?? "") !== "Zoho-enczapikey good-token") { http_response_code(401); echo "{\"error\":{\"code\":\"TM_3501\",\"message\":\"Invalid API Token found\"}}"; return; }
http_response_code(201); echo "{\"data\":[{\"code\":\"EM_104\",\"message\":\"Email request received\"}],\"message\":\"OK\"}";');
$port = random_int(20000, 40000);
$server = proc_open(['php', '-S', "127.0.0.1:$port", "$tmp/fake.php"], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
usleep(500000);

putenv("RC_CONFIG=$tmp/config.php");
require __DIR__ . '/../lib/bootstrap.php';

$failed = 0;
function check(string $name, bool $ok): void
{
    global $failed;
    echo ($ok ? 'ok   ' : 'FAIL ') . $name . "\n";
    $failed += $ok ? 0 : 1;
}
function requests(string $tmp): array
{
    return array_map(fn ($l) => json_decode($l, true), array_filter(explode("\n", (string) @file_get_contents("$tmp/requests.jsonl"))));
}

check('without a token, PHP mail() is used (today\'s Plesk setup)', mail_transport() === 'php_mail');

putenv('ZEPTOMAIL_TOKEN=good-token');
putenv("RC_ZEPTOMAIL_TEST_URL=http://127.0.0.1:$port/v1.1/email");
check('with ZEPTOMAIL_TOKEN set, ZeptoMail is used', mail_transport() === 'zeptomail');
check('send succeeds', send_email('joe@example.com', "Reset your\r\npassword", "Hi Joe,\nClick here.", 'visitor@example.org'));
$r = requests($tmp)[0] ?? [];
check('token sent in Zoho-enczapikey header', ($r['auth'] ?? '') === 'Zoho-enczapikey good-token');
check('from address', ($r['body']['from']['address'] ?? '') === 'noreply@rowancopy.test' && ($r['body']['from']['name'] ?? '') === 'Rowan Copy');
check('recipient', ($r['body']['to'][0]['email_address']['address'] ?? '') === 'joe@example.com');
check('subject has no line breaks', ($r['body']['subject'] ?? '') === 'Reset your password');
check('plain-text body kept', ($r['body']['textbody'] ?? '') === "Hi Joe,\nClick here.");
check('reply-to', ($r['body']['reply_to'][0]['address'] ?? '') === 'visitor@example.org');

check('invalid reply-to dropped', send_email('joe@example.com', 'x', 'y', 'not-an-email') && !isset(requests($tmp)[1]['body']['reply_to']));
check('invalid recipient not sent', !send_email('nope', 'x', 'y') && count(requests($tmp)) === 2);

putenv('ZEPTOMAIL_TOKEN=bad-token');
check('rejected token returns false (page carries on)', !send_email('joe@example.com', 'x', 'y'));

putenv('ZEPTOMAIL_API_HOST=evil.example.com');
putenv('RC_ZEPTOMAIL_TEST_URL');
check('a non-ZeptoMail API host is refused', !send_email('joe@example.com', 'x', 'y'));

// Token saved on Admin -> Email (secrets.json) instead of an environment variable
putenv('ZEPTOMAIL_TOKEN');
putenv('ZEPTOMAIL_API_HOST');
putenv("RC_ZEPTOMAIL_TEST_URL=http://127.0.0.1:$port/v1.1/email");
save_secrets(['ZEPTOMAIL_TOKEN' => 'good-token', 'MAIL_FROM' => 'hello@rowancopy.test']);
check('secrets file is private', (fileperms(secrets_file_path()) & 0777) === 0600);
check('token from secrets file is used', mail_transport() === 'zeptomail' && send_email('joe@example.com', 'x', 'y'));
check('sender from secrets file', (end(requests($tmp))['body']['from']['address'] ?? '') === 'hello@rowancopy.test');
save_secrets(['ZEPTOMAIL_TOKEN' => '']);
$GLOBALS['RC_CONFIG']['php_mail'] = false;
check('no token and server mail turned off: email is off', mail_transport() === 'php_mail' && !mail_enabled() && !verification_required());

proc_terminate($server);
exec('rm -rf ' . escapeshellarg($tmp));
echo $failed ? "\n$failed FAILED\n" : "\nAll passed\n";
exit($failed ? 1 : 0);
