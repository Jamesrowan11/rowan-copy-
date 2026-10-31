<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

if (current_user()) {
    redirect('dashboard.php');
}

page_header('Build your website by describing it', 'home');
?>
<section class="hero">
  <p class="eyebrow">AI website builder</p>
  <h1>Tell us about your business.<br>We'll build the website.</h1>
  <p class="lead">Rowan Copy turns a few sentences into a professional, mobile-ready website. Want a change? Just ask, the way you'd ask a designer. Publish with one click.</p>
  <div class="cta">
    <a class="btn btn-lg" href="<?= h(base_url('register.php')) ?>">Create your website</a>
    <a class="btn btn-lg btn-ghost" href="<?= h(base_url('login.php')) ?>">I have an account</a>
  </div>
</section>

<section class="steps">
  <div class="step">
    <span class="num">1</span>
    <h3>Describe it</h3>
    <p>Your business name, what you do, who you serve, and the look you like. Plain English is fine.</p>
  </div>
  <div class="step">
    <span class="num">2</span>
    <h3>Refine it</h3>
    <p>"Make the header darker." "Add a pricing section." "Use my logo." Rowan Copy updates the site in seconds.</p>
  </div>
  <div class="step">
    <span class="num">3</span>
    <h3>Publish and manage</h3>
    <p>Go live with one click, upload your photos, roll back any change, and read messages from your contact form.</p>
  </div>
</section>
<?php page_footer();
