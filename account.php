<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $action = post_str('action', 20);

    if ($action === 'profile') {
        $name = post_str('name', 100);
        if ($name === '') {
            $error = 'Name can\'t be empty.';
        } else {
            db()->prepare('UPDATE users SET name = ? WHERE id = ?')->execute([$name, $user['id']]);
            flash('Profile saved.');
            redirect('account.php');
        }
    } elseif ($action === 'password') {
        $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$user['id']]);
        $hash = (string) $stmt->fetchColumn();
        $new = (string) ($_POST['new_password'] ?? '');
        if (!password_verify((string) ($_POST['current_password'] ?? ''), $hash)) {
            $error = 'Your current password is incorrect.';
        } elseif (strlen($new) < 8) {
            $error = 'Your new password needs at least 8 characters.';
        } else {
            db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                ->execute([password_hash($new, PASSWORD_DEFAULT), $user['id']]);
            log_in((int) $user['id']);
            flash('Password changed.');
            redirect('account.php');
        }
    } elseif ($action === 'delete') {
        $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$user['id']]);
        if (!password_verify((string) ($_POST['confirm_password'] ?? ''), (string) $stmt->fetchColumn())) {
            $error = 'Enter your password to delete your account.';
        } else {
            $sites = db()->prepare('SELECT id FROM sites WHERE user_id = ?');
            $sites->execute([$user['id']]);
            foreach ($sites->fetchAll(PDO::FETCH_COLUMN) as $siteId) {
                array_map('unlink', glob(uploads_dir((int) $siteId) . '/*') ?: []);
                @rmdir(uploads_dir((int) $siteId));
            }
            db()->prepare('DELETE FROM users WHERE id = ?')->execute([$user['id']]);
            $_SESSION = [];
            session_destroy();
            redirect('');
        }
    }
}

$used = ai_uses_this_month((int) $user['id']);
page_header('Account');
?>
<div class="page narrow">
  <h1>Account</h1>
  <?php if ($error): ?><p class="error"><?= h($error) ?></p><?php endif; ?>

  <div class="card">
    <h2>Profile</h2>
    <form method="post">
      <?= csrf_field() ?><input type="hidden" name="action" value="profile">
      <label>Name <input name="name" required maxlength="100" value="<?= h($user['name']) ?>"></label>
      <label>Email <input value="<?= h($user['email']) ?>" disabled></label>
      <button class="btn">Save</button>
    </form>
  </div>

  <div class="card">
    <h2>AI usage</h2>
    <p>You've used <strong><?= $used ?></strong> of <strong><?= ai_limit() ?></strong> AI designs and edits this month. Your allowance resets on the 1st.</p>
  </div>

  <div class="card">
    <h2>Change password</h2>
    <form method="post">
      <?= csrf_field() ?><input type="hidden" name="action" value="password">
      <label>Current password <input type="password" name="current_password" required autocomplete="current-password"></label>
      <label>New password <input type="password" name="new_password" required minlength="8" autocomplete="new-password"></label>
      <button class="btn">Change password</button>
    </form>
  </div>

  <div class="card danger">
    <h2>Delete account</h2>
    <p class="muted">This permanently deletes your account, all of your websites, images and messages. Your sites go offline right away.</p>
    <form method="post" onsubmit="return confirm('Delete your account and all websites forever?')">
      <?= csrf_field() ?><input type="hidden" name="action" value="delete">
      <label>Password <input type="password" name="confirm_password" required autocomplete="current-password"></label>
      <button class="btn btn-danger">Delete my account</button>
    </form>
  </div>
</div>
<?php page_footer();
