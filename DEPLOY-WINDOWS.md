# Deploying Rowan Copy on AWS (Windows Server)

This guide runs the app on a **Windows Server** EC2 instance with **IIS** in
front of the Node.js app and **PostgreSQL** for the database. The app is built
with `output: 'standalone'` and started by `server.js`.

The recommended setup uses **IIS + HttpPlatformHandler**: IIS owns ports 80/443,
terminates SSL, and starts/stops/recycles the Node process for you. An
alternative (run Node as a Windows service with NSSM and reverse-proxy from IIS)
is covered at the end.

> Prerequisites: an EC2 **Windows Server 2019/2022** instance, RDP access, and a
> domain (`rowancopy.com`). In the EC2 **Security Group**, allow inbound **80**
> and **443** (and **3389** for RDP from your IP only).

---

## 1. Install the prerequisites (on the server, via RDP)

1. **Node.js LTS (20 or 22)** — download the Windows MSI from nodejs.org and
   install. Verify in a new terminal: `node -v` and `npm -v`.
2. **Git for Windows** (optional, for pulling code) — git-scm.com.
3. **PostgreSQL for Windows** — install from enterprisedb.com. During setup set
   a password for the `postgres` superuser and keep the default port `5432`.
4. **IIS** — Server Manager → *Add Roles and Features* → **Web Server (IIS)**.
5. **IIS HttpPlatformHandler** — download and install the *HttpPlatformHandler*
   module (Microsoft IIS download). This lets IIS launch and manage Node.
6. *(For SSL)* **win-acme** (`win-acme.com`) — a Let's Encrypt client for
   Windows/IIS. (Skip if you terminate TLS at an AWS load balancer with ACM.)

---

## 2. Create the PostgreSQL database

Open **pgAdmin** (installed with PostgreSQL) or the *SQL Shell (psql)* and run:

```sql
CREATE USER rowancopy_user WITH PASSWORD 'a-strong-password';
CREATE DATABASE rowancopy OWNER rowancopy_user;
```

Your connection string is:

```
postgresql://rowancopy_user:a-strong-password@127.0.0.1:5432/rowancopy?schema=public
```

---

## 3. Get the code onto the server

Put the app somewhere like `C:\inetpub\rowancopy` (or `C:\apps\rowancopy`).

```powershell
cd C:\inetpub
git clone <your-repo-url> rowancopy
cd rowancopy
```

(Or copy the files over RDP / from S3.)

---

## 4. Configure environment variables

Create a **`.env`** file in the application root (`C:\inetpub\rowancopy\.env`).
`server.js` loads it automatically. Real environment variables (or values set in
`web.config`) always take precedence.

```ini
DATABASE_URL="postgresql://rowancopy_user:a-strong-password@127.0.0.1:5432/rowancopy?schema=public"
AUTH_SECRET="paste-a-long-random-string-here"
NEXTAUTH_URL="https://rowancopy.com"
APP_URL="https://rowancopy.com"
EMAIL_FROM="Rowan Copy <landen@rowancopy.com>"
RESEND_API_KEY=""
INBOUND_WEBHOOK_SECRET="another-long-random-string"
NODE_ENV="production"
```

Generate a secret in PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
```

---

## 5. Install dependencies and build

```powershell
cd C:\inetpub\rowancopy
npm install          # runs `prisma generate` via postinstall
npm run build        # standalone build + copies static assets into .next\standalone
```

---

## 6. Run migrations and seed

```powershell
npx prisma migrate deploy
npm run seed          # optional — creates demo accounts (see security note)
```

> **Security:** the seed creates demo accounts with a known password. In
> production, either skip the seed and create your admin via a one-off script,
> or log in and change every seeded password immediately (Admin → Users).

You can sanity-check the server before wiring up IIS:

```powershell
$env:PORT=3000; node server.js
# Browse http://localhost:3000 on the server, then Ctrl+C.
```

---

## 7. Configure the IIS site (HttpPlatformHandler)

1. Copy the IIS config template into place:

   ```powershell
   Copy-Item web.config.example web.config
   ```

   Open `web.config` and confirm `processPath` matches your Node install
   (default `C:\Program Files\nodejs\node.exe`). You can also move env vars from
   `.env` into the `<environmentVariables>` block here if you prefer.

2. Create a logs folder (HttpPlatformHandler writes Node's stdout there):

   ```powershell
   New-Item -ItemType Directory -Force -Path C:\inetpub\rowancopy\logs
   ```

3. In **IIS Manager**:
   - Add a **Website** (or convert an existing one):
     - **Physical path:** `C:\inetpub\rowancopy` (the app root, where
       `web.config` and `package.json` live).
     - **Binding:** http, port 80, host name `rowancopy.com` (add `www` too).
   - Make sure the site's **Application Pool** identity can read the folder and
     execute Node. The default `ApplicationPoolIdentity` is fine; grant it Read
     on `C:\inetpub\rowancopy` and Modify on the `uploads` and `logs` folders.

4. Browse to `http://rowancopy.com` — IIS launches Node and proxies to it.

---

## 8. DNS and SSL

1. **DNS:** in Route 53 (or your registrar), point `rowancopy.com` and `www` at
   the instance's **Elastic IP** with **A records**.
2. **SSL with win-acme:** run `wacs.exe`, choose your IIS site, and it will
   request a Let's Encrypt certificate and create the **https (443)** binding
   automatically, with auto-renewal via a scheduled task.
   - Then add an HTTP→HTTPS redirect (IIS **URL Rewrite**, or the "require SSL"
     option). Secure cookies need HTTPS, so keep `NEXTAUTH_URL`/`APP_URL` on
     `https://`.
   - *Alternative:* put an **Application Load Balancer** in front with an **ACM**
     certificate and forward 443→instance:80.

Make sure **Windows Firewall** allows inbound 80/443 (IIS usually adds rules),
and that the **EC2 Security Group** does too.

---

## 9. Deploying updates / restarting

```powershell
cd C:\inetpub\rowancopy
git pull
npm install
npm run build
npx prisma migrate deploy   # only if the schema changed
```

Recycle the app so IIS restarts Node — any of:

- IIS Manager → the site's **Application Pool** → **Recycle**, or
- `iisreset` (restarts all of IIS), or
- touch `web.config` (saving it triggers HttpPlatformHandler to restart Node).

---

## File uploads

Uploaded documents are stored in `C:\inetpub\rowancopy\uploads` (gitignored).
Ensure the app pool identity has **Modify** permission on it and include it in
your backups. For higher durability you can later move uploads to **S3** — only
`src/lib/uploads.ts` and the document download route need to change.

## Scheduled automations (recommended)

The app's scheduled automations — due-soon reminders to the team, overdue
alerts, monthly-plan renewal reminders, and the admin daily digest — all fire
from one endpoint. Create a **Task Scheduler** job that runs daily (e.g. 7am):

```powershell
# Program/script: powershell.exe
# Arguments:
-Command "Invoke-WebRequest -UseBasicParsing 'https://rowancopy.com/api/automations/run?secret=YOUR_INBOUND_WEBHOOK_SECRET' | Out-Null"
```

Each automation can be toggled in the portal (Admin → Signature & settings →
Automations), and sends are deduped — running the task more often than daily
never double-emails anyone. Event automations (inquiry auto-replies, status
update emails, welcome emails, testimonial requests) fire instantly on their
own and don't need this job.

## Optional: inbound email

Point your provider's inbound webhook (Resend / Mailgun / Postmark) at:

```
https://rowancopy.com/api/email/inbound?secret=YOUR_INBOUND_WEBHOOK_SECRET
```

---

## Alternative: run Node as a Windows service (NSSM) + IIS reverse proxy

If you'd rather manage the Node process yourself and use IIS purely as a reverse
proxy:

1. Install **NSSM** (`nssm.cc`) and register the app as a service:

   ```powershell
   nssm install RowanCopy "C:\Program Files\nodejs\node.exe" "C:\inetpub\rowancopy\server.js"
   nssm set RowanCopy AppDirectory C:\inetpub\rowancopy
   nssm set RowanCopy AppEnvironmentExtra PORT=3000 NODE_ENV=production
   nssm start RowanCopy
   ```

   (PM2 with `pm2-installer`/`pm2-windows-startup` is another option.)

2. Install IIS **Application Request Routing (ARR)** + **URL Rewrite**, enable
   proxy in ARR, and add a reverse-proxy rule on your IIS site forwarding to
   `http://localhost:3000/`. Bind `rowancopy.com` and the SSL cert on that site.

3. Restart after deploys with `nssm restart RowanCopy`.

With this approach you do **not** use `web.config`'s HttpPlatformHandler — delete
or don't create `web.config`, and let the ARR rule do the proxying.
