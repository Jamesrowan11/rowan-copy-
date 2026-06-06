# Deploying Rowan Copy on Vercel (fallback)

Vercel is a quick alternative to the Windows Server deployment. You'll need a
**hosted PostgreSQL** database (Vercel Postgres, Neon, Supabase, or RDS) since
Vercel is serverless.

> Note: `output: 'standalone'` in `next.config.mjs` is ignored by Vercel (it uses
> its own build target), so no changes are needed.

---

## 1. Create a hosted Postgres database

Pick one:

- **Vercel Postgres / Neon** — create a database, copy the connection string.
- **Supabase** — Project → Settings → Database → Connection string (URI).
- **AWS RDS** — create a Postgres instance and assemble the URL.

Your `DATABASE_URL` looks like:

```
postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

---

## 2. Import the project

1. Push the repo to GitHub/GitLab.
2. Vercel → **Add New… → Project** → import the repo.
3. Framework preset: **Next.js** (auto-detected). Leave build/output defaults.

---

## 3. Set environment variables

Vercel → Project → **Settings → Environment Variables** (Production + Preview):

| Name                     | Value                                            |
| ------------------------ | ------------------------------------------------ |
| `DATABASE_URL`           | your hosted Postgres URL (with `sslmode=require`) |
| `AUTH_SECRET`            | `openssl rand -base64 32`                        |
| `NEXTAUTH_URL`           | `https://rowancopy.com`                          |
| `APP_URL`                | `https://rowancopy.com`                          |
| `EMAIL_FROM`             | `Rowan Copy <landen@rowancopy.com>`              |
| `RESEND_API_KEY`         | optional                                         |
| `INBOUND_WEBHOOK_SECRET` | a long random string                             |

---

## 4. Run migrations and seed

`prisma generate` runs automatically (postinstall + build). Apply the schema and
seed once against the hosted DB — easiest from your machine with the production
`DATABASE_URL` exported:

```bash
DATABASE_URL="postgresql://…" npx prisma migrate deploy
DATABASE_URL="postgresql://…" npm run seed   # optional; change demo passwords after
```

(You can also add `prisma migrate deploy` to the Vercel build command if you
prefer migrations to run on each deploy.)

---

## 5. Point rowancopy.com at Vercel

Vercel → Project → **Settings → Domains** → add `rowancopy.com` and `www`.
Vercel shows the exact DNS records to create:

- **Apex (`rowancopy.com`)** → an **A record** to Vercel's IP (e.g.
  `76.76.21.21`), or an **ALIAS/ANAME** if your DNS supports it.
- **`www`** → a **CNAME** to `cname.vercel-dns.com`.

SSL is provisioned automatically once DNS resolves.

---

## Caveats on Vercel

- **File uploads:** the local `/uploads` folder is **not persistent** on Vercel's
  serverless filesystem. For production uploads on Vercel, switch
  `src/lib/uploads.ts` and the document download route to a blob/object store
  (Vercel Blob or S3). A Windows Server with local disk does not have this
  limitation.
- Use a pooled connection string (e.g. Neon/Supabase pooler) to avoid exhausting
  Postgres connections from serverless functions.
