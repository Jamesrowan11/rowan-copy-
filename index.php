<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

// A customer's own domain (e.g. mybakery.com) pointed at this server shows their site.
$host = strtolower(preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? '')) ?? '');
if ($host !== '' && $host !== strtolower((string) parse_url((string) cfg('base_url'), PHP_URL_HOST))) {
    $stmt = db()->prepare(SITE_SERVE_SQL . ' WHERE s.custom_domain IN (?, ?)');
    $stmt->execute([$host, preg_replace('/^www\./', '', $host)]);
    if ($site = $stmt->fetch()) {
        serve_site($site);
    }
}

$c = company();
$loggedIn = (bool) current_user();
$why = [
    ['A clear process', 'You always know what stage we\'re at, what we need from you, and when it lands. No black box.'],
    ['Fast turnaround', 'Most projects come back in days, not weeks. You get a real timeline up front, and we hold to it.'],
    ['Copy-and-paste ready', 'Delivered formatted and final, so you can drop it straight into your site or scheduler.'],
    ['Real human writing', 'Every word of our copywriting is written by a person who read about your business. No generic filler.'],
];

page_header('Clean copy and websites for small businesses', 'home',
    $c['name'] . ' writes website copy, policies, captions and emails, and builds and hosts websites for small businesses. Based in ' . $c['location'] . '.');
?>
<script type="application/ld+json"><?= json_encode([
    '@context' => 'https://schema.org', '@type' => 'ProfessionalService', 'name' => $c['name'],
    'description' => $c['tagline'], 'url' => base_url(), 'email' => $c['email'],
    'founder' => ['@type' => 'Person', 'name' => $c['owner']],
    'address' => ['@type' => 'PostalAddress', 'addressLocality' => 'Howard County', 'addressRegion' => 'MD', 'addressCountry' => 'US'],
], JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) ?></script>

<section class="m-hero">
  <div class="m-wrap m-hero-grid">
    <div>
      <p class="eyebrow">Copywriting, websites &amp; hosting · <?= h($c['location']) ?></p>
      <h1>Clean <span class="accent-text">copy</span> for small businesses.</h1>
      <p class="lead">Words are the part of your business people judge first. We write the website pages, policies, captions and emails that make small businesses sound as good as they are, and we build and host the websites they live on.</p>
      <div class="cta">
        <a class="btn btn-lg btn-accent" href="<?= h(base_url($loggedIn ? 'dashboard.php' : 'register.php')) ?>"><?= $loggedIn ? 'Go to my account' : 'Build your website' ?></a>
        <a class="btn btn-lg btn-ghost" href="<?= h(base_url('contact.php')) ?>">Get a quote</a>
      </div>
      <dl class="m-stats">
        <div><dt>1 day</dt><dd>First reply, guaranteed</dd></div>
        <div><dt>Minutes</dt><dd>To a first website draft</dd></div>
        <div><dt>100%</dt><dd>Copy-and-paste ready</dd></div>
      </dl>
    </div>
    <div class="m-sample" aria-hidden="true">
      <div class="m-sample-back"></div>
      <div class="m-sample-card">
        <p class="m-sample-tag"><span></span>Homepage draft · v2</p>
        <p class="m-sample-head">Repairs done right, the first time.</p>
        <p>Family-owned and licensed in Maryland. Tell us what's wrong and we'll give you a straight answer and a fair price. No upsell, no surprises.</p>
        <span class="m-sample-btn">Book an estimate</span>
      </div>
      <div class="m-sample-note">✓ Delivered copy-and-paste ready</div>
    </div>
  </div>
</section>

<div class="m-strip">
  <span>Based in <?= h($c['location']) ?></span><span aria-hidden="true">•</span>
  <span>Serving Maryland small businesses</span><span aria-hidden="true">•</span>
  <span>Your own customer portal</span>
</div>

<section class="m-wrap m-section">
  <p class="eyebrow">Three ways we help</p>
  <h2>Pick what you need. Mix and match anytime.</h2>
  <div class="m-ways">
    <div class="m-way">
      <span class="m-icon" aria-hidden="true">✎</span>
      <h3>We write it</h3>
      <p>Website pages, policies, captions, emails and listings, written by a person, priced up front, delivered ready to use.</p>
      <a href="<?= h(base_url('services.php')) ?>">Copywriting services →</a>
    </div>
    <div class="m-way m-way-featured">
      <span class="m-icon" aria-hidden="true">✦</span>
      <h3>Build your website with AI</h3>
      <p>Describe your business in plain English and get a professional, mobile-ready website in minutes. Change anything by asking. Publish with one click.</p>
      <a href="<?= h(base_url('register.php')) ?>">Start free →</a>
    </div>
    <div class="m-way">
      <span class="m-icon" aria-hidden="true">✉</span>
      <h3>Hosting, domain &amp; email</h3>
      <p>Your website hosted, your domain connected, and business email accounts you manage yourself from your portal.</p>
      <a href="<?= h(base_url('pricing.php')) ?>">See plans →</a>
    </div>
  </div>
</section>

<section class="m-band">
  <div class="m-wrap m-section">
    <div class="m-head-row">
      <div>
        <p class="eyebrow">What we write</p>
        <h2>A focused menu, priced up front.</h2>
        <p class="muted">Need something not listed? Ask. If it's words, it's probably a yes.</p>
      </div>
      <a class="btn btn-ghost btn-sm" href="<?= h(base_url('services.php')) ?>">All services &amp; pricing</a>
    </div>
    <div class="m-cards">
      <?php foreach (array_slice(SERVICES, 0, 6) as $s): ?>
        <a class="m-card" href="<?= h(base_url('services.php')) ?>">
          <h3><?= h($s['name']) ?></h3>
          <p><?= h($s['blurb']) ?></p>
          <span class="m-price"><?= h($s['price']) ?></span>
        </a>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="m-wrap m-section">
  <p class="eyebrow">The website builder</p>
  <h2>From a few sentences to a live website.</h2>
  <ol class="m-steps">
    <li><span>1</span><h3>Describe it</h3><p>Your business name, what you do, who you serve and the look you like. Plain English is fine.</p></li>
    <li><span>2</span><h3>Refine it</h3><p>"Make the header darker." "Add a pricing section." "Use my logo." Your site updates in moments.</p></li>
    <li><span>3</span><h3>Publish it</h3><p>Go live with one click on your own domain. Every change is saved, so you can always go back.</p></li>
    <li><span>4</span><h3>Run it</h3><p>Read messages from your contact form, see your visitors, and manage your business email in one place.</p></li>
  </ol>
</section>

<section class="m-dark">
  <div class="m-wrap m-section">
    <p class="eyebrow">Why <?= h($c['name']) ?></p>
    <h2>Agency-grade work, without the agency runaround.</h2>
    <div class="m-why">
      <?php foreach ($why as [$t, $b]): ?>
        <div><span class="m-check" aria-hidden="true">✓</span><h3><?= h($t) ?></h3><p><?= h($b) ?></p></div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="m-wrap m-section">
  <div class="m-cta">
    <h2>Tell us what you need.</h2>
    <p>Build your website yourself today, or send a few details and we'll come back with a quote, a timeline and a plan. No pressure, no jargon.</p>
    <div class="cta">
      <a class="btn btn-lg btn-accent" href="<?= h(base_url('register.php')) ?>">Build your website</a>
      <a class="btn btn-lg btn-outline-light" href="<?= h(base_url('contact.php')) ?>">Get a quote</a>
    </div>
  </div>
</section>
<?php page_footer();
