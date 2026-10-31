<?php
declare(strict_types=1);

function page_header(string $title, string $bodyClass = ''): void
{
    header("Content-Security-Policy: frame-ancestors 'self'");
    $user = current_user();
    $flash = flash();
    ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= h($title) ?> · Rowan Copy</title>
<link rel="icon" href="<?= h(base_url('assets/favicon.svg')) ?>" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= h(base_url('assets/app.css')) ?>">
</head>
<body class="<?= h($bodyClass) ?>">
<header class="nav">
  <a class="brand" href="<?= h(base_url($user ? 'dashboard.php' : '')) ?>">
    <span class="brand-mark" aria-hidden="true">R</span> Rowan Copy
  </a>
  <nav>
    <?php if ($user): ?>
      <a href="<?= h(base_url('dashboard.php')) ?>">My sites</a>
      <a href="<?= h(base_url('account.php')) ?>">Account</a>
      <?php if (is_admin($user)): ?><a href="<?= h(base_url('admin.php')) ?>">Admin</a><?php endif; ?>
      <form method="post" action="<?= h(base_url('logout.php')) ?>" class="inline"><?= csrf_field() ?><button class="link">Log out</button></form>
    <?php else: ?>
      <a href="<?= h(base_url('login.php')) ?>">Log in</a>
      <a class="btn btn-sm" href="<?= h(base_url('register.php')) ?>">Get started free</a>
    <?php endif; ?>
  </nav>
</header>
<?php if ($flash): ?>
  <div class="flash flash-<?= h($flash['type']) ?>"><?= h($flash['msg']) ?></div>
<?php endif; ?>
<main>
<?php
}

function page_footer(): void
{
    ?>
</main>
<footer class="foot">© <?= date('Y') ?> Rowan Copy · Websites built by describing your business.</footer>
</body>
</html>
<?php
}
