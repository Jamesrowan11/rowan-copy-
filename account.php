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
            bump_session_version((int) $user['id']); // sign out other devices
            log_in((int) $user['id']);
            flash('Password changed. Any other devices have been logged out.');
            redirect('account.php');
        }
    } elseif ($action === 'email') {
        $newEmail = strtolower(post_str('email', 200));
        $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$user['id']]);
        $taken = db()->prepare('SELECT 1 FROM users WHERE email = ? AND id != ?');
        $taken->execute([$newEmail, $user['id']]);
        if (!filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
            $error = 'Please enter a valid email address.';
        } elseif (!password_verify((string) ($_POST['email_password'] ?? ''), (string) $stmt->fetchColumn())) {
            $error = 'Your password is incorrect.';
        } elseif ($taken->fetchColumn()) {
            $error = 'Another account already uses that email.';
        } elseif ($newEmail !== strtolower($user['email'])) {
            db()->prepare('UPDATE users SET email = ?, email_verified_at = NULL WHERE id = ?')->execute([$newEmail, $user['id']]);
            if (verification_required()) {
                send_verification_email(['id' => $user['id'], 'name' => $user['name'], 'email' => $newEmail]);
                flash('Email updated. We sent a confirmation link to ' . $newEmail . '.');
            } else {
                flash('Email updated.');
            }
            redirect('account.php');
        }
    } elseif ($action === 'delete') {
        $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$user['id']]);
        if (!password_verify((string) ($_POST['confirm_password'] ?? ''), (string) $stmt->fetchColumn())) {
            $error = 'Enter your password to delete your account.';
        } else {
            $sites = db()->prepare('SELECT id, custom_domain FROM sites WHERE user_id = ?');
            $sites->execute([$user['id']]);
            foreach ($sites->fetchAll() as $s) {
                $siteId = (int) $s['id'];
                remove_site_hosting($s);
                array_map('unlink', glob(uploads_dir((int) $siteId) . '/*') ?: []);
                @rmdir(uploads_dir((int) $siteId));
            }
            try { // stop billing their website Portals
                $portals = db()->prepare("SELECT portal_subscription_id FROM sites WHERE user_id = ? AND portal_status IN ('active', 'trialing', 'past_due')");
                $portals->execute([$user['id']]);
                foreach ($portals->fetchAll(PDO::FETCH_COLUMN) as $subId) {
                    stripe()->subscriptions->cancel((string) $subId, ['prorate' => true, 'invoice_now' => true]);
                }
            } catch (Throwable $e) {
                error_log('Rowan Copy: cancel portals on account delete: ' . $e->getMessage());
            }
            try { // stop billing their email accounts
                if ($mailSub = mail_subscription($user)) {
                    stripe()->subscriptions->cancel($mailSub->id, ['prorate' => true, 'invoice_now' => true]);
                }
            } catch (Throwable $e) {
                error_log('Rowan Copy: cancel email billing on account delete: ' . $e->getMessage());
            }
            mail_cleanup_user((int) $user['id']); // their Zoho mailboxes and domains
            db()->prepare('DELETE FROM users WHERE id = ?')->execute([$user['id']]);
            $_SESSION = [];
            session_destroy();
            redirect('');
        }
    }
}

$used = ai_uses_this_month((int) $user['id']);
$limit = max(1, ai_limit($user));
$siteCount = (int) db()->query('SELECT COUNT(*) FROM sites WHERE user_id = ' . (int) $user['id'])->fetchColumn();
page_header('Settings');
?>
<div class="pg pg-narrow">
  <div class="pg-head"><div><h1>Settings</h1><p class="muted">Your profile, sign-in and account.</p></div></div>
  <?php if ($error): ?><p class="error" role="alert"><?= h($error) ?></p><?php endif; ?>

  <section class="box">
    <h2>Profile</h2>
    <form method="post" class="grid-2">
      <?= csrf_field() ?><input type="hidden" name="action" value="profile">
      <label>Full name <input name="name" required maxlength="100" value="<?= h($user['name']) ?>" autocomplete="name"></label>
      <div class="grid-2-end"><button class="btn">Save profile</button></div>
    </form>
  </section>

  <section class="box">
    <h2>Email address</h2>
    <p class="muted small">You sign in with <strong><?= h($user['email']) ?></strong><?= is_verified($user) ? '' : ' <span class="tag tag-accent">Not confirmed yet</span>' ?></p>
    <form method="post" class="grid-2">
      <?= csrf_field() ?><input type="hidden" name="action" value="email">
      <label>New email <input type="email" name="email" required maxlength="200" autocomplete="email"></label>
      <label>Your password <input type="password" name="email_password" required autocomplete="current-password"></label>
      <div><button class="btn">Change email</button></div>
    </form>
  </section>

  <section class="box">
    <h2>Password</h2>
    <form method="post" class="grid-2">
      <?= csrf_field() ?><input type="hidden" name="action" value="password">
      <label>Current password <input type="password" name="current_password" required autocomplete="current-password"></label>
      <label>New password <input type="password" name="new_password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label>
      <div><button class="btn">Update password</button></div>
    </form>
    <p class="muted small">Changing your password signs you out on your other devices.</p>
  </section>

  <section class="box">
    <h2>AI usage this month</h2>
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="<?= $limit ?>" aria-valuenow="<?= min($used, $limit) ?>" aria-label="AI designs and edits used"><span style="width: <?= min(100, round($used / $limit * 100)) ?>%"></span></div>
    <p class="small"><strong><?= $used ?></strong> of <strong><?= ai_limit($user) ?></strong> AI designs and edits used. Your allowance resets on the 1st. <a class="link-accent" href="<?= h(base_url('billing.php')) ?>">Need more?</a></p>
  </section>

  <section class="box box-danger">
    <h2>Delete account</h2>
    <p class="muted">This permanently deletes your account<?= $siteCount ? ', your ' . $siteCount . ' website' . ($siteCount > 1 ? 's' : '') : '' ?>, images and messages. Your sites go offline right away and can't be recovered.</p>
    <button type="button" class="btn btn-danger" data-dialog-open="delete-dialog">Delete my account</button>
  </section>

  <dialog class="dlg" id="delete-dialog" aria-labelledby="delete-title">
    <form method="post" data-type-confirm="DELETE">
      <?= csrf_field() ?><input type="hidden" name="action" value="delete">
      <h2 id="delete-title">Delete your account?</h2>
      <p class="muted"><?= $siteCount ? 'Your ' . $siteCount . ' website' . ($siteCount > 1 ? 's' : '') . ' will go offline and ' : 'Everything ' ?>can't be recovered. Type <strong>DELETE</strong> and enter your password to confirm.</p>
      <label>Type DELETE <input name="confirm_word" autocomplete="off" placeholder="DELETE" data-type-input></label>
      <label>Password <input type="password" name="confirm_password" required autocomplete="current-password"></label>
      <div class="dlg-foot">
        <button type="button" class="btn btn-ghost" data-dialog-close>Keep my account</button>
        <button class="btn btn-danger" data-type-submit disabled>Delete forever</button>
      </div>
    </form>
  </dialog>
</div>
<?php page_footer();
