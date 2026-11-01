<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$c = company();
page_header('About', 'public', $c['name'] . ' is a copywriting and web studio run by ' . $c['owner'] . ' in ' . $c['location'] . '.');
?>
<div class="m-wrap m-section m-about">
  <aside>
    <div class="m-about-photo" aria-hidden="true"><span class="brand-mark">R</span></div>
    <div class="m-card">
      <p><strong><?= h($c['name']) ?></strong></p>
      <p class="muted"><?= h($c['tagline']) ?></p>
      <p class="muted"><?= h($c['location']) ?></p>
      <a href="mailto:<?= h($c['email']) ?>"><?= h($c['email']) ?></a>
    </div>
  </aside>
  <div>
    <p class="eyebrow">About</p>
    <h1>Hi, I'm <?= h($c['owner']) ?>.</h1>
    <div class="m-prose">
      <p><?= h($c['name']) ?> is my copywriting and web studio. I work with small businesses: the kind run by people who are great at what they do and would rather not spend a weekend wrestling with the words on their website.</p>
      <p>That's the whole job: take what makes your business good and say it plainly, so the right customers get it in about three seconds. I write website pages, the policies and agreements nobody enjoys writing, social captions, and the emails that actually get opened. Then I hand it over formatted and ready to use, not a pile of edits for you to sort out.</p>
      <p>Not everyone needs a writer for every page, so I also built the <?= h($c['name']) ?> website builder: describe your business and get a professional site in minutes, then host it here with your own domain and business email, all managed from one portal.</p>
      <p>I'm based in <?= h($c['location']) ?>, and I love working with local businesses here. I also work remotely with clients all over the U.S. What matters is that you get words that sound like a real person wrote them, because one did.</p>
      <p>No account managers, no hand-offs, no mystery. You talk to me, and you always know where things stand. If that's the kind of help you've been looking for, let's talk.</p>
    </div>
    <div class="cta cta-left">
      <a class="btn btn-lg btn-accent" href="<?= h(base_url('contact.php')) ?>">Start a project</a>
      <a class="btn btn-lg btn-ghost" href="<?= h(base_url('services.php')) ?>">See services</a>
    </div>
  </div>
</div>
<?php page_footer();
