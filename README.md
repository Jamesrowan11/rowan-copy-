# Rowan Copy

An AI website builder for small businesses. Customers create an account, describe their business in plain English, and Claude designs their website. They refine it by asking for changes ("make the header darker", "add a pricing section"), upload their own photos, publish with one click, roll back any change, and read messages from their site's contact form.

Built with plain PHP and SQLite, so it runs on ordinary cPanel / GoDaddy shared hosting. No separate database server is needed.

## What customers can do

| Feature | Where |
|---|---|
| Sign up, log in, change password, delete account | `register.php`, `login.php`, `account.php` |
| Create up to 10 websites by describing them | `dashboard.php` |
| Chat-style AI editing with a live preview (desktop and phone views) | `editor.php` |
| Publish / take offline; drafts don't affect the live site until published | Editor → Publish |
| Full version history with one-click restore | Editor → History |
| Upload logo and photos for the AI to use | Editor → Images |
| Change the site name and web address | Editor → Settings |
| Contact-form inbox, with optional email alerts | `inbox.php` |

Published sites live at `https://your-domain/s/<site-name>`.

As the owner, you get `admin.php`, which shows all customers, sites and this month's AI token usage.

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

- `monthly_ai_limit` in `config.php` caps how many designs and edits each customer can run per month (default 40).
- Each customer can make at most 3 AI requests per minute and have at most 10 sites.
- `effort` (`low` / `medium` / `high`) trades design quality for speed and cost. `medium` is a good default.
- `admin.php` shows total tokens used this month. Your exact charges are on the Claude Console billing page. Set a monthly spend limit there too.

## Security notes

- Customer websites are served with a `Content-Security-Policy: sandbox` header and previewed in a sandboxed iframe. Any script on a customer page runs in an isolated origin and cannot read Rowan Copy cookies or act as a logged-in user.
- Passwords are hashed with PHP's `password_hash`. All forms use CSRF tokens, and login and sign-up are rate limited.
- Uploads must be real JPG, PNG, GIF or WebP images (checked by content). They get random file names and are stored in `uploads/`, where `.htaccess` blocks any script from running.
- `config.php`, `lib/`, `vendor/` and dotfiles are blocked from the web by `.htaccess`, and `config.php` is git-ignored.

## Not built yet (good next steps)

- Password reset by email
- Paid plans and billing (for example Stripe), tied to `monthly_ai_limit`
- Custom domains for customer sites (e.g. `mybakery.com`)
- Multi-page sites (each site is currently one page with sections)
- Terms of service and an abuse-reporting process for customer content
