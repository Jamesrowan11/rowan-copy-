<?php
// ============================================================================
// ROWAN COPY: CONFIGURATION
// ============================================================================
// Copy this file to config.php and fill in your values.
// config.php is git-ignored so your API key never ends up in the repository.
// ============================================================================

return [
    // Public URL of this app, no trailing slash.
    'base_url' => 'https://rowancopy.com',

    // Your Claude API key from https://platform.claude.com.
    // You can leave this empty and set the ANTHROPIC_API_KEY environment variable instead.
    'anthropic_api_key' => '',

    // Model used to design websites, and how hard it thinks.
    // effort: 'low' | 'medium' | 'high'. Higher means better designs but slower and more expensive.
    'model'  => 'claude-opus-5-5',
    'effort' => 'medium',

    // Where the SQLite database and other private data live.
    // This MUST be outside public_html so nobody can download it.
    // The default is one folder above this app: /home/<account>/rowancopy_data
    'data_dir' => dirname(__DIR__) . '/rowancopy_data',

    // --- Plans -----------------------------------------------------------------
    // What each plan includes. Customers subscribe on the Billing page through Stripe.
    // For each paid plan, create a Product with a monthly Price in Stripe
    // (Dashboard -> Product catalog) and paste the Price ID (price_...) below.
    // Change names, prices and limits to suit you; 'free' must always exist.
    'plans' => [
        'free' => [
            'name' => 'Free', 'price' => '$0', 'stripe_price' => '',
            'ai_limit' => 10, 'max_sites' => 1, 'custom_domain' => false, 'remove_badge' => false,
            'features' => ['1 website', '10 AI designs or edits a month', 'Free rowancopy.com web address'],
        ],
        'starter' => [
            'name' => 'Starter', 'price' => '$15/month', 'stripe_price' => '',
            'ai_limit' => 60, 'max_sites' => 3, 'custom_domain' => true, 'remove_badge' => true,
            'features' => ['3 websites', '60 AI designs or edits a month', 'Use your own domain', 'No Rowan Copy badge'],
        ],
        'business' => [
            'name' => 'Business', 'price' => '$30/month', 'stripe_price' => '',
            'ai_limit' => 200, 'max_sites' => 10, 'custom_domain' => true, 'remove_badge' => true,
            'features' => ['10 websites', '200 AI designs or edits a month', 'Your own domain', 'Email accounts and DNS managed in your portal', 'Priority support'],
        ],
    ],

    // --- Stripe ----------------------------------------------------------------
    // Dashboard -> Developers -> API keys: the Secret key (sk_live_... or sk_test_...).
    // Webhook secret (whsec_...): Dashboard -> Developers -> Webhooks -> add endpoint
    // https://rowancopy.com/stripe-webhook.php (see the README for which events).
    'stripe' => [
        'secret_key' => '',
        'webhook_secret' => '',
    ],

    // --- Plesk -----------------------------------------------------------------
    // Lets customers manage email accounts and DNS for domains you host.
    // Create the key on the server with:
    //   plesk bin secret_key -c -ip-address 127.0.0.1 -description "Rowan Copy portal"
    'plesk' => [
        'url' => 'https://127.0.0.1:8443',
        'key' => '',
        // 127.0.0.1 uses Plesk's self-signed certificate, so don't verify it.
        // If you point 'url' at a real hostname, set this to true.
        'verify_tls' => false,
    ],

    // Set to false to close sign-ups (existing customers can still log in).
    'allow_signups' => true,

    // --- Email -----------------------------------------------------------------
    // The address Rowan Copy sends from: password resets, email confirmations and
    // new-message alerts. Use an address on your own domain (e.g. noreply@rowancopy.com)
    // that exists in Plesk -> Mail. Leave empty to turn all email off.
    'mail_from' => '',

    // Require customers to confirm their email before they can publish a site.
    // (Only applies when mail_from is set.)
    'require_email_verification' => true,

    // --- Your business --------------------------------------------------------
    'company_name'  => 'Rowan Copy',
    'support_email' => 'support@rowancopy.com',

    // Show a small "Made with Rowan Copy" link in the corner of published sites.
    'show_badge' => true,

    // Your server's public IP address. Shown to customers connecting their own domain.
    'server_ip' => '',

    // Emails listed here can open admin.php and see every customer and site.
    'admin_emails' => [
        // 'you@example.com',
    ],
];
