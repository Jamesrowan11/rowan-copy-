# Rowan Copy

An AI website builder for small businesses. Customers create an account, describe their business in plain English, and Claude designs their website. They refine it by asking for changes ("make the header darker", "add a pricing section"), upload their own photos, publish with one click, roll back any change, and read messages from their site's contact form.

Built with plain PHP and SQLite, so it runs on ordinary cPanel / GoDaddy shared hosting. No separate database server is needed.

## The public website (built with Lovable)

The marketing site (Home, Services, Work, About, Pricing, Contact) is designed in Lovable, with scroll-driven animation, and served from your own server as plain HTML files:

- `lovable-site/` is the site's source code, copied from the Lovable project.
- `site/` is the built site that visitors see. It's committed to Git, so the web server never needs Node.js.
- `.htaccess` serves `site/` for `/`, `/services`, `/work`, `/about`, `/pricing` and `/contact`. If `site/` is missing, the built-in PHP pages below are used instead.
- The site's Contact form posts to `api/inquiry.php` (saved to **Admin → Quote requests** and emailed), and Pricing reads live plans from `api/plans.php`.

**Changing the design:** edit it in Lovable, then rebuild on any computer with Node.js 20+ (copy the changed files from Lovable into `lovable-site/` first):
```bash
./build-site.sh
```
Commit `lovable-site/` and `site/`, then pull on the server as usual.

### Built-in PHP pages (fallback)

`index.php` (Home), `services.php`, `work.php`, `about.php`, `pricing.php` and `contact.php` are the Rowan Copy studio website, brought over from the old Node.js site: copywriting services, website plans, and a **Get a quote** form. Quote requests are saved and emailed to `contact_email`, the person gets a confirmation email, and staff work through them on **Admin → Quote requests**.

- Company details (name, tagline, owner, location, contact email) are in `config.php`.
- The copywriting services menu and prices are in `lib/marketing.php`.
- The Work page case studies are placeholders marked with [brackets] in `work.php`. Replace them with real samples.

## Team: admins and employees

Add staff on **Admin → Team**. Each person gets an email invitation to set their password, and you can create their `@rowancopy.com` email account in Plesk at the same time.

| | Admin | Employee |
|---|---|---|
| See customers, sites and quote requests | ✓ | ✓ |
| Send customers password reset links, confirm emails | ✓ | ✓ (customers only, never staff) |
| Manage email accounts and DNS for any domain on the server (Hosting) | ✓ | ✓ |
| Set plans and AI limits, suspend customers, take down sites | ✓ | |
| Link Plesk domains to customers | ✓ | |
| Add, change or remove team members | ✓ | |

Emails in `admin_emails` in `config.php` are owner accounts: always admins, and they can't be removed from the Team page, so you can never lock yourself out. Removing someone from the team logs them out immediately; they keep a normal customer account.

## What customers can do

| Feature | Where |
|---|---|
| Sign up, log in, change password or email, delete account | `register.php`, `login.php`, `account.php` |
| Forgot-password emails with one-hour, single-use reset links | `forgot.php`, `reset.php` |
| Email confirmation (required before publishing, when email is set up) | `verify.php` |
| Create up to 10 websites by describing them | `dashboard.php` |
| Chat-style AI editing with a live preview (desktop and phone views) | `editor.php` |
| Publish / take offline; drafts don't affect the live site until published | Editor → Publish |
| Full version history with one-click restore | Editor → History |
| Upload logo and photos for the AI to use | Editor → Images |
| Change the site name and web address | Editor → Settings |
| Connect their own domain (e.g. `mybakery.com`) | Editor → Settings |
| Download the site as an HTML file, duplicate a site, edit the code by hand | Editor → Settings → Tools |
| Visitor counts (today / 7 days / 30 days), no cookies | Editor → Visitors |
| Contact-form inbox with email alerts, mark unread, spreadsheet (CSV) download | `inbox.php` |
| Email accounts on their hosted domain: create, change password, delete, webmail and phone settings | `domain.php` |
| DNS records on their hosted domain (A, AAAA, CNAME, MX, TXT) | `domain.php` |
| Subscribe to a plan, update card, see invoices, switch or cancel (Stripe) | `billing.php` |

Published sites live at `https://your-domain/s/<site-name>`.

As the owner, you get `admin.php`. It shows all customers, sites, visits and this month's AI token usage, and lets you:
- suspend or restore a customer (their sites go offline while suspended)
- take down or restore a single site
- raise or lower one customer's monthly AI limit
- mark an email as confirmed
- create a password reset link to send to a customer by hand
- see which custom domains you still need to connect

Starter **Terms of Service** and **Privacy Policy** pages are at `terms.php` and `privacy.php`. They are templates: fill in the bracketed parts and have a lawyer review them before launch.

## Setup on Plesk (Ubuntu)

Replace `rowancopy.com` below with your domain.

1. **Add the domain:** Websites & Domains → Add Domain. Document root: `httpdocs`.
2. **PHP:** on the domain, open **PHP** (PHP Settings). Choose **PHP 8.3** (8.1 or newer works), handler **"FPM application served by Apache"**, and set `max_execution_time` to `600` and `upload_max_filesize` / `post_max_size` to `10M`. Click OK.
3. **SSL:** **SSL/TLS Certificates** → install a free Let's Encrypt certificate. Then in **Hosting Settings**, tick **Permanent SEO-safe 301 redirect from HTTP to HTTPS**.
4. **Get the code.** Either:
   - **Git extension:** **Git** → Remote repository → `https://github.com/jamesrowan11/rowan-copy-.git` (a private repo needs the SSH URL plus the deploy key Plesk shows you, added in GitHub → Settings → Deploy keys). Pick the branch to deploy and set the deployment path to `/httpdocs`.
   - **Or SSH** as root (the folder must be empty: delete Plesk's default `index.html` and its other placeholder files first):
     ```bash
     cd /var/www/vhosts/rowancopy.com/httpdocs
     git clone https://github.com/jamesrowan11/rowan-copy-.git .
     ```
5. **Install the PHP libraries** (SSH as root):
   ```bash
   cd /var/www/vhosts/rowancopy.com/httpdocs
   /opt/plesk/php/8.3/bin/php /usr/local/bin/composer install --no-dev --optimize-autoloader
   ```
   No `composer` yet? Install it first: `curl -sS https://getcomposer.org/installer | /opt/plesk/php/8.3/bin/php -- --install-dir=/usr/local/bin --filename=composer`.
   You can also use the **PHP Composer** extension in the Plesk panel instead.
6. **Config:**
   ```bash
   cp config.sample.php config.php
   nano config.php
   ```
   Set `base_url` (`https://rowancopy.com`), `anthropic_api_key`, `admin_emails`, `support_email`, `server_ip` (your server's public IP), and
   `'data_dir' => '/var/www/vhosts/rowancopy.com/private/rowancopy'` (Plesk's `private` folder is outside the public web root).

   **Email:** in Plesk → **Mail**, create a mailbox such as `noreply@rowancopy.com`, then set `'mail_from' => 'noreply@rowancopy.com'`. Password resets, email confirmations and new-message alerts all use it. Until it's set, email is off and customers can publish without confirming their email. To keep emails out of spam, turn on DKIM for the domain (Mail → Mail Settings) and make sure the domain's DNS has SPF and DMARC records. Plesk adds these automatically when it manages your DNS.
7. **File ownership.** If you used SSH as root, give the files to the domain's system user so PHP can write uploads and the database. The user is shown under **Hosting Settings → System user**:
   ```bash
   chown -R THE_SYSTEM_USER:psacln /var/www/vhosts/rowancopy.com/httpdocs
   mkdir -p /var/www/vhosts/rowancopy.com/private/rowancopy
   chown -R THE_SYSTEM_USER:psacln /var/www/vhosts/rowancopy.com/private/rowancopy
   chmod 700 /var/www/vhosts/rowancopy.com/private/rowancopy
   ```
8. **nginx directives.** Plesk puts nginx in front of Apache, and nginx serves static files itself, skipping `.htaccess`. Under **Apache & nginx Settings → Additional nginx directives**, paste:
   ```nginx
   location ~ ^/(vendor|lib|lovable-site)/ { deny all; }
   location ~ \.sh$ { deny all; }
   location ~ ^/(config\.php|config\.sample\.php|composer\.(json|lock)|README\.md)$ { deny all; }
   location ~ /\.(?!well-known) { deny all; }
   proxy_read_timeout 600s;
   ```
   If Plesk rejects the last line as a duplicate, delete just that line and save again.
   Leave **Proxy mode** on so `.htaccess` (pretty `/s/site-name` links, upload protection) keeps working.
9. Open `https://rowancopy.com`, create your account (use the email you put in `admin_emails`), and build a test site.

**Connecting a customer's own domain.** When a customer adds a domain in their site settings, it shows up on `admin.php` under "Custom domains to connect". Once the customer has pointed the domain's DNS at your server:
1. In Plesk, open the Rowan Copy domain → **Domain Aliases** → **Add Domain Alias**, enter the customer's domain (e.g. `joesplumbing.com`, with "www" included), and untick mail service.
2. Open **SSL/TLS Certificates** for the Rowan Copy domain and reissue the Let's Encrypt certificate with the alias included.
Visitors to that domain then see the customer's published site.

Updating later: `git pull` (or **Pull Updates** in the Git extension), then rerun the `composer install` command.

Back up `/var/www/vhosts/rowancopy.com/private/rowancopy` (the database) and `httpdocs/uploads` (customer images). Plesk's Backup Manager covers both.

## Connecting Plesk (customer email and DNS)

The portal manages Plesk through Plesk's own management API, using a key that only works from the server itself.

1. On the server (SSH as root), create the key:
   ```bash
   plesk bin secret_key -c -ip-address 127.0.0.1 -description "Rowan Copy portal"
   ```
   It prints a long key. Put it in `config.php` under `'plesk' => ['key' => '...']`. Treat it like a password: it can change anything in Plesk.
2. Open **Admin → Hosting customers (Plesk)**. It should say "Connected to Plesk" and list every domain on the server.
3. For each existing customer's domain, enter their email (and name) and click **Link**:
   - If they have no portal account yet, one is created and they're emailed an invitation to set a password (the link works for 7 days). If email is off, the page shows the invite link for you to send.
   - If they already have an account, the domain simply appears on their dashboard.
4. The customer can now manage that domain's email accounts and DNS. They can only see domains you've linked to them. NS and SOA records can't be changed from the portal, so a customer can't take their domain offline.

Unlinking a domain only removes it from the portal. Nothing changes in Plesk.

## Stripe (plans and payments)

1. **Products:** in the Stripe Dashboard → **Product catalog**, create a product for each paid plan (Starter, Business, Pro). Give each one **two recurring prices**: monthly ($15 / $30 / $69) and yearly ($150 / $300 / $690). Copy each price's ID (`price_...`) into `'plans'` in `config.php`: monthly into `stripe_price`, yearly into `stripe_price_yearly`. Plan names, displayed prices, limits (AI edits, sites, email accounts, DNS) and feature lists are all set there. The Billing page shows a Monthly/Yearly switch whenever at least one yearly price is filled in.
2. **API key:** Developers → API keys → copy the **Secret key** into `'stripe' => ['secret_key' => ...]`. Start with your **test mode** key (`sk_test_...`) and test card `4242 4242 4242 4242`, then switch to the live key.
3. **Webhook:** Developers → Webhooks → **Add endpoint** `https://rowancopy.com/stripe-webhook.php` with these events:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
   Copy its **Signing secret** (`whsec_...`) into `'webhook_secret'`.
4. **Customer portal:** Settings → Billing → **Customer portal**: turn it on, allow customers to update payment methods, view invoices and cancel, and allow switching plans with all three products and both of their prices added, so customers can upgrade, downgrade, or move between monthly and yearly.

How it works:
- Customers pick a plan on **Billing** and pay on Stripe's secure checkout page. Their plan switches on as soon as they return.
- Renewals, plan changes, failed payments and cancellations come in through the webhook. A failed payment emails the customer and shows a warning in their dashboard. When a subscription ends, they move back to Free; their sites stay online, but they can't add sites beyond the Free limit.
- On **Admin → Customers**, you can set any customer's plan by hand (for customers you bill some other way). Stripe never charges for a plan you set there.
- Every existing account starts on the **Free** plan, so set your current customers' plans on the Admin page after updating.

## Setup on cPanel

1. **Create a subdomain or domain** for the app (for example `rowancopy.com` or `app.rowancopy.com`) and note its document root folder.
2. **Upload this repository** into that folder (cPanel → Git Version Control can clone it directly).
3. **Install the PHP libraries.** In cPanel → Terminal, `cd` into the folder and run:
   ```bash
   composer install --no-dev --optimize-autoloader
   ```
4. **Create your config:**
   ```bash
   cp config.sample.php config.php
   ```
   Edit `config.php` and set:
   - `base_url` to your app's address, such as `https://rowancopy.com`
   - `anthropic_api_key` to your Claude API key
   - `admin_emails` to your own email, so you can open `admin.php`
5. **PHP version:** in cPanel → MultiPHP Manager, choose **PHP 8.1 or newer**. Make sure the `pdo_sqlite`, `curl` and `mbstring` extensions are on (cPanel → Select PHP Version → Extensions).
6. **Turn on SSL** (cPanel → SSL/TLS Status → Run AutoSSL), then uncomment the "Force HTTPS" lines in `.htaccess`.
7. Visit your domain, create an account, and build a test site.

The database is created automatically on first visit in `data_dir`. By default that's a `rowancopy_data` folder one level above the app, outside the public web folder. Back that folder up along with `uploads/`.

## Costs and limits

Every design or edit is one Claude API call. To protect your API bill:

- Each plan in `config.php` sets how many designs and edits a customer can run per month (`ai_limit`) and how many sites they can have (`max_sites`). You can override the AI limit for one customer on the Admin page.
- Each customer can make at most 3 AI requests per minute.
- `effort` (`low` / `medium` / `high`) trades design quality for speed and cost. `medium` is a good default.
- `admin.php` shows total tokens used this month. Your exact charges are on the Claude Console billing page. Set a monthly spend limit there too.

## Security notes

- Customer websites are served with a `Content-Security-Policy: sandbox` header and previewed in a sandboxed iframe. Any script on a customer page runs in an isolated origin and cannot read Rowan Copy cookies or act as a logged-in user.
- Passwords are hashed with PHP's `password_hash`. All forms use CSRF tokens, and login and sign-up are rate limited.
- Uploads must be real JPG, PNG, GIF or WebP images (checked by content). They get random file names and are stored in `uploads/`, where `.htaccess` blocks any script from running.
- `config.php`, `lib/`, `vendor/` and dotfiles are blocked from the web by `.htaccess`, and `config.php` is git-ignored.

## Not built yet (good next steps)

- Multi-page sites (each site is currently one page with sections)
- Automatic SSL for customer domains (today you add each one as a Plesk domain alias)
- Two-factor login
