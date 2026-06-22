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
3. **Draft a cold outreach email** with Claude (`claude-haiku-4-5`) — friendly,
   professional, not salesy, under 120 words, mentioning the free sample site,
   with a `{WEBSITE_LINK}` placeholder and a subject line.
4. **Write the results** to `output/results.csv`.

**It never sends email and never contacts any email service.** Every row is a
draft for you to review and send yourself.

## Requirements

- Python 3.9+
- The `anthropic` and `pandas` packages (everything else is the standard library):

  ```bash
  pip install anthropic pandas
  ```

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

- `websites/<business_name>.html` — one self-contained sample site per lead.
- `output/results.csv` — one row per successfully processed lead, with columns:
  `business_name, email, website_file, research_summary, found_existing_site,
  email_subject, email_body, date, status` (status is always `drafted`).

Open the HTML files in a browser to preview them, then replace the
`{WEBSITE_LINK}` placeholder in each email body with wherever you host the
sample site before sending.

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
- **Models:** research/site-building uses `claude-sonnet-4-6` (with web search);
  email drafting uses `claude-haiku-4-5`.
