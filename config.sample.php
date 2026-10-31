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

    // Optional: email customers when their contact form gets a message.
    // Use an address on your own domain (for example noreply@rowancopy.com). Leave empty to turn off.
    'notify_email_from' => '',

    // Emails listed here can open admin.php and see every customer and site.
    'admin_emails' => [
        // 'you@example.com',
    ],
];
