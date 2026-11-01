<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$c = company();
$errors = [];
$sent = false;
$v = ['name' => '', 'business' => '', 'email' => '', 'phone' => '', 'service' => '', 'budget' => '', 'message' => ''];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $v = inquiry_fields($_POST);
    if (!empty($_POST['_hp'])) {
        $sent = true; // spam trap: pretend it worked
    } else {
        $errors = save_inquiry($v);
        $sent = !$errors;
    }
}

page_header('Get a quote', 'public', 'Tell ' . $c['name'] . ' what you need written or built and get a quote. Based in ' . $c['location'] . '.');
$err = fn ($k) => isset($errors[$k]) ? '<span class="field-error">' . h($errors[$k]) . '</span>' : '';
?>
<div class="m-wrap m-section m-contact">
  <div>
    <p class="eyebrow">Contact</p>
    <h1>Get a quote</h1>
    <p class="lead">Fill out the form and we'll come back with a price, a timeline, and any questions. The more you tell us, the sharper the quote.</p>
    <dl class="m-contact-info">
      <dt>Email</dt><dd><a href="mailto:<?= h($c['email']) ?>"><?= h($c['email']) ?></a></dd>
      <dt>Based in</dt><dd><?= h($c['location']) ?></dd>
      <dt>Serving</dt><dd>Local Maryland businesses and remote clients across the U.S.</dd>
    </dl>
    <div class="m-card m-tip"><strong>Just need a website?</strong> <a href="<?= h(base_url('register.php')) ?>">Build it yourself in minutes</a> with our AI website builder. It's free to start.</div>
  </div>

  <div class="m-card m-form-card">
    <?php if ($sent): ?>
      <h2>Thanks, your request is in!</h2>
      <p>We'll reply within one business day. A confirmation is on its way to your inbox.</p>
      <a class="btn btn-ghost" href="<?= h(base_url('')) ?>">Back to home</a>
    <?php else: ?>
      <?php if (isset($errors['form'])): ?><p class="error"><?= h($errors['form']) ?></p><?php elseif ($errors): ?><p class="error">Please fix the highlighted fields.</p><?php endif; ?>
      <form method="post" novalidate>
        <?= csrf_field() ?>
        <input type="text" name="_hp" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
        <div class="form-2">
          <label>Your name * <input name="name" required maxlength="120" value="<?= h($v['name']) ?>" autocomplete="name"><?= $err('name') ?></label>
          <label>Business <input name="business" maxlength="160" value="<?= h($v['business']) ?>" autocomplete="organization"></label>
          <label>Email * <input type="email" name="email" required maxlength="200" value="<?= h($v['email']) ?>" autocomplete="email"><?= $err('email') ?></label>
          <label>Phone <input type="tel" name="phone" maxlength="40" value="<?= h($v['phone']) ?>" autocomplete="tel"></label>
          <label>What do you need? *
            <select name="service" required>
              <option value="">Choose one…</option>
              <?php foreach (INQUIRY_SERVICES as $s): ?><option <?= $v['service'] === $s ? 'selected' : '' ?>><?= h($s) ?></option><?php endforeach; ?>
            </select><?= $err('service') ?>
          </label>
          <label>Budget <input name="budget" maxlength="80" value="<?= h($v['budget']) ?>" placeholder="Optional"></label>
        </div>
        <label>Tell us about the project * <textarea name="message" rows="6" required maxlength="5000"><?= h($v['message']) ?></textarea><?= $err('message') ?></label>
        <button class="btn btn-lg btn-accent btn-block">Send request</button>
      </form>
    <?php endif; ?>
  </div>
</div>
<?php page_footer();
