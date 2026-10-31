<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

if (current_user()) {
    redirect('dashboard.php');
}

$error = '';
$email = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $email = strtolower(post_str('email', 200));
    $password = (string) ($_POST['password'] ?? '');

    if (!throttle('login:' . client_ip(), 10, 900) || !throttle('login:' . $email, 10, 900)) {
        $error = 'Too many login attempts. Please wait 15 minutes and try again.';
    } else {
        $stmt = db()->prepare('SELECT id, password_hash FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        if ($row && password_verify($password, $row['password_hash'])) {
            if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
                db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                    ->execute([password_hash($password, PASSWORD_DEFAULT), $row['id']]);
            }
            log_in((int) $row['id']);
            redirect('dashboard.php');
        }
        $error = 'That email and password don\'t match.';
    }
}

page_header('Log in', 'auth');
?>
<div class="card auth-card">
  <h1>Welcome back</h1>
  <?php if ($error): ?><p class="error"><?= h($error) ?></p><?php endif; ?>
  <form method="post">
    <?= csrf_field() ?>
    <label>Email <input type="email" name="email" required value="<?= h($email) ?>" autocomplete="email"></label>
    <label>Password <input type="password" name="password" required autocomplete="current-password"></label>
    <button class="btn btn-block">Log in</button>
  </form>
  <p class="muted small">New here? <a href="<?= h(base_url('register.php')) ?>">Create an account</a></p>
</div>
<?php page_footer();
