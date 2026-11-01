<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

// TEMPLATE: have a lawyer review this before launch and fill in the bracketed details.
$company = (string) cfg('company_name', 'Rowan Copy');
$contact = (string) cfg('support_email', '[support email]');
page_header('Terms of Service');
?>
<div class="page narrow legal">
  <h1>Terms of Service</h1>
  <p class="muted small">Last updated: [date]</p>

  <p>These terms are an agreement between you and <?= h($company) ?> ("we", "us") about your use of Rowan Copy, a service for creating and hosting websites with the help of AI. By creating an account you agree to these terms.</p>

  <h2>Your account</h2>
  <p>You must give accurate information, keep your password private, and be at least [18] years old. You are responsible for everything that happens under your account.</p>

  <h2>Your content</h2>
  <p>You own the text, images and other material you add to your websites. You give us permission to store, display and process that material so we can run the service. Websites are designed with the help of AI; you are responsible for reviewing your site and making sure everything on it is accurate and that you have the right to publish it.</p>

  <h2>What you may not do</h2>
  <ul>
    <li>Publish anything illegal, fraudulent, deceptive, hateful, or that infringes someone else's rights.</li>
    <li>Impersonate another person or business, or collect passwords or payment details under false pretenses (phishing).</li>
    <li>Send spam, distribute malware, or try to break, overload or get around the limits of the service.</li>
  </ul>
  <p>We may remove content or suspend accounts that break these rules.</p>

  <h2>Messages from your visitors</h2>
  <p>When visitors use a form on your site, we store their messages for you. You are responsible for handling that information lawfully.</p>

  <h2>Service availability and changes</h2>
  <p>We work to keep Rowan Copy running but don't guarantee it will always be available or error-free. We may change or discontinue features, and we will give reasonable notice of major changes.</p>

  <h2>Fees</h2>
  <p>[Describe free plan limits, paid plans, billing and refunds here.]</p>

  <h2>Ending your account</h2>
  <p>You can delete your account at any time from the Account page, which removes your websites. We may end accounts that break these terms.</p>

  <h2>Liability</h2>
  <p>To the extent the law allows, the service is provided "as is", and our total liability to you is limited to [the amount you paid us in the last 12 months].</p>

  <h2>Governing law</h2>
  <p>These terms are governed by the laws of [state/country].</p>

  <h2>Contact</h2>
  <p>Questions or reports about content: <?= h($contact) ?></p>
</div>
<?php page_footer();
