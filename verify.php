<?php
// Email confirmation: GET ?token=... confirms; POST action=resend sends a fresh link.
require __DIR__ . '/lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $user = require_login();
    if (empty($user['email_verified_at'])) {
        if (!throttle('verify:' . $user['id'], 3, 3600)) {
            flash('We already sent a few links. Please check your inbox and spam folder.', 'err');
        } elseif (send_verification_email($user)) {
            flash('We sent a new confirmation link to ' . $user['email'] . '.');
        } else {
            flash('We couldn\'t send the email right now. Please try again later.', 'err');
        }
    }
    redirect('dashboard.php');
}

$token = find_token((string) ($_GET['token'] ?? ''), 'verify');
if (!$token) {
    flash('That confirmation link is invalid or expired. Log in and click "Resend" to get a new one.', 'err');
    redirect(current_user() ? 'dashboard.php' : 'login.php');
}
use_token((int) $token['id']);
db()->prepare('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$token['user_id']]);
flash('Thanks! Your email is confirmed.');
redirect(current_user() ? 'dashboard.php' : 'login.php');
