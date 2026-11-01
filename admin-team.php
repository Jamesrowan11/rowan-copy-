<?php
// Admin-only: add, change and remove Rowan Copy staff (admins and employees).
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_admin();
$inviteLink = null;

/** The Plesk site id of the main Rowan Copy domain, for staff email accounts. */
function main_mail_domain(): array
{
    $host = strtolower((string) (cfg('mail_domain') ?: parse_url((string) cfg('base_url'), PHP_URL_HOST)));
    $host = preg_replace('/^(www|app|portal)\./', '', $host) ?? $host;
    return [$host, plesk_enabled() ? plesk_find_domain($host) : null];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $pdo = db();
    try {
        switch ($_POST['action'] ?? '') {
            case 'add':
                $email = strtolower(post_str('email', 200));
                $name = post_str('name', 100);
                $role = ($_POST['role'] ?? '') === 'admin' ? 'admin' : 'employee';
                if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $name === '') {
                    throw new RuntimeException('Enter a name and a valid email address.');
                }

                // Optional: create their email account on the main domain first,
                // so a Plesk error doesn't leave a half-made team member.
                $mailLocal = strtolower(post_str('mailbox', 64));
                $mailNote = '';
                if ($mailLocal !== '') {
                    [$mainDomain, $mainSite] = main_mail_domain();
                    if (!$mainSite) {
                        throw new RuntimeException("Can't create the email account: $mainDomain isn't connected through Plesk.");
                    }
                    $pw = (string) ($_POST['mail_password'] ?? '');
                    if (strlen($pw) < 10) {
                        throw new RuntimeException('Give the new email account a password of at least 10 characters.');
                    }
                    plesk_create_mailbox($mainSite, $mailLocal, $pw);
                    $mailNote = " Created the email account {$mailLocal}@{$mainDomain}.";
                }

                $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
                $stmt->execute([$email]);
                $existingId = (int) $stmt->fetchColumn();
                if ($existingId) {
                    $pdo->prepare('UPDATE users SET role = ?, name = CASE WHEN name = email THEN ? ELSE name END WHERE id = ?')
                        ->execute([$role, $name, $existingId]);
                    send_email($email, 'You\'ve been added to the Rowan Copy team',
                        "Hi $name,\n\nYou now have " . ($role === 'admin' ? 'admin' : 'staff') . " access in the Rowan Copy portal. Log in as usual:\n\n"
                        . base_url('login.php') . "\n\n- Rowan Copy\n");
                    flash("$email is now " . ($role === 'admin' ? 'an admin' : 'an employee') . '.' . $mailNote);
                } else {
                    $pdo->prepare('INSERT INTO users (email, name, password_hash, role, email_verified_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)')
                        ->execute([$email, $name, password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT), $role]);
                    $newId = (int) $pdo->lastInsertId();
                    $link = base_url('reset.php?token=' . create_token($newId, 'reset', 7 * 86400));
                    $sent = send_email($email, 'Your Rowan Copy team account',
                        "Hi $name,\n\nYou've been added to the Rowan Copy team as " . ($role === 'admin' ? 'an admin' : 'an employee') . ".\n\n"
                        . "Set your password here (the link works for 7 days):\n\n$link\n\nAfter that, log in at " . base_url('login.php') . "\n\n- Rowan Copy\n");
                    if ($sent) {
                        flash("Added $name and emailed them an invitation." . $mailNote);
                    } else {
                        $inviteLink = $link;
                        flash("Added $name. Email is off, so send them the invite link below yourself." . $mailNote);
                    }
                }
                break;

            case 'role':
                $uid = (int) ($_POST['user_id'] ?? 0);
                $role = (string) ($_POST['role'] ?? '');
                if (!in_array($role, ['admin', 'employee', 'customer'], true)) {
                    throw new RuntimeException('Unknown role.');
                }
                if ($uid === (int) $user['id']) {
                    throw new RuntimeException('You can\'t change your own role.');
                }
                $pdo->prepare('UPDATE users SET role = ? WHERE id = ?')->execute([$role, $uid]);
                bump_session_version($uid); // they must log in again with their new access
                flash($role === 'customer' ? 'Removed from the team. They keep a normal customer account.' : 'Role updated.');
                break;
        }
    } catch (RuntimeException $e) {
        flash($e->getMessage(), 'err');
    }
    if (!$inviteLink) {
        redirect('admin-team.php');
    }
}

$team = db()->query("SELECT id, name, email, role, created_at FROM users ORDER BY name")->fetchAll();
$team = array_values(array_filter($team, fn ($u) => user_role($u) !== 'customer'));
[$mainDomain, $mainSite] = plesk_enabled() ? main_mail_domain() : ['', null];

page_header('Team');
?>
<div class="page">
  <a class="back" href="<?= h(base_url('admin.php')) ?>">← Admin</a>
  <h1>Team</h1>
  <p class="muted"><strong>Admins</strong> can do everything, including plans, suspensions, takedowns and this page.
    <strong>Employees</strong> can see customers and quote requests, send password reset links, and manage email accounts and DNS on the Hosting page.</p>

  <?php if ($inviteLink): ?>
    <div class="card"><h2>Invite link</h2><p class="muted small">Send this to your new team member. It works for 7 days.</p><div class="reset-link"><?= h($inviteLink) ?></div></div>
  <?php endif; ?>

  <div class="table-wrap"><table>
    <tr><th>Name</th><th>Email</th><th>Role</th></tr>
    <?php foreach ($team as $t): ?>
      <tr>
        <td><?= h($t['name']) ?></td>
        <td><?= h($t['email']) ?></td>
        <td>
          <?php if (is_owner_email($t['email'])): ?>
            Admin <span class="muted small">(owner, set in config.php)</span>
          <?php elseif ((int) $t['id'] === (int) $user['id']): ?>
            <?= h(ucfirst(user_role($t))) ?> <span class="muted small">(you)</span>
          <?php else: ?>
            <form method="post" class="inline-form"><?= csrf_field() ?>
              <input type="hidden" name="action" value="role"><input type="hidden" name="user_id" value="<?= (int) $t['id'] ?>">
              <select name="role" onchange="if (this.value !== 'customer' || confirm('Remove <?= h($t['name']) ?> from the team?')) this.form.submit(); else this.value = '<?= h($t['role']) ?>';">
                <option value="admin" <?= $t['role'] === 'admin' ? 'selected' : '' ?>>Admin</option>
                <option value="employee" <?= $t['role'] === 'employee' ? 'selected' : '' ?>>Employee</option>
                <option value="customer">Remove from team</option>
              </select>
            </form>
          <?php endif; ?>
        </td>
      </tr>
    <?php endforeach; ?>
  </table></div>

  <div class="card">
    <h2>Add a team member</h2>
    <p class="muted small">If they don't have an account yet, they're emailed a link to set their password. If they already have one (for example as a customer), it's upgraded.</p>
    <form method="post" class="team-add">
      <?= csrf_field() ?><input type="hidden" name="action" value="add">
      <label>Name <input name="name" required maxlength="100"></label>
      <label>Login email <input type="email" name="email" required maxlength="200" placeholder="jane@rowancopy.com"></label>
      <label>Role
        <select name="role"><option value="employee">Employee</option><option value="admin">Admin</option></select>
      </label>
      <?php if ($mainSite): ?>
        <fieldset class="team-mail">
          <legend>Also create a <?= h($mainDomain) ?> email account (optional)</legend>
          <label>Address <span class="addr"><input name="mailbox" maxlength="64" pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]*" placeholder="jane"><span>@<?= h($mainDomain) ?></span></span></label>
          <label>Email password <input type="password" name="mail_password" minlength="10" autocomplete="new-password"></label>
          <p class="muted small">Leave the address empty to skip. Their email works in webmail at webmail.<?= h($mainDomain) ?> and in any email app.</p>
        </fieldset>
      <?php endif; ?>
      <button class="btn">Add to team</button>
    </form>
  </div>
</div>
<?php page_footer();
