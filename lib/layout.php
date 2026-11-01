<?php
declare(strict_types=1);

require_once __DIR__ . '/marketing.php';

/**
 * @param string $description meta description for public pages (search engines and link previews)
 */
function page_header(string $title, string $bodyClass = '', string $description = ''): void
{
    header("Content-Security-Policy: frame-ancestors 'self'");
    $user = current_user();
    $flash = flash();
    $current = basename((string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    $c = company();
    ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= h($title) ?> · <?= h($c['name']) ?></title>
<?php if ($description !== ''): ?>
<meta name="description" content="<?= h($description) ?>">
<meta property="og:title" content="<?= h($title) ?> · <?= h($c['name']) ?>">
<meta property="og:description" content="<?= h($description) ?>">
<meta property="og:type" content="website">
<?php endif; ?>
<meta name="theme-color" content="#14233f">
<link rel="icon" href="<?= h(base_url('assets/favicon.svg')) ?>" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= h(base_url('assets/app.css')) ?>">
</head>
<body class="<?= h($bodyClass) ?>">
<a class="skip" href="#main">Skip to content</a>
<header class="nav">
  <a class="brand" href="<?= h(base_url('')) ?>">
    <span class="brand-mark" aria-hidden="true">R</span> <?= h($c['name']) ?>
  </a>
  <input type="checkbox" id="nav-toggle" class="nav-toggle" aria-hidden="true">
  <label for="nav-toggle" class="nav-burger" aria-label="Menu"><span></span></label>
  <nav class="nav-links" aria-label="Main">
    <?php if ($user): ?>
      <a href="<?= h(base_url('dashboard.php')) ?>">My account</a>
      <a href="<?= h(base_url('domains.php')) ?>">Domains</a>
      <a href="<?= h(base_url('billing.php')) ?>">Billing</a>
      <?php if (referrals_enabled()): ?><a href="<?= h(base_url('referrals.php')) ?>">Refer a friend</a><?php endif; ?>
      <a href="<?= h(base_url('account.php')) ?>">Settings</a>
      <?php if (is_staff($user)): ?>
        <a href="<?= h(base_url('admin-hosting.php')) ?>">Hosting</a>
        <a href="<?= h(base_url('admin.php')) ?>"><?= is_admin($user) ? 'Admin' : 'Staff' ?></a>
      <?php endif; ?>
      <form method="post" action="<?= h(base_url('logout.php')) ?>" class="inline"><?= csrf_field() ?><button class="link">Log out</button></form>
    <?php else: ?>
      <?php foreach (PUBLIC_NAV as $href => $label): ?>
        <a href="<?= h(base_url($href)) ?>"<?= $current === $href . '.php' ? ' aria-current="page"' : '' ?>><?= h($label) ?></a>
      <?php endforeach; ?>
      <a href="<?= h(base_url('login.php')) ?>" class="nav-login">Log in</a>
      <a class="btn btn-sm btn-accent" href="<?= h(base_url('register.php')) ?>">Build your website</a>
    <?php endif; ?>
  </nav>
</header>
<?php if ($flash): ?>
  <div class="flash flash-<?= h($flash['type']) ?>"><?= h($flash['msg']) ?></div>
<?php endif; ?>
<main id="main">
<?php
}

function page_footer(): void
{
    $c = company();
    ?>
</main>
<footer class="site-foot">
  <div class="foot-grid">
    <div>
      <p class="brand"><span class="brand-mark" aria-hidden="true">R</span> <?= h($c['name']) ?></p>
      <p><?= h($c['tagline']) ?>.</p>
      <p class="muted-light">Based in <?= h($c['location']) ?>, serving local and remote clients across the U.S.</p>
    </div>
    <div>
      <h2>Explore</h2>
      <ul>
        <?php foreach (PUBLIC_NAV as $href => $label): ?><li><a href="<?= h(base_url($href)) ?>"><?= h($label) ?></a></li><?php endforeach; ?>
        <li><a href="<?= h(base_url('register.php')) ?>">Website builder</a></li>
      </ul>
    </div>
    <div>
      <h2>Get in touch</h2>
      <ul>
        <li><a href="mailto:<?= h($c['email']) ?>"><?= h($c['email']) ?></a></li>
        <li><a href="<?= h(base_url('contact.php')) ?>">Get a quote →</a></li>
        <li><a href="<?= h(base_url('login.php')) ?>">Customer login</a></li>
      </ul>
    </div>
  </div>
  <div class="foot-bottom">
    <p>© <?= date('Y') ?> <?= h($c['name']) ?>. <?= h($c['tagline']) ?>.</p>
    <p><a href="<?= h(base_url('terms.php')) ?>">Terms</a> · <a href="<?= h(base_url('privacy.php')) ?>">Privacy</a></p>
  </div>
</footer>
</body>
</html>
<?php
}
