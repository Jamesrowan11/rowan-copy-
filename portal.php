<?php
// A website's Portal (the add-on): where the business's staff and clients sign in.
//   portal.php?s=<slug>                 home, or sign-in
//   &a=accept&t=<token>                 set a password from an invite
//   &a=forgot / &a=reset&t=<token>      reset a forgotten password
//   &a=account                          change name or password
//   &a=logout
require __DIR__ . '/lib/bootstrap.php';
start_session();

$stmt = db()->prepare('SELECT s.*, u.suspended AS owner_suspended, u.email AS owner_email, u.name AS owner_name FROM sites s
    JOIN users u ON u.id = s.user_id WHERE s.slug = ?');
$stmt->execute([(string) ($_GET['s'] ?? '')]);
$site = $stmt->fetch() ?: null;
$self = fn (string $q = '') => portal_url($site, $q);
header('X-Robots-Tag: noindex');
header("Content-Security-Policy: default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; frame-ancestors 'none'; form-action 'self'");
header('Referrer-Policy: same-origin');

/** Page frame in the business's name. */
function pp_open(?array $site, string $title, ?array $viewer = null): void
{
    $f = flash(); ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h($title . ($site ? ' · ' . $site['name'] : '')) ?></title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="<?= h(base_url('assets/clientportal.css')) ?>">
</head>
<body>
<header class="pp-top">
  <div class="pp-wrap pp-top-in">
    <span class="pp-brand"><span class="pp-mark" aria-hidden="true"><?= h(mb_strtoupper(mb_substr((string) ($site['name'] ?? 'P'), 0, 1))) ?></span><?= h($site['name'] ?? 'Portal') ?></span>
    <?php if ($viewer): ?>
      <nav class="pp-nav">
        <a href="<?= h(portal_url($site)) ?>">Home</a>
        <?php if ($viewer['role'] !== 'owner'): ?><a href="<?= h(portal_url($site, 'a=account')) ?>">My account</a><?php endif; ?>
        <?php if ($viewer['role'] === 'owner'): ?><a href="<?= h(base_url('site-portal.php?id=' . $site['id'])) ?>">Manage access</a>
        <?php else: ?><form method="post" action="<?= h(portal_url($site, 'a=logout')) ?>"><?= csrf_field() ?><button>Sign out</button></form><?php endif; ?>
      </nav>
    <?php endif; ?>
  </div>
</header>
<main class="pp-wrap pp-main">
<?php if ($f): ?><p class="pp-flash pp-flash-<?= $f['type'] === 'err' ? 'err' : 'ok' ?>" role="<?= $f['type'] === 'err' ? 'alert' : 'status' ?>"><?= h($f['msg']) ?></p><?php endif;
}

function pp_close(?array $site): void
{ ?>
</main>
<footer class="pp-wrap pp-foot">
  <?php if ($site): ?><a href="<?= h($site['custom_domain'] && $site['domain_connected_at'] ? 'https://' . site_host((string) $site['custom_domain']) : base_url('s/' . $site['slug'])) ?>">← <?= h($site['name']) ?> website</a> · <?php endif; ?>
  <span>Portal by <a href="<?= h(base_url()) ?>">Rowan Copy</a></span>
</footer>
</body>
</html>
<?php exit;
}

function pp_unavailable(?array $site, string $msg): never
{
    http_response_code(404);
    pp_open($site, 'Portal');
    echo '<section class="pp-card pp-narrow"><h1>Portal unavailable</h1><p class="pp-muted">' . h($msg) . '</p></section>';
    pp_close($site);
}

if (!$site || $site['taken_down'] || $site['owner_suspended']) {
    pp_unavailable(null, 'This portal doesn\'t exist. Check the link you were given.');
}
$owner = current_user();
$isOwner = $owner && (int) $owner['id'] === (int) $site['user_id'];
if (!portal_live($site)) {
    if ($isOwner) {
        flash('Your Portal isn\'t switched on. Add it here.', 'err');
        redirect('site-portal.php?id=' . $site['id']);
    }
    pp_unavailable($site, $site['name'] . ' doesn\'t have a portal right now.');
}

$a = (string) ($_GET['a'] ?? '');
$viewer = portal_viewer($site);

// ---------------------------------------------------------------- actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    try {
        switch ($a) {
            case 'logout':
                portal_log_out($site);
                flash('You\'re signed out.');
                header('Location: ' . $self(), true, 303);
                exit;

            case 'login':
                $email = strtolower(post_str('email', 200));
                if (!throttle('plogin-ip:' . client_ip(), 20, 900) || !throttle('plogin:' . $site['id'] . ':' . $email, 8, 900)) {
                    throw new RuntimeException('Too many sign-in attempts. Please wait 15 minutes and try again.');
                }
                $stmt = db()->prepare('SELECT * FROM portal_users WHERE site_id = ? AND email = ? AND disabled = 0');
                $stmt->execute([$site['id'], $email]);
                $pu = $stmt->fetch();
                if (!$pu || !$pu['password_hash'] || !password_verify((string) ($_POST['password'] ?? ''), $pu['password_hash'])) {
                    throw new RuntimeException($pu && !$pu['password_hash']
                        ? 'You haven\'t set a password yet. Use the link in your invite email, or click “Forgot your password?”.'
                        : 'That email and password don\'t match.');
                }
                portal_log_in($site, $pu);
                header('Location: ' . $self(), true, 303);
                exit;

            case 'accept':
            case 'reset':
                $pu = portal_user_by_token((int) $site['id'], (string) ($_POST['t'] ?? ''), $a === 'accept' ? 'invite' : 'reset');
                if (!$pu) {
                    throw new RuntimeException('This link has expired or was already used. Ask for a new one below.');
                }
                $pw = portal_password_ok((string) ($_POST['password'] ?? ''));
                $name = $a === 'accept' ? (post_str('name', 100) ?: $pu['name']) : $pu['name'];
                db()->prepare('UPDATE portal_users SET password_hash = ?, name = ?, token_hash = NULL, token_kind = NULL, token_expires = NULL,
                    session_version = session_version + 1 WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $name, $pu['id']]);
                portal_log_in($site, portal_user((int) $site['id'], (int) $pu['id']));
                flash($a === 'accept' ? 'Welcome, ' . $name . '! Your account is ready.' : 'Your password is changed.');
                header('Location: ' . $self(), true, 303);
                exit;

            case 'forgot':
                $email = strtolower(post_str('email', 200));
                if (throttle('pforgot:' . client_ip(), 5, 900)) {
                    $stmt = db()->prepare('SELECT * FROM portal_users WHERE site_id = ? AND email = ? AND disabled = 0');
                    $stmt->execute([$site['id'], $email]);
                    if ($pu = $stmt->fetch()) {
                        $kind = $pu['password_hash'] ? 'reset' : 'invite';
                        $token = portal_issue_token((int) $pu['id'], $kind, $kind === 'reset' ? 3600 : 7 * 86400);
                        send_email($pu['email'], $site['name'] . ' portal: ' . ($kind === 'reset' ? 'reset your password' : 'set your password'),
                            "Hi {$pu['name']},\n\nUse this link to set a new password for {$site['name']}'s portal"
                            . ($kind === 'reset' ? ' (it works for 1 hour)' : '') . ":\n" . $self('a=' . ($kind === 'reset' ? 'reset' : 'accept') . '&t=' . $token)
                            . "\n\nIf you didn't ask for this, you can ignore this email.\n");
                    }
                }
                flash('If that email has an account here, we\'ve sent it a link to set a password.');
                header('Location: ' . $self(), true, 303);
                exit;

            case 'account':
                if (!$viewer || $viewer['role'] === 'owner') {
                    break;
                }
                $name = post_str('name', 100);
                if ($name === '') {
                    throw new RuntimeException('Your name can\'t be empty.');
                }
                db()->prepare('UPDATE portal_users SET name = ? WHERE id = ?')->execute([$name, $viewer['id']]);
                if ((string) ($_POST['new_password'] ?? '') !== '') {
                    if (!password_verify((string) ($_POST['current_password'] ?? ''), (string) $viewer['password_hash'])) {
                        throw new RuntimeException('Your current password is incorrect.');
                    }
                    $pw = portal_password_ok((string) $_POST['new_password']);
                    db()->prepare('UPDATE portal_users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?')
                        ->execute([password_hash($pw, PASSWORD_DEFAULT), $viewer['id']]);
                    portal_log_in($site, portal_user((int) $site['id'], (int) $viewer['id']));
                }
                flash('Saved.');
                header('Location: ' . $self('a=account'), true, 303);
                exit;
        }
    } catch (RuntimeException $e) {
        flash($e->getMessage(), 'err');
        $keep = in_array($a, ['accept', 'reset'], true) ? 'a=' . $a . '&t=' . rawurlencode((string) ($_POST['t'] ?? '')) : ($a === 'login' ? '' : 'a=' . $a);
        header('Location: ' . $self($keep), true, 303);
        exit;
    }
    header('Location: ' . $self(), true, 303);
    exit;
}

// ---------------------------------------------------------------- pages
if (in_array($a, ['accept', 'reset'], true)) {
    $t = (string) ($_GET['t'] ?? '');
    $pu = portal_user_by_token((int) $site['id'], $t, $a === 'accept' ? 'invite' : 'reset');
    pp_open($site, $a === 'accept' ? 'Set up your account' : 'Choose a new password');
    if (!$pu): ?>
      <section class="pp-card pp-narrow">
        <h1>This link has expired</h1>
        <p class="pp-muted">Links work once, for a limited time. Enter your email and we'll send a new one.</p>
        <form method="post" action="<?= h($self('a=forgot')) ?>" class="pp-form"><?= csrf_field() ?>
          <label>Email <input type="email" name="email" required autocomplete="email"></label>
          <button class="pp-btn">Send me a new link</button></form>
      </section>
    <?php else: ?>
      <section class="pp-card pp-narrow">
        <h1><?= $a === 'accept' ? 'Welcome to ' . h($site['name']) : 'Choose a new password' ?></h1>
        <p class="pp-muted"><?= $a === 'accept' ? 'Set a password to finish setting up your ' . ($pu['role'] === 'staff' ? 'staff' : 'client') . ' account for ' . h($pu['email']) . '.' : 'For ' . h($pu['email']) . '.' ?></p>
        <form method="post" action="<?= h($self('a=' . $a)) ?>" class="pp-form"><?= csrf_field() ?><input type="hidden" name="t" value="<?= h($t) ?>">
          <?php if ($a === 'accept'): ?><label>Your name <input name="name" required maxlength="100" value="<?= h($pu['name']) ?>" autocomplete="name"></label><?php endif; ?>
          <input type="email" value="<?= h($pu['email']) ?>" autocomplete="username" hidden readonly>
          <label>Password <input type="password" name="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label>
          <button class="pp-btn"><?= $a === 'accept' ? 'Create my account' : 'Save password' ?></button></form>
      </section>
    <?php endif;
    pp_close($site);
}

if ($a === 'forgot') {
    pp_open($site, 'Forgot your password');
    ?>
    <section class="pp-card pp-narrow">
      <h1>Forgot your password?</h1>
      <p class="pp-muted">Enter the email you were invited with and we'll send you a link.</p>
      <form method="post" action="<?= h($self('a=forgot')) ?>" class="pp-form"><?= csrf_field() ?>
        <label>Email <input type="email" name="email" required autocomplete="email"></label>
        <button class="pp-btn">Send me a link</button></form>
      <p class="pp-small"><a href="<?= h($self()) ?>">Back to sign in</a></p>
    </section>
    <?php pp_close($site);
}

if (!$viewer) {
    pp_open($site, 'Sign in');
    ?>
    <section class="pp-card pp-narrow">
      <h1>Sign in</h1>
      <p class="pp-muted">For <?= h($site['name']) ?>'s staff and clients.</p>
      <form method="post" action="<?= h($self('a=login')) ?>" class="pp-form"><?= csrf_field() ?>
        <label>Email <input type="email" name="email" required autocomplete="email" autofocus></label>
        <label>Password <input type="password" name="password" required autocomplete="current-password"></label>
        <button class="pp-btn">Sign in</button></form>
      <p class="pp-small"><a href="<?= h($self('a=forgot')) ?>">Forgot your password?</a> · No account? Ask <?= h($site['name']) ?> to invite you.</p>
    </section>
    <?php pp_close($site);
}

if ($a === 'account' && $viewer['role'] !== 'owner') {
    pp_open($site, 'My account', $viewer);
    ?>
    <section class="pp-card pp-narrow">
      <h1>My account</h1>
      <form method="post" action="<?= h($self('a=account')) ?>" class="pp-form"><?= csrf_field() ?>
        <label>Name <input name="name" required maxlength="100" value="<?= h($viewer['name']) ?>" autocomplete="name"></label>
        <label>Email <input value="<?= h($viewer['email']) ?>" disabled></label>
        <p class="pp-muted pp-small">To change your password, enter your current one and a new one.</p>
        <label>Current password <input type="password" name="current_password" autocomplete="current-password"></label>
        <label>New password <input type="password" name="new_password" minlength="8" autocomplete="new-password"></label>
        <button class="pp-btn">Save</button></form>
    </section>
    <?php pp_close($site);
}

// ---------------------------------------------------------------- home
$first = explode(' ', trim((string) $viewer['name']))[0];
$staffView = portal_is_staff($viewer);
$team = portal_users((int) $site['id'], 'staff');
$mailDomain = db()->prepare('SELECT domain FROM mail_domains WHERE user_id = ? AND verified = 1 ORDER BY id LIMIT 1');
$mailDomain->execute([$site['user_id']]);
$mailDomain = (string) $mailDomain->fetchColumn();
pp_open($site, 'Home', $viewer);
?>
<?php if ($viewer['role'] === 'owner'): ?>
  <p class="pp-flash pp-flash-ok">You're viewing your portal as the owner. Your staff see this page; clients see their own version.</p>
<?php endif; ?>
<section class="pp-hello">
  <p class="pp-kicker"><?= $staffView ? 'Staff portal' : 'Client portal' ?></p>
  <h1>Hi <?= h($first) ?>!</h1>
  <p class="pp-muted"><?= $staffView ? 'Everything for the ' . h($site['name']) . ' team in one place.' : 'Welcome to your private page with ' . h($site['name']) . '.' ?></p>
</section>

<div class="pp-grid">
<?php if ($staffView): ?>
  <section class="pp-card">
    <h2>Team</h2>
    <?php if (!$team): ?><p class="pp-muted">No staff have been invited yet.</p><?php endif; ?>
    <ul class="pp-people">
      <?php foreach ($team as $t): ?>
        <li><span class="pp-avatar" aria-hidden="true"><?= h(mb_strtoupper(mb_substr($t['name'], 0, 1))) ?></span>
          <span><strong><?= h($t['name']) ?></strong><a href="mailto:<?= h($t['email']) ?>"><?= h($t['email']) ?></a></span></li>
      <?php endforeach; ?>
    </ul>
  </section>
  <section class="pp-card">
    <h2>Work email</h2>
    <?php if ($mailDomain !== ''): ?>
      <p class="pp-muted">Read and send email for <strong>@<?= h($mailDomain) ?></strong> in your browser or the free Zoho Mail app.</p>
      <a class="pp-btn" href="<?= h(zoho_mail_webmail_url()) ?>" target="_blank" rel="noopener">Open email</a>
    <?php else: ?>
      <p class="pp-muted"><?= h($site['name']) ?> hasn't set up work email yet.</p>
    <?php endif; ?>
  </section>
<?php else: ?>
  <section class="pp-card">
    <h2>Contact <?= h($site['name']) ?></h2>
    <p class="pp-muted">Questions about your work or an appointment? Get in touch.</p>
    <a class="pp-btn" href="mailto:<?= h($site['owner_email']) ?>">Email us</a>
  </section>
  <section class="pp-card">
    <h2>Your account</h2>
    <p class="pp-muted">Signed in as <?= h($viewer['email']) ?>.</p>
    <a class="pp-btn pp-btn-ghost" href="<?= h($self('a=account')) ?>">Change name or password</a>
  </section>
<?php endif; ?>
</div>
<?php pp_close($site);
