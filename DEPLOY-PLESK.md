# Deploying Rowan Copy on Plesk (Ubuntu, AWS)

This guide runs the app on an **Ubuntu** server with **Plesk**, on **AWS EC2**,
using the Plesk **Node.js extension (Phusion Passenger)** and **PostgreSQL**. The
app is built with `output: 'standalone'` and started by `server.js`, which
Passenger runs.

> Prerequisites: an EC2 **Ubuntu** instance with **Plesk** installed (Plesk
> Obsidian supports Ubuntu 20.04/22.04), the **Node.js** and **PostgreSQL** Plesk
> extensions installed, and the domain `rowancopy.com` added in Plesk.
>
> In the EC2 **Security Group**, allow inbound **80**, **443**, and **8443**
> (Plesk panel) — restrict 8443/22 to your own IP.

---

## 1. Create the PostgreSQL database

1. Plesk → **Databases** → **Add Database**.
2. Type: **PostgreSQL**. Name it e.g. `rowancopy`.
3. Add a database user (e.g. `rowancopy_user`) with a strong password and grant
   it access to the database.
4. On the same server the host/port is usually `127.0.0.1:5432`.

> If the PostgreSQL extension isn't installed yet: Plesk → **Extensions** →
> install **PostgreSQL**. (On Ubuntu you can alternatively
> `sudo apt install postgresql` and manage it yourself, but the Plesk extension
> keeps it in the panel.)

Your connection string will be:

```
postgresql://rowancopy_user:PASSWORD@127.0.0.1:5432/rowancopy?schema=public
```

---

## 2. Get the code onto the server

Use Plesk → **Git**, or clone over SSH. Put the app in the domain's directory,
e.g. `/var/www/vhosts/rowancopy.com/app`.

```bash
cd /var/www/vhosts/rowancopy.com
git clone <your-repo-url> app
```

---

## 3. Configure the Node.js application in Plesk

Plesk → your domain → **Node.js** → **Enable Node.js**, then set:

| Field                        | Value                                                            |
| ---------------------------- | ---------------------------------------------------------------- |
| **Node.js version**          | 20.x or 22.x (LTS)                                               |
| **Application Mode**         | `production`                                                     |
| **Application Root**         | `/var/www/vhosts/rowancopy.com/app` (the folder with `package.json`) |
| **Application URL**          | `https://rowancopy.com`                                          |
| **Application Startup File** | `server.js`                                                      |
| **Document Root**            | `app/.next/standalone/public` (any valid path works — Passenger serves the app for all routes) |

---

## 4. Set environment variables (Plesk Node.js UI)

In the **Node.js** panel, use **Custom environment variables**. Add:

| Name                     | Value                                                       |
| ------------------------ | ---------------------------------------------------------- |
| `DATABASE_URL`           | `postgresql://rowancopy_user:PASSWORD@127.0.0.1:5432/rowancopy?schema=public` |
| `AUTH_SECRET`            | output of `openssl rand -base64 32`                        |
| `NEXTAUTH_URL`           | `https://rowancopy.com`                                    |
| `APP_URL`                | `https://rowancopy.com`                                    |
| `EMAIL_FROM`             | `Rowan Copy <info@rowancopy.com>`                          |
| `SMTP_HOST`              | `rowancopy.com` (your Plesk mail host) — see step 8        |
| `SMTP_PORT`              | `587`                                                       |
| `SMTP_USER`              | `info@rowancopy.com`                                        |
| `SMTP_PASS`              | the mailbox password                                       |
| `INBOUND_WEBHOOK_SECRET` | a long random string (required in production)              |
| `ANTHROPIC_API_KEY`      | Anthropic key for the Lead Generator (see §11)             |
| `NODE_ENV`               | `production`                                               |

> Email transport is chosen automatically: with `SMTP_HOST` set, the app sends
> through your Plesk mail server (step 8). Leave it blank and set
> `RESEND_API_KEY` instead to use Resend; leave both blank and emails are just
> logged to the console.
>
> `server.js` also auto-loads a `.env` file from the Application Root if you
> prefer to keep secrets in a file. Plesk env vars take precedence.

---

## 5. Install dependencies and build

From the **Node.js** panel use **NPM install**, then run the build — or over SSH:

```bash
cd /var/www/vhosts/rowancopy.com/app

# Install (runs `prisma generate` via postinstall)
npm install

# Build the standalone server (also copies static assets into .next/standalone)
npm run build
```

If the Plesk UI is your only option: click **NPM install**, then run `npm run
build` over SSH (or add it as a temporary "Run script").

---

## 6. Run migrations and seed

Over SSH, with the env vars exported (or rely on the app's `.env`):

```bash
cd /var/www/vhosts/rowancopy.com/app

# Apply the database schema
npx prisma migrate deploy

# Seed demo/admin data (optional in production — creates demo accounts).
npm run seed
```

> **Security:** the seed creates demo accounts with a known password. In
> production, either skip the seed and create your admin via a one-off script,
> or log in and change every seeded password immediately (Admin → Users).

---

## 7. Point the domain and enable SSL

1. In Route 53 (or your DNS), point `rowancopy.com` (and `www`) at the server's
   **Elastic IP** with **A records**.
2. Plesk → your domain → **SSL/TLS Certificates** → install a free
   **Let's Encrypt** certificate. Include `www`, and enable
   **Redirect HTTP → HTTPS**.

The app's secure cookies require HTTPS in production — keep SSL active and
`NEXTAUTH_URL`/`APP_URL` on `https://`.

---

## 8. Email — Plesk mail server (send + receive)

The app both **sends** its automated email (auto-replies, status updates,
welcome emails, the portal's Compose Email, etc.) and lets you **receive** mail
at `info@rowancopy.com` — all through the Plesk mail server.

### 8a. Create the mailbox

1. Plesk → your domain → **Mail** → enable the mail service for the domain.
2. **Mail** → **Create Email Address** → `info@rowancopy.com`, set a password.
3. Make sure Plesk created the **MX record** for the domain pointing at this
   server (Plesk → **DNS Settings**). If your DNS is in Route 53, copy the same
   `MX` record there.
4. Read the inbox via Plesk **webmail** (`https://webmail.rowancopy.com`) or
   connect a mail client over **IMAP** (993) / **SMTP submission** (587).

### 8b. AWS-specific requirements (important for deliverability)

EC2 throttles/blocks outbound mail by default, and unknown IPs land in spam.
Do these three things:

1. **Remove the outbound port-25 block:** submit the AWS "Request to remove email
   sending limitations" form for your instance/Elastic IP (the mail server needs
   port 25 outbound to deliver to other servers).
2. **Reverse DNS (PTR):** in the same AWS request (or the EC2 console), set a
   **PTR record** on your **Elastic IP** to `rowancopy.com` (or `mail.rowancopy.com`).
   Receiving servers check this.
3. **Security Group:** allow inbound **25** (to receive mail) and, for your own
   mail clients, **587** and **993**.

### 8c. SPF / DKIM / DMARC

In Plesk → **Mail** → **Mail Settings**, enable **DKIM** and **SPF** for the
domain. Then add/confirm these DNS records (Plesk shows the exact values):

- **SPF** (`TXT` on `rowancopy.com`): `v=spf1 a mx ~all`
- **DKIM**: the `TXT` record Plesk generates (e.g. `default._domainkey`).
- **DMARC** (`TXT` on `_dmarc.rowancopy.com`): `v=DMARC1; p=none; rua=mailto:info@rowancopy.com`

These are what keep the studio's emails out of spam folders.

### 8d. Point the app at the mailbox

Set the SMTP env vars from step 4 (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`) and `EMAIL_FROM="Rowan Copy <info@rowancopy.com>"`, then **Restart
App**. Because the app sends *from* `info@rowancopy.com`, **client replies and
anything sent to `info@rowancopy.com` both land in that Plesk inbox.**

Verify from the portal: **Admin → Compose email** → send yourself a test. The
**Admin → Signature & settings** page shows the active mode (it should read
*SMTP / Plesk mail*), and **Sent email history** logs every send with status
`sent`.

> Tip: until port 25 / PTR / DKIM are sorted, you can leave `SMTP_HOST` blank and
> set `RESEND_API_KEY` to send via Resend while still **receiving** at the Plesk
> mailbox — the two are independent.

### 8e. Per-employee webmail in the portal

Beyond the system/automated mail above, **each employee gets a full inbox in the
portal** — read and send from their own `@rowancopy.com` mailbox (and shared
ones like `info@`), with their own signature.

1. In Plesk → **Mail**, create each person's mailbox (e.g. `mara@rowancopy.com`)
   and any shared ones (`info@rowancopy.com`).
2. (Optional) Set `MAIL_CRYPTO_SECRET` in the Node.js env vars to a long random
   string. Mailbox passwords are stored encrypted (AES-256-GCM); if you don't
   set this, the app derives the key from `AUTH_SECRET`. **Don't change this
   value later** without re-entering every mailbox password.
3. In the portal as an **admin**: **Mailboxes → Add mailbox** — enter the
   address, display name, owner (or mark it shared), the mail **host**
   (usually `rowancopy.com`), and IMAP/SMTP ports (defaults `993` / `587`).
4. Each **employee** then opens **Mail → settings**, enters their mailbox
   password (encrypted on save), sets their signature, and clicks **Test
   connection** to confirm IMAP + SMTP both work.

The app connects to the Plesk mail server over **IMAP (993)** to read and
**SMTP submission (587)** to send, authenticating as each mailbox — so messages
are sent authentically as that person and signed by your domain DKIM. Make sure
the **Security Group** allows the server to reach those ports (loopback if the
mail server is on the same box, which it is by default in Plesk).

---

## 9. Scheduled automations (recommended)

The app's scheduled automations — due-soon reminders to the team, overdue
alerts, monthly-plan renewal reminders, and the admin daily digest — all fire
from one endpoint. In Plesk → **Scheduled Tasks (cron)**, add a daily job (e.g.
7am):

```bash
curl -s "https://rowancopy.com/api/automations/run?secret=YOUR_INBOUND_WEBHOOK_SECRET" >/dev/null
```

Each automation can be toggled in the portal (Admin → Signature & settings →
Automations), and sends are deduped — running the task more often than daily
never double-emails anyone. Event automations (inquiry auto-replies, status
update emails, welcome emails, testimonial requests) fire instantly on their own
and don't need this job.

---

## 10. Deploying updates / restarting

```bash
cd /var/www/vhosts/rowancopy.com/app
git pull
npm install
npm run build
npx prisma migrate deploy   # only if the schema changed
```

Then restart the app — either:

- Plesk → **Node.js** → **Restart App**, or
- `touch tmp/restart.txt` in the Application Root (Passenger restarts on this):

```bash
mkdir -p tmp && touch tmp/restart.txt
```

---

## 11. Lead Generator (sample-site auto-deploy)

The Lead Generator researches a business with Claude, builds a sample one-page
site, and **deploys it live to a subdomain on this server** (`<label>.rowancopy.com`).

### 11a. Anthropic key

Add `ANTHROPIC_API_KEY` (from <https://console.anthropic.com>) to the Node.js
env vars (step 4). Without it, demos still queue but finish with an `Error`
status — nothing crashes.

### 11b. Wildcard DNS + SSL

So any generated subdomain resolves and gets HTTPS automatically:

1. In DNS, add a **wildcard A record** `*.rowancopy.com` → the server's Elastic IP.
2. In Plesk → your domain → **Hosting & DNS → DNS**, confirm the wildcard, and
   under **SSL/TLS** enable **"Keep websites secured"** (and a wildcard Let's
   Encrypt certificate) so new subdomains are served over HTTPS without manual steps.

### 11c. Scoped sudoers rule (least privilege)

The app shells out to `plesk bin` to manage subdomains, site aliases, and
mailboxes. Grant the Node app's OS user permission to run **only those
commands** as root — **not** full root. Find the app user (Plesk →
Subscriptions → your domain → shows the system user, e.g. `rowancopy`), then:

```bash
sudo visudo -f /etc/sudoers.d/rowancopy-leadgen
```

Add exactly (replace `rowancopy` with your subscription's system user):

```
# Allow the Rowan Copy app to manage ONLY Plesk subdomains, site aliases, and mailboxes.
rowancopy ALL=(root) NOPASSWD: /usr/sbin/plesk bin subdomain --create *, /usr/sbin/plesk bin subdomain --remove *, /usr/sbin/plesk bin subdomain --list, /usr/sbin/plesk bin site-alias --create *, /usr/sbin/plesk bin site-alias --remove *, /usr/sbin/plesk bin mail --create *, /usr/sbin/plesk bin mail --update *, /usr/sbin/plesk bin mail --remove *
```

The `site-alias --create` entry is for the **Go Live on Custom Domain** feature
(§11d); `site-alias --remove` and `subdomain --list` power the **Domains page**
(§11f), which lists subdomains and lets an admin detach a custom domain or add/
remove standalone subdomains.

The three `plesk bin mail` entries power **mailbox provisioning from the portal**
(§11e): create a real mail account, reset its password, and delete it — all from
Admin → Mailboxes / a mailbox's Mail settings, without opening Plesk Admin.

Verify the `plesk` path with `which plesk` (often `/usr/sbin/plesk` or
`/usr/local/psa/bin/...`); use the real absolute path in the rule. Confirm the
app user can write subdomain web roots under `DEMO_VHOST_ROOT`
(`/var/www/vhosts/rowancopy.com`) — by default the subscription user already
owns that tree.

> The generated subdomain label is slugified to `[a-z0-9-]` only, and the app
> invokes the command with `execFile` (no shell), so the fixed-argument call is
> not susceptible to shell injection. The sudoers rule still scopes it to just
> the whitelisted `plesk bin` actions as defense in depth. Mailbox addresses are
> validated against an email regex and passwords are passed as `execFile` args
> (no shell), so they can't break out of the argument vector either.

Deleting a demo in the portal ("Delete & tear down") runs
`plesk bin subdomain --remove`, so dead demos don't accumulate.

### 11d. Go Live on a custom domain

For a Ready demo, an admin can point a client's real domain at the demo's site:

1. The client adds an **A record** for their root domain (`@`) pointing to this
   server's IP — set `DEMO_SERVER_IP` (default `3.151.16.78`) to your server's
   real public IP. Recommend they also add a `www` A record (or CNAME to root).
2. In the portal (Admin → Lead generator → a Ready demo → **Go live on custom
   domain**), the admin runs a **pre-flight check**: the app does real DNS
   lookups and an AI explains, in plain English, exactly what (if anything) still
   needs fixing. **Go Live** is disabled until the root points here.
3. **Go Live** runs `plesk bin site-alias --create <domain> -domain
   <label>.rowancopy.com -www true`, aliasing the custom domain (and `www`) onto
   the demo's existing docroot. This is **additive** — the `rowancopy.com`
   preview subdomain keeps working — and Plesk's "keep websites secured"
   auto-provisions the Let's Encrypt cert for the new domain.

The domain is validated to a safe hostname and passed via `execFile` (no shell).

### 11e. Manage mailboxes from the portal

Once the §11c sudoers rule includes the three `plesk bin mail` entries, an admin
can run the whole mailbox lifecycle from the portal — no Plesk Admin needed:

1. **Create** — Admin → Mailboxes → **+ Add mailbox**. Leave "Create this mailbox
   on the server now (Plesk)" checked and set a password (8+ chars). The app runs
   `plesk bin mail --create <address> -mailbox true -passwd <pw>` **first**; only
   if that succeeds does it write the portal record (storing the password
   encrypted), so a failed provision never leaves an orphaned connection. Uncheck
   the box to register connection details for a mailbox that already exists.
2. **Reset password** — a mailbox's **Mail settings → Reset password on the mail
   server** runs `plesk bin mail --update <address> -passwd <pw>` and updates the
   stored connection in one step. The separate "Connection password" field only
   changes what the portal connects with (leave it for the rare case the server
   password was changed elsewhere).
3. **Delete on server** — removes the account with `plesk bin mail --remove
   <address>` and then drops the portal record. If the server removal fails the
   portal record is kept, so the mailbox is never silently lost. "Disconnect"
   (admin) still does the portal-only removal.

If the sudoers rule or the `plesk` binary is missing (e.g. local dev), these
actions fail with a clear "the server isn't set up for portal provisioning yet"
message and make **no** changes — no half-created mailboxes.

### 11f. Manage domains from the portal

Admin → **Domains** consolidates everything domain-related in one place:

- **Subdomains** — lists what exists on the server (`plesk bin subdomain
  --list`), tagging each as a demo preview or a standalone subdomain. Add a
  standalone subdomain (`plesk bin subdomain --create`, seeded with a placeholder
  page) or remove one (`plesk bin subdomain --remove`). Demo-backed subdomains
  are read-only here — they're managed from the Lead generator's "Delete & tear
  down" so demo state can't be silently broken.
- **Custom domains** — lists the client domains aliased onto demos, with a
  **Detach** action (`plesk bin site-alias --remove`) that removes the alias and
  resets the demo's domain fields. The demo's preview subdomain keeps working.

The subdomain list is read-only and best-effort: if the `plesk` CLI isn't
available the page just shows the demos the portal already knows about, so it
never errors. Labels are validated to a DNS-safe slug and domains to a hostname,
and every command runs via `execFile` (no shell).

---

## File uploads

Uploaded documents are stored in `app/uploads` (gitignored). Ensure it's
writable by the app user and included in your backups:

```bash
mkdir -p /var/www/vhosts/rowancopy.com/app/uploads
chown <app-user>:psacln /var/www/vhosts/rowancopy.com/app/uploads
```

For higher durability you can later move uploads to S3 — only
`src/lib/uploads.ts` and the document download route need to change.

## In-portal email threading (optional, advanced)

Step 8 gives you a normal `info@rowancopy.com` inbox you read in webmail/IMAP —
that's all most people need. Separately, the app can file *inbound* email into
the portal's **Messages** via a webhook. This needs a provider that posts
incoming mail as a webhook (Resend inbound / Mailgun routes / Postmark), pointed
at the URL below — so you'd route receiving there instead of (or forwarded from)
the Plesk mailbox. Skip unless you specifically want client replies threaded in
the portal.

```
https://rowancopy.com/api/email/inbound?secret=YOUR_INBOUND_WEBHOOK_SECRET
```

## Troubleshooting

- **502 / app won't start** — confirm the Application Root has `package.json`,
  that `npm run build` produced `.next/standalone/server.js`, and the Startup
  File is `server.js`. Check Plesk → **Logs** or `app/logs`.
- **DB connection errors** — verify `DATABASE_URL`, that PostgreSQL is running,
  and the DB user has access to the database.
- **Styles missing** — re-run `npm run build` (the postbuild step copies
  `.next/static` and `public` into `.next/standalone`).
