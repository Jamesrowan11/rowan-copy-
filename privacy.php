<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

// TEMPLATE: have a lawyer review this before launch and fill in the bracketed details.
$company = (string) cfg('company_name', 'Rowan Copy');
$contact = (string) cfg('support_email', '[support email]');
page_header('Privacy Policy');
?>
<div class="page narrow legal">
  <h1>Privacy Policy</h1>
  <p class="muted small">Last updated: [date]</p>

  <p>This policy explains what information <?= h($company) ?> collects when you use Rowan Copy and how we use it.</p>

  <h2>What we collect</h2>
  <ul>
    <li><strong>Account details:</strong> your name, email address and a scrambled (hashed) version of your password.</li>
    <li><strong>Your websites:</strong> the descriptions you write, the change requests you make, the pages we generate, and images you upload.</li>
    <li><strong>Visitor messages:</strong> what visitors type into forms on your sites, plus their IP address for spam prevention.</li>
    <li><strong>Usage:</strong> daily visit counts for each site (no cookies, no personal visitor profiles), and records of AI requests for billing and limits.</li>
  </ul>

  <h2>How we use it</h2>
  <p>To run the service: create and host your websites, send you account emails (like password resets and new-message alerts), prevent abuse, and keep track of usage limits.</p>

  <h2>AI processing</h2>
  <p>To design your website, we send your business description, change requests, and your current page to our AI provider, Anthropic, which processes it to generate your site. [Describe your provider agreement and data retention terms here.]</p>

  <h2>Sharing</h2>
  <p>We don't sell your information. We share it only with service providers that help us run Rowan Copy (such as hosting and AI processing), or when required by law.</p>

  <h2>Keeping and deleting data</h2>
  <p>We keep your information while your account is open. Deleting your account from the Account page removes your websites, images and visitor messages. [Describe backup retention here.]</p>

  <h2>Cookies</h2>
  <p>Rowan Copy uses one essential cookie to keep you logged in. Published customer websites built with Rowan Copy don't set cookies from us.</p>

  <h2>Your rights</h2>
  <p>You can view and update your details on the Account page, or contact us to ask for a copy of your data or its deletion.</p>

  <h2>Contact</h2>
  <p><?= h($contact) ?></p>
</div>
<?php page_footer();
