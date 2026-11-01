<?php
// Owner-only: connect domains hosted in Plesk to customer accounts.
// Linking an existing customer's domain lets them manage its email and DNS in the portal.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_staff();
$isAdmin = is_admin($user);

$inviteLink = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    if (!$isAdmin) {
        http_response_code(403);
        exit('Only admins can link or unlink customers.');
    }
    $pdo = db();
    try {
        switch ($_POST['action'] ?? '') {
            case 'link':
                $domainName = strtolower(post_str('domain', 253));
                $email = strtolower(post_str('email', 200));
                $customerName = post_str('name', 100);
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    throw new RuntimeException('Enter the customer\'s email address.');
                }
                $siteId = plesk_find_domain($domainName);
                if (!$siteId) {
                    throw new RuntimeException("$domainName isn't hosted in Plesk on this server.");
                }
                $stmt = $pdo->prepare('SELECT id, name, email FROM users WHERE email = ?');
                $stmt->execute([$email]);
                $customer = $stmt->fetch();
                $isNew = false;
                if (!$customer) {
                    // New portal account for an existing hosting customer. They choose
                    // their own password through the invite link.
                    $pdo->prepare('INSERT INTO users (email, name, password_hash, email_verified_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
                        ->execute([$email, $customerName ?: $email, password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT)]);
                    $customer = ['id' => (int) $pdo->lastInsertId(), 'name' => $customerName ?: $email, 'email' => $email];
                    $isNew = true;
                }
                $pdo->prepare('INSERT INTO hosting_domains (user_id, domain, plesk_site_id) VALUES (?, ?, ?)
                               ON CONFLICT(domain) DO UPDATE SET user_id = excluded.user_id, plesk_site_id = excluded.plesk_site_id')
                    ->execute([$customer['id'], $domainName, $siteId]);

                if ($isNew) {
                    $link = base_url('reset.php?token=' . create_token((int) $customer['id'], 'reset', 7 * 86400));
                    $sent = send_email($email, 'Your Rowan Copy customer portal is ready',
                        "Hi {$customer['name']},\n\nYou can now manage {$domainName} yourself in the Rowan Copy portal: create email accounts, change email passwords, update DNS records, build and edit your website, and handle billing.\n\n"
                        . "Set your password here to get started (the link works for 7 days):\n\n{$link}\n\nAfter that, log in any time at " . base_url('login.php') . "\n\n- Rowan Copy\n");
                    if ($sent) {
                        flash("Linked $domainName to $email and emailed them an invitation.");
                    } else {
                        $inviteLink = $link;
                        flash("Linked $domainName to $email. Email is off, so send them the invite link below yourself.");
                    }
                } else {
                    flash("Linked $domainName to {$customer['email']}. It now shows on their dashboard.");
                }
                break;
            case 'unlink':
                $pdo->prepare('DELETE FROM hosting_domains WHERE id = ?')->execute([(int) ($_POST['link_id'] ?? 0)]);
                flash('Domain unlinked. The customer can no longer manage it in the portal (nothing was changed in Plesk).');
                break;
        }
    } catch (RuntimeException $e) {
        flash($e->getMessage(), 'err');
    }
    if (!$inviteLink) {
        redirect('admin-hosting.php');
    }
}

$pleskDomains = [];
$pleskError = '';
if (plesk_enabled()) {
    try {
        $pleskDomains = plesk_list_domains();
    } catch (PleskError $e) {
        $pleskError = $e->getMessage();
    }
}
$links = db()->query('SELECT h.*, u.email, u.name FROM hosting_domains h JOIN users u ON u.id = h.user_id')->fetchAll();
$byDomain = array_column($links, null, 'domain');

page_header('Hosting');
?>
<div class="page">
  <a class="back" href="<?= h(base_url('admin.php')) ?>">← Admin</a>
  <h1>Hosting</h1>
  <p class="muted">Every domain on this server. Click <strong>Email &amp; DNS</strong> to manage a domain's email accounts and DNS records yourself<?= $isAdmin ? ', or link it to the customer who owns it so they can manage it from their own portal. New customers get an email invitation to set their password' : '' ?>.</p>

  <?php if ($inviteLink): ?>
    <div class="card"><h2>Invite link</h2><p class="muted small">Send this to the customer. It works for 7 days.</p><div class="reset-link"><?= h($inviteLink) ?></div></div>
  <?php endif; ?>

  <?php if (!plesk_enabled()): ?>
    <div class="notice">Plesk isn't connected yet. Add the <code>plesk</code> settings to config.php (see the README).</div>
  <?php elseif ($pleskError): ?>
    <p class="error">Couldn't talk to Plesk: <?= h($pleskError) ?></p>
  <?php else: ?>
    <p class="badge badge-live">Connected to Plesk · <?= count($pleskDomains) ?> domains</p>
  <?php endif; ?>

  <div class="table-wrap"><table>
    <tr><th>Domain</th><th>Customer</th><th>Manage</th><?php if ($isAdmin): ?><th>Link to a customer</th><?php endif; ?></tr>
    <?php foreach ($pleskDomains as $d): $l = $byDomain[$d['name']] ?? null; ?>
      <tr>
        <td><?= h($d['name']) ?></td>
        <td><?= $l ? h($l['name']) . '<br><span class="muted small">' . h($l['email']) . '</span>' : '<span class="muted">Not linked</span>' ?></td>
        <td><a class="btn btn-sm" href="<?= h(base_url('domain.php?plesk=' . $d['id'])) ?>">Email &amp; DNS</a></td>
        <?php if ($isAdmin): ?>
        <td>
          <?php if ($l): ?>
            <form method="post" onsubmit="return confirm('Unlink <?= h($d['name']) ?> from this customer?')"><?= csrf_field() ?>
              <input type="hidden" name="action" value="unlink"><input type="hidden" name="link_id" value="<?= (int) $l['id'] ?>">
              <button class="btn btn-ghost btn-sm">Unlink</button></form>
          <?php else: ?>
            <form method="post" class="link-form"><?= csrf_field() ?>
              <input type="hidden" name="action" value="link"><input type="hidden" name="domain" value="<?= h($d['name']) ?>">
              <input type="email" name="email" required placeholder="customer@email.com">
              <input name="name" placeholder="Customer name (new accounts)">
              <button class="btn btn-ghost btn-sm">Link</button></form>
          <?php endif; ?>
        </td>
        <?php endif; ?>
      </tr>
    <?php endforeach; ?>
  </table></div>
</div>
<?php page_footer();
