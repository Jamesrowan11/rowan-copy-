<?php
// /r/CODE: a referral link. Remembers who sent the visitor for 30 days, then shows the sign-up page.
require __DIR__ . '/lib/bootstrap.php';

$code = strtoupper((string) ($_GET['c'] ?? ''));
if (referrals_enabled() && referrer_by_code($code)) {
    setcookie('rc_ref', $code, [
        'expires' => time() + 30 * 86400, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax',
        'secure' => str_starts_with((string) cfg('base_url'), 'https://'),
    ]);
    redirect('register.php?ref=' . rawurlencode($code));
}
redirect('register.php');
