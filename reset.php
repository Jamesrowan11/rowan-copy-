<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$tokenStr = (string) ($_POST['token'] ?? $_GET['token'] ?? '');
$token = find_token($tokenStr, 'reset');
$error = '';

if ($token && $_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $password = (string) ($_POST['password'] ?? '');
    if (strlen($password) < 8) {
        $error = 'Your new password needs at least 8 characters.';
    } elseif ($password !== (string) ($_POST['password2'] ?? '')) {
        $error = 'The two passwords don\'t match.';
    } else {
        $userId = (int) $token['user_id'];
        use_token((int) $token['id']);
        // Opening the reset link proves they own the email, so mark it verified too.
        db()->prepare('UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = ?')
            ->execute([password_hash($password, PASSWORD_DEFAULT), $userId]);
        bump_session_version($userId); // logs out any other devices
        log_in($userId);
        flash('Your password has been changed.');
        redirect('dashboard.php');
    }
}

page_header('Choose a new password', 'auth');
?>
<div class="card auth-card">
  <?php if (!$token): ?>
    <h1>Link expired</h1>
    <p>This password reset link is invalid, already used, or more than an hour old.</p>
    <a class="btn btn-block" href="<?= h(base_url('forgot.php')) ?>">Send a new link</a>
  <?php else: ?>
    <h1>Choose a new password</h1>
    <?php if ($error): ?><p class="error"><?= h($error) ?></p><?php endif; ?>
    <form method="post">
      <?= csrf_field() ?>
      <input type="hidden" name="token" value="<?= h($tokenStr) ?>">
      <label>New password <input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
      <label>Type it again <input type="password" name="password2" required minlength="8" autocomplete="new-password"></label>
      <button class="btn btn-block">Save new password</button>
    </form>
  <?php endif; ?>
</div>
<?php page_footer();
