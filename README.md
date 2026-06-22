# rowan-leads

A Python command-line tool for **Rowan Copy** that turns a list of prospects into
personalised sample websites and ready-to-review cold outreach emails.

For each lead it will:

1. **Research the business online** with Claude (`claude-sonnet-4-6`) using the
   built-in **web search** tool. If you supplied their current website, Claude
   reads it directly; otherwise it searches for the business by name + city to
   find their website, Google listing, or social pages.
2. **Build a sample website** — a clean, modern, mobile-friendly one-page HTML
   site that is clearly better than what they have today, personalised with
   their real services, name, and city. Saved to `websites/<business_name>.html`.
3. **Publish it live** to a fresh subdomain on your Plesk server (e.g.
   `https://maple-street-dental-a7f3.rowancopy.com`) via `plesk bin`.
4. **Draft a cold outreach email** with Claude (`claude-haiku-4-5`) — friendly,
   professional, not salesy, under 120 words, mentioning the free sample site —
   with the real live URL dropped in and a subject line.
5. **Write the results** to `output/results.csv`.

**It never sends email and never contacts any email service.** Every row is a
draft for you to review and send yourself.

> ⚠️ **This tool must run ON the Plesk server**, as a user with rights to run
> `plesk bin` (typically root or an admin account). It shells out to `plesk bin`
> directly — it does not connect to Plesk remotely.

## Requirements

- Python 3.9+
- The `anthropic` and `pandas` packages (everything else is the standard library):

  ```bash
  pip install anthropic pandas
  ```

## One-time server setup (you do this yourself)

The deploy step assumes two things are already in place on the server side. Set
these up once, before running the tool:

1. **Wildcard DNS A record.** Point `*.rowancopy.com` at your server's public IP
   so every generated subdomain resolves:

   ```
   *.rowancopy.com.   A   <your-server-ip>
   ```

2. **Wildcard SSL certificate.** Install a wildcard Let's Encrypt certificate
   for `*.rowancopy.com` (e.g. via the Plesk Let's Encrypt extension, with the
   "issue a wildcard certificate" option, using a DNS-01 challenge) and assign
   it to the `rowancopy.com` subscription. The tool **does not issue
   certificates** — it assumes the wildcard cert already covers every
   `<label>.rowancopy.com` subdomain it creates.

The tool itself must run on the Plesk server as a user allowed to run
`plesk bin` (e.g. root). New subdomains are created under the `rowancopy.com`
vhost, with their document root at
`/var/www/vhosts/rowancopy.com/<label>/index.html`.

## 1. Set your API key

The tool reads your Anthropic API key from the `ANTHROPIC_API_KEY` environment
variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

(On Windows PowerShell: `setx ANTHROPIC_API_KEY "sk-ant-..."`, then reopen the terminal.)

## 2. Fill in leads_input.csv

Edit `leads_input.csv`. It must have these columns (a header row is required):

| Column            | Required | Notes                                            |
|-------------------|----------|--------------------------------------------------|
| `business_name`   | yes      | The prospect's business name                     |
| `industry`        | yes      | e.g. Dentist, Coffee Roaster, Plumber            |
| `city`            | yes      | Used to help find the right business online      |
| `email`           | yes      | Where you'd eventually send the outreach         |
| `current_website` | no       | Leave blank if they don't have one               |

A sample file ships with two fake businesses — one with a website and one
without — so you can test the tool immediately:

```csv
business_name,industry,city,email,current_website
Maple Street Dental,Dentist,Portland,hello@maplestreetdental.example,https://www.maplestreetdental.example
Rivertown Roasters,Coffee Roaster,Asheville,owner@rivertownroasters.example,
```

## 3. Run the tool

```bash
python rowan_leads.py
```

You'll see per-lead progress, and at the end a summary table showing how many
leads succeeded, failed, and had an existing website found.

## Output

- `websites/<business_name>.html` — a local copy of each sample site (the same
  HTML is also published live to the subdomain's document root).
- `output/results.csv` — one row per processed lead, with columns:
  `business_name, email, website_file, research_summary, found_existing_site,
  email_subject, email_body, live_url, subdomain_label, date, status`.

`status` is one of:

| `status`        | Meaning                                                          |
|-----------------|------------------------------------------------------------------|
| `deployed`      | Site published live; `live_url` is set and already in the email  |
| `deploy_failed` | Site built locally but Plesk errored; `{WEBSITE_LINK}` left as-is |

For `deployed` rows the `{WEBSITE_LINK}` placeholder in the email body has
already been replaced with the real `https://<label>.rowancopy.com` URL — the
email is ready to review and send. For `deploy_failed` rows the placeholder is
left untouched (so you never send a dead link); check the error printed during
the run, fix the issue, and re-run.

## Tearing down demos

You don't want to host hundreds of dead demo subdomains forever. To remove one,
pass its `subdomain_label` (from `output/results.csv`):

```bash
python rowan_leads.py --remove maple-street-dental-a7f3
```

This runs `plesk bin subdomain --remove <label> -domain rowancopy.com` and
exits — it does not process any leads.

## Notes

- **Robust runs:** each lead is processed inside its own `try/except`, so one
  bad row never crashes the whole run — it's counted as failed and the tool
  moves on.
- **Token costs:** web search runs server-side and is capped at a few uses per
  lead, and the research summary is truncated before it's forwarded to the
  email step, so a single verbose page can't blow up your bill.
- **Fallback:** if Claude can't find any online presence for a business, it
  builds the site from the CSV details alone and notes that
  (`found_existing_site = no`).
- **Deploy isolation:** a Plesk failure for one lead never aborts the run — that
  lead is marked `deploy_failed` and the tool moves on. The site HTML is still
  saved locally under `websites/`.
- **Subdomain labels:** built from the business name (lowercased, non-alphanumerics
  collapsed to hyphens, truncated to 50 chars) plus a random 4-character suffix
  for uniqueness — e.g. `maple-street-dental-a7f3`.
- **Models:** research/site-building uses `claude-sonnet-4-6` (with web search);
  email drafting uses `claude-haiku-4-5`.
