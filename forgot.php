<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

if (current_user()) {
    redirect('account.php');
}

$sent = false;
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $email = strtolower(post_str('email', 200));

    if (!throttle('forgot:' . client_ip(), 5, 3600) || !throttle('forgot:' . $email, 3, 3600)) {
        $error = 'Too many reset requests. Please wait an hour and try again.';
    } else {
        $stmt = db()->prepare('SELECT id, name, email FROM users WHERE email = ? AND suspended = 0');
        $stmt->execute([$email]);
        if ($user = $stmt->fetch()) {
            send_email($user['email'], 'Reset your Rowan Copy password',
                "Hi {$user['name']},\n\nSomeone (hopefully you) asked to reset your Rowan Copy password. Open this link to choose a new one:\n\n"
                . password_reset_link((int) $user['id'])
                . "\n\nThe link works for 1 hour and can be used once. If you didn't ask for this, ignore this email; your password won't change.\n\n- Rowan Copy\n");
        }
        // Same answer whether or not the account exists, so nobody can probe for customers' emails.
        $sent = true;
    }
}

page_header('Reset your password', 'auth');
?>
<div class="card auth-card">
  <h1>Forgot your password?</h1>
  <?php if ($sent): ?>
    <p>If an account exists for that email, we've sent a link to reset your password. It works for 1 hour.</p>
    <p class="muted small">Don't see it? Check your spam folder.</p>
  <?php else: ?>
    <p class="muted">Enter your email and we'll send you a link to choose a new password.</p>
    <?php if ($error): ?><p class="error"><?= h($error) ?></p><?php endif; ?>
    <?php if (!mail_enabled()): ?><p class="error small">Email isn't set up on this server yet. Please contact support to reset your password.</p><?php endif; ?>
    <form method="post">
      <?= csrf_field() ?>
      <label>Email <input type="email" name="email" required autocomplete="email"></label>
      <button class="btn btn-block">Send reset link</button>
    </form>
  <?php endif; ?>
  <p class="muted small"><a href="<?= h(base_url('login.php')) ?>">← Back to log in</a></p>
</div>
<?php page_footer();
