<?php
// ============================================================================
// ROWAN COPY: OUTGOING EMAIL
// Every email the app sends (sign-up, password reset, contact-form alerts,
// quotes, billing, domains, team invites) goes through send_email() here.
//   - ZeptoMail (Zoho's transactional email API) when ZEPTOMAIL_TOKEN is set.
//   - Otherwise PHP mail(), i.e. the Plesk server's own mail system (today).
// The token is a secret: set it as an environment variable (on the DigitalOcean
// builder: /etc/rowancopy/secrets.env), never in code or config.php in Git.
// ============================================================================

declare(strict_types=1);

function mail_from(): string
{
    return (string) (getenv('MAIL_FROM') ?: cfg('mail_from') ?: cfg('notify_email_from', ''));
}

function mail_enabled(): bool
{
    return filter_var(mail_from(), FILTER_VALIDATE_EMAIL) !== false;
}

/** Which way email goes out: 'zeptomail' or 'php_mail'. */
function mail_transport(): string
{
    return (string) getenv('ZEPTOMAIL_TOKEN') !== '' ? 'zeptomail' : 'php_mail';
}

/**
 * Send a plain-text email. Returns false (and logs why) if it couldn't be sent;
 * callers carry on either way, so a mail outage never breaks a page.
 * $replyTo: where replies go (e.g. the visitor who filled in a contact form).
 */
function send_email(string $to, string $subject, string $body, ?string $replyTo = null): bool
{
    if (!mail_enabled() || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    $subject = trim(preg_replace('/[\r\n]+/', ' ', $subject) ?? '');
    if ($replyTo !== null && !filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        $replyTo = null;
    }
    $ok = mail_transport() === 'zeptomail'
        ? zeptomail_send($to, $subject, $body, $replyTo)
        : php_mail_send($to, $subject, $body, $replyTo);
    if (!$ok) {
        error_log('Rowan Copy: could not send email to ' . $to . ' via ' . mail_transport());
    }
    return $ok;
}

function zeptomail_send(string $to, string $subject, string $body, ?string $replyTo): bool
{
    // US accounts use api.zeptomail.com; EU accounts api.zeptomail.eu, and so on.
    $host = (string) (getenv('ZEPTOMAIL_API_HOST') ?: 'api.zeptomail.com');
    if (!preg_match('/^api\.zeptomail\.[a-z.]+$/', $host)) {
        error_log('Rowan Copy: ZEPTOMAIL_API_HOST must look like api.zeptomail.com');
        return false;
    }
    $payload = [
        'from' => ['address' => mail_from(), 'name' => (string) (getenv('MAIL_FROM_NAME') ?: 'Rowan Copy')],
        'to' => [['email_address' => ['address' => $to]]],
        'subject' => $subject,
        'textbody' => $body,
    ];
    if ($replyTo) {
        $payload['reply_to'] = [['address' => $replyTo]];
    }
    // RC_ZEPTOMAIL_TEST_URL lets tests/mailer_test.php point this at a fake server. Never set it in production.
    $ch = curl_init((string) (getenv('RC_ZEPTOMAIL_TEST_URL') ?: "https://$host/v1.1/email"));
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Content-Type: application/json',
            'Authorization: Zoho-enczapikey ' . getenv('ZEPTOMAIL_TOKEN'),
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
    ]);
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false || $status < 200 || $status >= 300) {
        // ZeptoMail's error body names the problem (bad token, unverified domain, no credits...). Never log the token.
        error_log("Rowan Copy ZeptoMail HTTP $status $err " . substr((string) $raw, 0, 500));
        return false;
    }
    return true;
}

function php_mail_send(string $to, string $subject, string $body, ?string $replyTo): bool
{
    $from = mail_from();
    $headers = [
        'From: Rowan Copy <' . $from . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ];
    if ($replyTo) {
        $headers[] = 'Reply-To: ' . $replyTo;
    }
    return @mail($to, mb_encode_mimeheader($subject, 'UTF-8'), $body, implode("\r\n", $headers), '-f' . $from);
}
