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

const PUBLIC_NAV = ['services' => 'Services', 'work' => 'Work', 'about' => 'About', 'pricing' => 'Pricing', 'contact' => 'Contact'];

/** True when the Lovable-built marketing site has been copied into site/. */
function lovable_site_installed(): bool
{
    return is_file(RC_ROOT . '/site/index.html');
}

function serve_lovable_site(): never
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache');
    readfile(RC_ROOT . '/site/index.html');
    exit;
}

/**
 * Validate and save a quote request, then email the studio and the sender.
 * Used by contact.php and by the Lovable site through api/inquiry.php.
 * @param array<string,string> $v name, business, email, phone, service, budget, message
 * @return array<string,string> field => error message (empty when saved)
 */
function save_inquiry(array $v): array
{
    $errors = [];
    if (!throttle('inquiry:' . client_ip(), 5, 3600)) {
        return ['form' => 'You\'ve sent several requests already. Please email us instead.'];
    }
    if ($v['name'] === '') {
        $errors['name'] = 'Please enter your name.';
    }
    if (!filter_var($v['email'], FILTER_VALIDATE_EMAIL)) {
        $errors['email'] = 'Please enter a valid email.';
    }
    if (!in_array($v['service'], INQUIRY_SERVICES, true)) {
        $errors['service'] = 'Please choose what you need.';
    }
    if ($v['message'] === '') {
        $errors['message'] = 'Please tell us a bit about the project.';
    }
    if ($errors) {
        return $errors;
    }
    $c = company();
    db()->prepare('INSERT INTO inquiries (name, business, email, phone, service, budget, message, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$v['name'], $v['business'], strtolower($v['email']), $v['phone'], $v['service'], $v['budget'], $v['message'], client_ip()]);
    send_email($c['email'], "New quote request: {$v['service']} from {$v['name']}",
        "Name: {$v['name']}\nBusiness: {$v['business']}\nEmail: {$v['email']}\nPhone: {$v['phone']}\nService: {$v['service']}\nBudget: {$v['budget']}\n\n{$v['message']}\n\n"
        . 'See all requests: ' . base_url('admin-inquiries.php') . "\n");
    send_email($v['email'], "We got your request, {$v['name']}",
        "Hi {$v['name']},\n\nThanks for reaching out to {$c['name']}. We received your request for {$v['service']} and will reply within one business day with a quote, a timeline, and any questions.\n\n"
        . "If you'd like to get started on a website right away, you can build one yourself here: " . base_url('register.php') . "\n\n{$c['owner']}\n{$c['name']}\n{$c['email']}\n");
    return [];
}

/** Read and trim the quote-request fields from an array (POST data or JSON). */
function inquiry_fields(array $in): array
{
    $v = [];
    foreach (['name' => 120, 'business' => 160, 'email' => 200, 'phone' => 40, 'service' => 60, 'budget' => 80, 'message' => 5000] as $k => $max) {
        $v[$k] = is_string($in[$k] ?? null) ? mb_substr(trim($in[$k]), 0, $max) : '';
    }
    return $v;
}
