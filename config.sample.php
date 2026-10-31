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

    // Cost protection: the most AI generations or edits each customer can run per month.
    'monthly_ai_limit' => 40,

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
