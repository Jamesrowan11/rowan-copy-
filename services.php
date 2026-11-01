<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

page_header('Services', 'public', 'Website copy, policy & agreement packages, social captions, marketing emails, business listings, and websites with hosting and email, with starting prices.');
?>
<div class="m-wrap m-section">
  <header class="m-page-head">
    <p class="eyebrow">Services</p>
    <h1>Words, priced up front.</h1>
    <p class="lead">Here's what we write and what it starts at. Every project gets a firm quote before any work begins. These are the floors, not surprises waiting to happen.</p>
  </header>

  <div class="m-service-list">
    <?php foreach (SERVICES as $s): ?>
      <article class="m-card m-service">
        <div class="m-service-top">
          <h2><?= h($s['name']) ?></h2>
          <span class="m-pill"><?= h($s['price']) ?></span>
        </div>
        <p><?= h($s['blurb']) ?></p>
        <ul><?php foreach ($s['details'] as $d): ?><li><?= h($d) ?></li><?php endforeach; ?></ul>
      </article>
    <?php endforeach; ?>
  </div>

  <div class="m-note"><strong>A note on policies and agreements:</strong> policy and agreement wording is a clear, plain-language starting point, not legal advice. For anything legally sensitive, please confirm the final wording with your own attorney.</div>

  <div class="cta cta-left">
    <a class="btn btn-lg btn-accent" href="<?= h(base_url('contact.php')) ?>">Get a quote</a>
    <a class="btn btn-lg btn-ghost" href="<?= h(base_url('pricing.php')) ?>">See website plans</a>
  </div>
</div>
<?php page_footer();
