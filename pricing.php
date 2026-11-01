<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$interval = ($_GET['interval'] ?? '') === 'year' ? 'year' : 'month';
$faq = [
    ['How fast will I get my copy?', 'Most single projects come back within a few days. You get a firm delivery date with your quote.'],
    ['What if I don\'t like the first draft?', 'Revision rounds are included in every copywriting quote. Tell us what to change and we\'ll revise it.'],
    ['How does the website builder work?', 'Create a free account, describe your business, and your website is ready in a few minutes. Ask for any change in plain English, then publish with one click. Upgrade when you want your own domain, more websites or business email.'],
    ['How do payments work?', 'Website plans bill monthly or yearly through Stripe, and you can change or cancel anytime from your Billing page. One-time copywriting projects are quoted and billed up front.'],
    ['Can I use my own domain and email?', 'Yes. Paid plans connect your own domain, and Starter and up include business email accounts on it that you manage yourself from your portal.'],
    ['Do you work outside Maryland?', 'Yes. We\'re based in Howard County and love working with local businesses, but everything runs remotely just as well. Clients are all over the U.S.'],
];

page_header('Pricing', 'public', 'Website builder, hosting and email plans billed monthly or yearly, plus up-front prices for website copy, policies, captions and emails.');
?>
<div class="m-wrap m-section">
  <header class="m-page-head">
    <p class="eyebrow">Pricing</p>
    <h1>Simple, honest pricing.</h1>
    <p class="lead">Website plans you can start free and change anytime, and copywriting with a firm quote before any work begins.</p>
  </header>

  <h2 id="plans">Websites, hosting &amp; email</h2>
  <div class="interval-toggle" role="group" aria-label="Billing period">
    <a href="<?= h(base_url('pricing.php#plans')) ?>" class="<?= $interval === 'month' ? 'active' : '' ?>">Monthly</a>
    <a href="<?= h(base_url('pricing.php?interval=year#plans')) ?>" class="<?= $interval === 'year' ? 'active' : '' ?>">Yearly <span class="save">2 months free</span></a>
  </div>
  <div class="plan-grid">
    <?php foreach (plans() as $key => $plan): ?>
      <div class="card plan<?= $key === 'business' ? ' plan-current' : '' ?>">
        <?php if ($key === 'business'): ?><span class="m-pill m-popular">Most popular</span><?php endif; ?>
        <h3><?= h($plan['name']) ?></h3>
        <p class="plan-price"><?= h($interval === 'year' && !empty($plan['price_yearly']) ? $plan['price_yearly'] : ($plan['price'] ?? '')) ?></p>
        <ul><?php foreach ((array) ($plan['features'] ?? []) as $f): ?><li><?= h($f) ?></li><?php endforeach; ?></ul>
        <a class="btn btn-block <?= $key === 'business' ? 'btn-accent' : '' ?>" href="<?= h(base_url($key === 'free' ? 'register.php' : 'billing.php?interval=' . $interval)) ?>"><?= $key === 'free' ? 'Start free' : 'Choose ' . h($plan['name']) ?></a>
      </div>
    <?php endforeach; ?>
  </div>

  <h2 class="m-gap">Copywriting projects</h2>
  <p class="muted">Starting prices. You'll always get a firm quote first, so the final number is never a surprise.</p>
  <div class="m-cards">
    <?php foreach (SERVICES as $s): if (str_starts_with($s['name'], 'Websites')) continue; ?>
      <div class="m-card m-price-card">
        <h3><?= h($s['name']) ?></h3>
        <p class="plan-price"><?= h(preg_replace('/^from /', '', $s['price']) ?? $s['price']) ?></p>
        <?php if (str_starts_with($s['price'], 'from')): ?><p class="m-starting">starting</p><?php endif; ?>
        <p><?= h($s['blurb']) ?></p>
        <ul><?php foreach ($s['details'] as $d): ?><li><?= h($d) ?></li><?php endforeach; ?></ul>
        <a class="btn btn-ghost btn-sm" href="<?= h(base_url('contact.php')) ?>">Get a quote</a>
      </div>
    <?php endforeach; ?>
  </div>

  <div class="m-note"><strong>Heads up on policies:</strong> policy and agreement wording is a plain-language starting point, not legal advice. Please confirm anything legally sensitive with your own attorney.</div>

  <section class="m-faq" aria-labelledby="faq-heading">
    <h2 id="faq-heading">Common questions</h2>
    <?php foreach ($faq as [$q, $a]): ?>
      <details class="m-card"><summary><?= h($q) ?></summary><p><?= h($a) ?></p></details>
    <?php endforeach; ?>
  </section>
</div>
<?php page_footer();
