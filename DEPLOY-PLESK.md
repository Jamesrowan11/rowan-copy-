# Deploying Rowan Copy on AWS Linux + Plesk

This guide deploys the app on a Plesk server (AWS Linux) using the **Node.js
extension (Phusion Passenger)** and **PostgreSQL**. The app is built with
`output: 'standalone'` and started by `server.js`, which Passenger runs.

> Prerequisites: a Plesk server with the **Node.js** and **PostgreSQL** Plesk
> extensions installed, and a domain (`rowancopy.com`) added in Plesk.

---

## 1. Create the PostgreSQL database

1. Plesk → **Databases** → **Add Database**.
2. Type: **PostgreSQL**. Name it e.g. `rowancopy`.
3. Add a database user (e.g. `rowancopy_user`) with a strong password and grant
   it access to the database.
4. Note the host/port. On the same server this is usually `127.0.0.1:5432`.

Your connection string will be:

```
postgresql://rowancopy_user:PASSWORD@127.0.0.1:5432/rowancopy?schema=public
```

---

## 2. Get the code onto the server

Use Git (Plesk → **Git**) or upload the files. Place the app in the domain's
directory, e.g. `/var/www/vhosts/rowancopy.com/app`.

```bash
cd /var/www/vhosts/rowancopy.com
git clone <your-repo-url> app
```

---

## 3. Configure the Node.js application in Plesk

Plesk → your domain → **Node.js** → **Enable Node.js**, then set:

| Field                      | Value                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| **Node.js version**        | 20.x or 22.x (LTS)                                                |
| **Application Mode**       | `production`                                                     |
| **Application Root**       | `/var/www/vhosts/rowancopy.com/app` (the folder with `package.json`) |
| **Application URL**        | `https://rowancopy.com`                                          |
| **Application Startup File** | `server.js`                                                    |
| **Document Root**          | `app/.next/standalone/public` (so Passenger can serve static files; see note below) |

> **Document Root note:** Passenger serves the Node app for all routes, so the
> Document Root mainly needs to exist. Pointing it at
> `app/.next/standalone/public` is fine. If Plesk requires the domain's default
> `httpdocs`, that also works — Next serves its own static assets through the
> standalone server either way.

---

## 4. Set environment variables (Plesk Node.js UI)

In the **Node.js** panel there's a **Custom environment variables** section. Add:

| Name                     | Value                                                       |
| ------------------------ | ---------------------------------------------------------- |
| `DATABASE_URL`           | `postgresql://rowancopy_user:PASSWORD@127.0.0.1:5432/rowancopy?schema=public` |
| `AUTH_SECRET`            | output of `openssl rand -base64 32`                        |
| `NEXTAUTH_URL`           | `https://rowancopy.com`                                    |
| `APP_URL`                | `https://rowancopy.com`                                    |
| `EMAIL_FROM`             | `Rowan Copy <landen@rowancopy.com>`                        |
| `RESEND_API_KEY`         | your Resend key (optional — omit to log emails instead)    |
| `INBOUND_WEBHOOK_SECRET` | a long random string (required in production)              |
| `NODE_ENV`               | `production`                                               |

---

## 5. Install dependencies and build

From the **Node.js** panel use **NPM install**, then run the build. Or via SSH:

```bash
cd /var/www/vhosts/rowancopy.com/app

# Install (runs `prisma generate` via postinstall)
npm install

# Build the standalone server (also copies static assets into .next/standalone)
npm run build
```

If the Plesk UI is your only option: click **NPM install**, then add a temporary
"Run script" of `build`, or run `npm run build` over SSH.

---

## 6. Run migrations and seed

Over SSH, with the env vars available (Plesk writes them to the app; you can also
export them in your shell):

```bash
cd /var/www/vhosts/rowancopy.com/app

# Apply the database schema
npx prisma migrate deploy

# Seed demo/admin data (optional in production — creates demo accounts).
# For a clean production start, instead create just your admin user manually
# or run the seed and then change the seeded passwords from the portal.
npm run seed
```

> **Security:** the seed creates demo accounts with a known password. In
> production, either skip the seed and create your admin via a one-off script,
> or log in and change every seeded password immediately (Admin → Users).

---

## 7. Point the domain and enable SSL

1. In Route 53 (or your DNS), point `rowancopy.com` (and `www`) at the server's
   Elastic IP with **A records**.
2. Plesk → your domain → **SSL/TLS Certificates** → **Install** a free
   **Let's Encrypt** certificate. Check "Secure the domain" and "www", and
   enable **Redirect HTTP → HTTPS**.

The secure cookies used by the app require HTTPS in production — make sure SSL is
active and `NEXTAUTH_URL`/`APP_URL` use `https://`.

---

## 8. Restart after deploys

After pulling new code:

```bash
cd /var/www/vhosts/rowancopy.com/app
git pull
npm install
npm run build
npx prisma migrate deploy   # only if the schema changed
```

Then restart the app — either:

- Plesk → **Node.js** → **Restart App**, or
- `touch tmp/restart.txt` in the Application Root (Passenger restarts on this).

```bash
mkdir -p tmp && touch tmp/restart.txt
```

---

## File uploads

Uploaded documents are stored in `app/uploads` (gitignored). Ensure this folder
is writable by the app user and is **included in your backups**:

```bash
mkdir -p /var/www/vhosts/rowancopy.com/app/uploads
chown <app-user>:<app-group> /var/www/vhosts/rowancopy.com/app/uploads
```

For higher durability, move uploads to S3 later — only `src/lib/uploads.ts` and
the download route need to change.

## Inbound email (optional)

To receive inbound email into the portal, point your provider's inbound webhook
(Resend / Mailgun / Postmark) at:

```
https://rowancopy.com/api/email/inbound?secret=YOUR_INBOUND_WEBHOOK_SECRET
```

## Optional: daily digest email

The app exposes a digest endpoint that emails active admins a summary of open
inquiries and due-soon projects. Schedule it with **Plesk → Scheduled Tasks
(cron)**, e.g. daily at 7am:

```bash
curl -s "https://rowancopy.com/api/digest?secret=YOUR_INBOUND_WEBHOOK_SECRET" >/dev/null
```

## Troubleshooting

- **502 / app won't start** — check Application Root has `package.json`, that
  `npm run build` produced `.next/standalone/server.js`, and the Startup File is
  `server.js`. View logs in Plesk → **Logs** or `app/logs`.
- **DB connection errors** — verify `DATABASE_URL`, that PostgreSQL is running,
  and the DB user has access.
- **Styles missing** — re-run `npm run build` (the postbuild step copies
  `.next/static` and `public` into `.next/standalone`).
