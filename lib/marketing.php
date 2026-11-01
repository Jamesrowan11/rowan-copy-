<?php
// ============================================================================
// ROWAN COPY: PUBLIC WEBSITE CONTENT
// Company details and the copywriting services menu shown on the public pages.
// Edit the text here; company details can also be set in config.php.
// ============================================================================

declare(strict_types=1);

function company(): array
{
    return [
        'name' => (string) cfg('company_name', 'Rowan Copy'),
        'tagline' => (string) cfg('tagline', 'Clean copy for small businesses'),
        'owner' => (string) cfg('owner_name', 'Landen Rowan'),
        'email' => (string) cfg('contact_email', 'landen@rowancopy.com'),
        'location' => (string) cfg('location', 'Howard County, Maryland'),
    ];
}

/** Copywriting services (one-time projects). Shown on Home, Services and Pricing, and in the quote form. */
const SERVICES = [
    ['name' => 'Website copy', 'price' => 'from $200/page',
        'blurb' => 'Clear, persuasive pages that sound like you and tell visitors exactly what to do next.',
        'details' => ['$200 per page', '$500 for a full 4-page site']],
    ['name' => 'Policy & agreement packages', 'price' => 'from $300',
        'blurb' => 'Privacy policies, terms of service, customer waivers, and service agreements in plain, readable language.',
        'details' => ['Privacy policy', 'Terms of service', 'Waivers & service agreements']],
    ['name' => 'Social media caption batches', 'price' => '$150 for 15',
        'blurb' => 'A month of captions written in your voice, ready to schedule and post.',
        'details' => ['$150 for 15 captions', '$250 for 30 captions']],
    ['name' => 'Marketing & business emails', 'price' => 'from $75 per email',
        'blurb' => 'Announcements, newsletters, and promos that get opened and actually read.',
        'details' => ['$75 per email', 'Sequences quoted as a batch']],
    ['name' => 'Business listing descriptions', 'price' => 'Quoted per listing',
        'blurb' => 'Google, Yelp, and directory descriptions that help the right people find you.',
        'details' => ['Google Business Profile', 'Yelp & directories']],
    ['name' => 'Websites, hosting & email', 'price' => 'from $15/month',
        'blurb' => 'Build your site with our AI website builder, or let us build it. Hosting, your domain, and business email handled so you never think about it.',
        'details' => ['AI website builder', 'Your own domain', 'Business email accounts', 'Billed monthly or yearly']],
];

const INQUIRY_SERVICES = ['Website copy', 'Policy & agreement package', 'Social media caption batch', 'Marketing/business email',
    'Business listing description', 'Website built for me', 'Website hosting & email', 'Other'];

const PUBLIC_NAV = ['services.php' => 'Services', 'work.php' => 'Work', 'about.php' => 'About', 'pricing.php' => 'Pricing', 'contact.php' => 'Contact'];
