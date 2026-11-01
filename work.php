<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

// Case studies. Replace the placeholder notes in [brackets] with real links and results as they come in.
$samples = [
    ['Website copy', 'Home services company: full site rewrite', 'Rewrote five pages for a Maryland HVAC company. Goal: sound trustworthy and local without the usual contractor clichés. [Placeholder: add live link & before/after.]'],
    ['Policy package', 'Salon: policies & client waiver', 'Privacy policy, terms, and a plain-English client waiver a first-timer could actually read. [Placeholder: add sample PDF.]'],
    ['Captions', 'Coffee roaster: 30 social captions', 'A month of captions in a warm, slightly nerdy voice that matched the brand. [Placeholder: add sample grid.]'],
    ['Email', 'Boutique gym: re-engagement email', 'A win-back email to lapsed members that booked 14 trials in a week. [Placeholder: add metrics & screenshot.]'],
    ['Listings', 'Restaurant: Google & Yelp descriptions', 'Profile descriptions tuned for search and for hungry humans. [Placeholder: add links.]'],
    ['Website copy', 'Consultant: one-page site', 'A single sharp page that turned a vague service into an obvious yes. [Placeholder: add live link.]'],
];

page_header('Work', 'public', 'A selection of copywriting samples and short case studies from Rowan Copy.');
?>
<div class="m-wrap m-section">
  <header class="m-page-head">
    <p class="eyebrow">Work</p>
    <h1>Selected work</h1>
    <p class="lead">A few projects that show the range. Real samples and case studies are on the way; the cards below will be swapped for the finished pieces.</p>
  </header>

  <div class="m-cards">
    <?php foreach ($samples as [$tag, $title, $blurb]): ?>
      <article class="m-card m-work">
        <div class="m-work-img" aria-hidden="true"><?= h($tag) ?></div>
        <span class="m-pill"><?= h($tag) ?></span>
        <h2><?= h($title) ?></h2>
        <p><?= h($blurb) ?></p>
      </article>
    <?php endforeach; ?>
  </div>

  <div class="m-cta m-cta-soft">
    <h2>Want to see samples for your industry?</h2>
    <p>Tell us what you do and we'll send relevant examples along with a quote.</p>
    <a class="btn btn-lg btn-accent" href="<?= h(base_url('contact.php')) ?>">Get a quote</a>
  </div>
</div>
<?php page_footer();
