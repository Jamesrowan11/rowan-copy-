# Rowan Copy

A full-stack web app for **Rowan Copy** — a freelance copywriting and web studio
in Howard County, Maryland. _Clean copy for small businesses._

It has two parts:

- **A.** A multi-page public **marketing website** (Home, Services, Work, About,
  Pricing, Contact) with a quote/inquiry form that saves to the database.
- **B.** A role-based **portal** behind one login, with three roles —
  **Client**, **Employee**, and **Admin** — covering projects, messaging,
  deliverables, payments, email, and more.

## Tech stack

- **Next.js** (App Router) + **React** + **TypeScript**
- **Tailwind CSS** for styling
- **Prisma** ORM with **PostgreSQL** (production) — SQLite supported for quick
  local dev
- **Auth.js / NextAuth v5** with email + password (bcrypt), JWT sessions,
  role-based access
- Pluggable **email** layer: **SMTP** (e.g. the Plesk mail server) when
  `SMTP_HOST` is set, else **Resend** when `RESEND_API_KEY` is set, else emails
  are logged to the console (the app runs fully with no email config)
- Local **file uploads** for documents/deliverables (structured to move to cloud
  storage later)

## Quick start

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
#    Edit .env — at minimum set DATABASE_URL and AUTH_SECRET.
#    Generate a secret:  openssl rand -base64 32

# 3. Create the database schema
npm run prisma:deploy      # applies migrations (Postgres)
#    — or, for quick SQLite dev, see "Local dev with SQLite" below.

# 4. Seed demo data
npm run seed

# 5. Run
npm run dev
#    Open http://localhost:3000
```

## Environment variables

All are documented in [`.env.example`](./.env.example). The app runs end-to-end
**locally with no email keys set**.

| Variable                 | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `DATABASE_URL`           | Postgres connection string (or `file:./dev.db` for SQLite).             |
| `AUTH_SECRET`            | Secret used to sign session JWTs. `openssl rand -base64 32`.            |
| `NEXTAUTH_URL`           | Base URL of the app (e.g. `http://localhost:3000`).                     |
| `APP_URL`                | Base URL used in email links and SEO.                                   |
| `SMTP_HOST`              | Mail server host (e.g. the Plesk domain). When set, email sends via SMTP. |
| `SMTP_PORT`              | `587` (STARTTLS) or `465` (implicit TLS). Defaults to 587.              |
| `SMTP_USER` / `SMTP_PASS`| Mailbox login (e.g. `info@rowancopy.com` + its password).             |
| `RESEND_API_KEY`         | Used only if `SMTP_HOST` is unset. Otherwise console log.               |
| `EMAIL_FROM`             | From / reply-to address, e.g. `Rowan Copy <info@rowancopy.com>`.        |
| `INBOUND_WEBHOOK_SECRET` | Secret for the inbound-email webhook. Open if unset (dev only).         |

## Demo accounts

After seeding, log in at **`/login`**. Password for all: **`Password123!`**

| Role     | Email                    |
| -------- | ------------------------ |
| Admin    | `admin@rowancopy.com`    |
| Employee | `employee@rowancopy.com` |
| Client   | `client@example.com`     |

The seed also creates a second employee and client, sample projects across the
status pipeline (including a cancelled one), an inquiry queue, payments,
documents, a message thread, a sent email, a featured testimonial, templates,
and an unmatched inbound email — so every screen has something to look at
immediately.

## Local dev with SQLite (optional)

Postgres is the production target, but SQLite is handy for quick local work. The
Prisma schema uses `String` fields instead of native enums specifically so the
same schema works on both.

```bash
# 1. In prisma/schema.prisma, change the datasource provider:
#      provider = "sqlite"
# 2. In .env:
#      DATABASE_URL="file:./dev.db"
# 3. Create the schema and seed:
npm run db:push
npm run seed
npm run dev
```

(Use `prisma db push` for SQLite rather than the Postgres migrations.)

## Scripts

| Script                     | Description                                          |
| -------------------------- | --------------------------------------------------- |
| `npm run dev`              | Start the dev server.                               |
| `npm run build`            | Production build (standalone) + copy static assets. |
| `npm run start`            | Start the standard production server.               |
| `npm run start:standalone` | Start the standalone server via `server.js` (used in production on Plesk/Passenger). |
| `npm run prisma:deploy`    | Apply migrations (`prisma migrate deploy`).         |
| `npm run prisma:migrate`   | Create + apply a dev migration.                     |
| `npm run db:push`          | Push the schema without migrations (SQLite dev).    |
| `npm run seed`             | Seed demo data.                                     |

## What's inside

### Public site (`/`)

Home, Services, Pricing, Work, About, and a Contact page whose form saves an
inquiry to the database (visible in the admin dashboard). Sticky header, shared
footer, responsive, accessible (skip link, semantic HTML, labeled forms), and
SEO (title/description, Open Graph, JSON-LD `ProfessionalService`).

### Portal (`/portal` → role dashboard)

- **Admin** — overview tiles; inquiry queue (delete/convert); projects (create,
  assign to any employee **or** admin, status pipeline, cancel/reinstate with
  reason); users & team (create/edit/reset password/activate-deactivate);
  monthly plans; announcements; compose email + full sent history; templates;
  reviews; unmatched inbox; audit log; CSV export; editable email signature; own
  profile.
- **Employee** — assigned projects only; update status; project notes; upload
  drafts; compose email to anyone; messages; templates; own profile.
- **Client** — own projects (cancelled shown as Cancelled); new requests; intake
  brief; deliverables & payment links; revisions (approve / request changes,
  decrements included rounds); monthly plan; messages with Rowan Copy; own
  profile.
- **Messaging** — in-app threads with unread badges; admins see all
  conversations; access enforced server-side (you can only read/post in threads
  you're in). Inbound-email webhook at `POST /api/email/inbound`.

### Automations

The studio runs itself. Every automation is admin-toggleable (Admin →
Signature & settings → Automations) and on by default:

- **Inquiry auto-reply** — contact-form submitters get an instant confirmation.
- **New-inquiry alerts** — admins are emailed the moment a request comes in
  (website, client portal, or monthly-plan update requests).
- **Project status updates** — clients are emailed automatically when work
  starts, a draft is delivered, or the project closes.
- **Client welcome email** — converting an inquiry creates the client account
  and emails them their portal login.
- **Quote-accepted alerts** — the team is emailed when a client accepts a quote.
- **Testimonial on close** — closing a project auto-sends a review request
  (once per project).
- **Scheduled run** (`GET /api/automations/run`, cron/Task Scheduler) —
  due-soon reminders to assignees, overdue alerts to admins, monthly-plan
  renewal reminders to clients, and the admin daily digest. Sends are deduped,
  so running it more than daily never double-emails.

### Security model

All access control is enforced **server-side on the data** — in page loaders,
server actions, and API routes — never in the UI alone. Requesting another
user's record by changing an id returns not-found/forbidden, not the data.
Sessions expire after ~30 min of inactivity and a hard 8-hour maximum; cookies
are httpOnly, secure, and sameSite. Deactivated users can't log in.

## Deployment

- **Plesk on Ubuntu (AWS) — Node.js/Passenger + PostgreSQL** — see
  [`DEPLOY-PLESK.md`](./DEPLOY-PLESK.md). This is the production target.
- **Vercel (fallback)** — see [`DEPLOY-VERCEL.md`](./DEPLOY-VERCEL.md).
