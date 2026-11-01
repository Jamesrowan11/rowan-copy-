<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

if (current_user()) {
    redirect('dashboard.php');
}

$error = '';
$name = $email = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $name = post_str('name', 100);
    $email = strtolower(post_str('email', 200));
    $password = (string) ($_POST['password'] ?? '');

    if (!cfg('allow_signups', true)) {
        $error = 'Sign-ups are closed right now.';
    } elseif (!throttle('register:' . client_ip(), 5, 3600)) {
        $error = 'Too many sign-ups from your network. Please try again later.';
    } elseif ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'Please enter your name and a valid email address.';
    } elseif (empty($_POST['agree'])) {
        $error = 'Please agree to the Terms of Service and Privacy Policy.';
    } elseif (strlen($password) < 8) {
        $error = 'Your password needs at least 8 characters.';
    } else {
        $stmt = db()->prepare('SELECT 1 FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetchColumn()) {
            $error = 'An account with that email already exists. Try logging in.';
        } else {
            db()->prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
                ->execute([$email, $name, password_hash($password, PASSWORD_DEFAULT)]);
            $newId = (int) db()->lastInsertId();
            log_in($newId);
            if (verification_required()) {
                send_verification_email(['id' => $newId, 'name' => $name, 'email' => $email]);
                flash('Welcome to Rowan Copy! We sent a confirmation link to ' . $email . '. Let\'s build your first website.');
            } else {
                flash('Welcome to Rowan Copy! Let\'s build your first website.');
            }
            redirect('dashboard.php');
        }
    }
}

page_header('Create your account', 'auth');
?>
<div class="card auth-card">
  <h1>Create your account</h1>
  <p class="muted">Free to start. No credit card needed.</p>
  <?php if ($error): ?><p class="error"><?= h($error) ?></p><?php endif; ?>
  <form method="post">
    <?= csrf_field() ?>
    <label>Your name <input name="name" required maxlength="100" value="<?= h($name) ?>" autocomplete="name"></label>
    <label>Email <input type="email" name="email" required maxlength="200" value="<?= h($email) ?>" autocomplete="email"></label>
    <label>Password <input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
    <label class="check"><input type="checkbox" name="agree" value="1" required> <span>I agree to the <a href="<?= h(base_url('terms.php')) ?>" target="_blank">Terms of Service</a> and <a href="<?= h(base_url('privacy.php')) ?>" target="_blank">Privacy Policy</a></span></label>
    <button class="btn btn-block">Create account</button>
  </form>
  <p class="muted small">Already have an account? <a href="<?= h(base_url('login.php')) ?>">Log in</a></p>
</div>
<?php page_footer();
