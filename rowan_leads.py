#!/usr/bin/env python3
"""rowan-leads — a lead-generation pipeline for Rowan Copy.

For each lead in leads_input.csv this tool:

  1. Uses Claude (claude-sonnet-4-6) WITH the web search tool to research the
     business online, summarise it, and build a clean, modern, mobile-friendly
     one-page sample website that is clearly better than what they have today.
  2. Uses Claude (claude-haiku-4-5) to draft a short, friendly cold outreach
     email (with a subject line and a placeholder for the website link).
  3. Writes one row per lead to output/results.csv. It NEVER sends email.

Set your API key with:   export ANTHROPIC_API_KEY="sk-ant-..."
Run with:                python rowan_leads.py
"""

import csv
import os
import re
import sys
import datetime
from pathlib import Path

try:
    import anthropic
except ImportError:
    sys.exit("Missing dependency: anthropic. Install with `pip install anthropic pandas`.")

try:
    import pandas as pd
except ImportError:
    sys.exit("Missing dependency: pandas. Install with `pip install anthropic pandas`.")


# --- Configuration -----------------------------------------------------------

RESEARCH_MODEL = "claude-sonnet-4-6"
EMAIL_MODEL = "claude-haiku-4-5"

# The web search tool, exactly as requested. Capping max_uses keeps the
# server-side research loop (and the token bill) bounded per lead.
WEB_SEARCH_TOOL = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}]

INPUT_CSV = Path("leads_input.csv")
WEBSITES_DIR = Path("websites")
OUTPUT_DIR = Path("output")
OUTPUT_CSV = OUTPUT_DIR / "results.csv"

# Keep the research summary that we forward to the (cheaper) email model small,
# so a verbose research turn never blows up email-step token costs.
SUMMARY_CHARS_FOR_EMAIL = 1500
# Hard cap on the research summary we persist to the CSV.
SUMMARY_CHARS_STORED = 2000

# pause_turn safety valve: how many times we let the server-side search loop
# resume before giving up on a single lead.
MAX_PAUSE_CONTINUATIONS = 8

REQUIRED_COLUMNS = ["business_name", "industry", "city", "email", "current_website"]


# --- Helpers -----------------------------------------------------------------

def slugify(name: str) -> str:
    """Turn a business name into a safe filename stem."""
    slug = re.sub(r"[^A-Za-z0-9]+", "-", name.strip()).strip("-").lower()
    return slug or "business"


def collect_text(content) -> str:
    """Concatenate every text block in a response's content list."""
    parts = []
    for block in content:
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    return "\n".join(parts).strip()


def extract_html(text: str) -> str:
    """Pull the HTML out of a ```html ... ``` fence, falling back gracefully."""
    fence = re.search(r"```html\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if fence:
        return fence.group(1).strip()
    # Fall back to any fenced block.
    fence = re.search(r"```\s*(.*?)```", text, re.DOTALL)
    if fence:
        return fence.group(1).strip()
    # Last resort: grab from the first <!DOCTYPE/<html to the end.
    doc = re.search(r"(<!DOCTYPE html.*|<html.*)", text, re.DOTALL | re.IGNORECASE)
    if doc:
        return doc.group(1).strip()
    return ""


def parse_field(text: str, label: str) -> str:
    """Read a single-line `LABEL: value` field out of the model response."""
    match = re.search(rf"^{label}:\s*(.+)$", text, re.IGNORECASE | re.MULTILINE)
    return match.group(1).strip() if match else ""


def build_research_prompt(lead: dict) -> str:
    name = lead["business_name"]
    industry = lead["industry"]
    city = lead["city"]
    website = (lead.get("current_website") or "").strip()

    if website:
        find_instructions = (
            f"They gave us their current website: {website}\n"
            "Read it directly to understand what they do and how their current "
            "site looks and reads."
        )
    else:
        find_instructions = (
            "No website was provided. Search the web for this business by name "
            f'("{name}" {city}) to find their website, Google Business listing, '
            "or social media pages."
        )

    return f"""You are helping Rowan Copy, a web design business, prepare a personalised \
sample website for a sales prospect.

Prospect details from our CRM:
- Business name: {name}
- Industry: {industry}
- City: {city}
- Current website: {website or "(none provided)"}

Step 1 — Research the business online.
{find_instructions}
Summarise what the business does, the services it offers, and its current online \
presence and style (design, tone, strengths, weaknesses). If, after searching, you \
cannot find ANY online presence for them, that is fine — build the site from the CRM \
details above and clearly say no online presence was found.

Step 2 — Build a sample website.
Generate a single, complete, self-contained one-page HTML website that is clearly \
BETTER than what they have today: clean, modern, mobile-friendly (responsive, with a \
viewport meta tag), fast, and accessible. Use inline CSS in a <style> tag so the file \
stands alone (no external dependencies). Personalise it with their real business name, \
city, and actual services. Include sensible sections such as hero, services, about, \
and a contact call-to-action.

Respond in EXACTLY this format and nothing else:

RESEARCH_SUMMARY: <2-4 sentence plain-text summary of the business and its current online presence>
FOUND_EXISTING_SITE: <yes or no>
HTML:
```html
<the complete HTML document here>
```"""


def build_email_prompt(lead: dict, research_summary: str) -> str:
    name = lead["business_name"]
    city = lead["city"]
    industry = lead["industry"]
    summary = research_summary[:SUMMARY_CHARS_FOR_EMAIL]

    return f"""Write a short cold outreach email from Rowan Copy, a web design business, \
to a prospect.

Prospect: {name}, a {industry} business in {city}.
What we know about them: {summary or "(limited information)"}

The email should:
- Be friendly and professional, NOT salesy or pushy.
- Be under 120 words.
- Mention that we already built them a free sample website they can look at.
- Include the literal placeholder {{WEBSITE_LINK}} where the link will go.
- Not use a hard sell or fake urgency.

Respond in EXACTLY this format and nothing else:

SUBJECT: <a short, compelling subject line>
BODY:
<the email body>"""


# --- Core per-lead processing ------------------------------------------------

def research_and_build_site(client, lead: dict) -> dict:
    """Run the web-search research + site generation. Returns parsed pieces."""
    messages = [{"role": "user", "content": build_research_prompt(lead)}]

    pauses = 0
    while True:
        with client.messages.stream(
            model=RESEARCH_MODEL,
            max_tokens=16000,
            tools=WEB_SEARCH_TOOL,
            messages=messages,
        ) as stream:
            response = stream.get_final_message()

        if response.stop_reason == "pause_turn":
            pauses += 1
            if pauses > MAX_PAUSE_CONTINUATIONS:
                raise RuntimeError("Web search loop did not finish (too many pause_turns).")
            # Re-send so the server resumes its search loop.
            messages.append({"role": "assistant", "content": response.content})
            continue
        break

    text = collect_text(response.content)
    summary = parse_field(text, "RESEARCH_SUMMARY")
    found_raw = parse_field(text, "FOUND_EXISTING_SITE").lower()
    found = "yes" if found_raw.startswith("y") else "no"
    html = extract_html(text)

    if not html:
        raise RuntimeError("Model did not return any HTML for the website.")

    if not summary:
        # If the model skipped the labelled summary, keep something useful.
        summary = text[:SUMMARY_CHARS_STORED]

    return {"summary": summary, "found_existing_site": found, "html": html}


def write_email(client, lead: dict, research_summary: str) -> dict:
    response = client.messages.create(
        model=EMAIL_MODEL,
        max_tokens=600,
        messages=[{"role": "user", "content": build_email_prompt(lead, research_summary)}],
    )
    text = collect_text(response.content)
    subject = parse_field(text, "SUBJECT")

    body_match = re.search(r"^BODY:\s*(.*)$", text, re.IGNORECASE | re.DOTALL | re.MULTILINE)
    body = body_match.group(1).strip() if body_match else text

    if not subject:
        subject = f"A free sample website for {lead['business_name']}"

    return {"subject": subject, "body": body}


def process_lead(client, lead: dict) -> dict:
    """Process a single lead end-to-end. Raises on failure."""
    name = lead["business_name"]

    site = research_and_build_site(client, lead)

    website_path = WEBSITES_DIR / f"{slugify(name)}.html"
    website_path.write_text(site["html"], encoding="utf-8")

    email = write_email(client, lead, site["summary"])

    return {
        "business_name": name,
        "email": lead.get("email", ""),
        "website_file": str(website_path),
        "research_summary": site["summary"][:SUMMARY_CHARS_STORED],
        "found_existing_site": site["found_existing_site"],
        "email_subject": email["subject"],
        "email_body": email["body"],
        "date": datetime.date.today().isoformat(),
        "status": "drafted",
    }


# --- Main --------------------------------------------------------------------

def load_leads(path: Path) -> pd.DataFrame:
    if not path.exists():
        sys.exit(f"Input file not found: {path}. See README.md for the expected format.")
    df = pd.read_csv(path, dtype=str).fillna("")
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        sys.exit(f"{path} is missing required columns: {', '.join(missing)}")
    return df


def main() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("ANTHROPIC_API_KEY is not set. Run: export ANTHROPIC_API_KEY=\"sk-ant-...\"")

    df = load_leads(INPUT_CSV)
    WEBSITES_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)

    client = anthropic.Anthropic()

    results = []
    succeeded = 0
    failed = 0
    existing_found = 0

    total = len(df)
    for i, (_, row) in enumerate(df.iterrows(), start=1):
        lead = {col: str(row.get(col, "")).strip() for col in REQUIRED_COLUMNS}
        name = lead["business_name"] or f"(row {i})"
        print(f"[{i}/{total}] Processing {name} ...", flush=True)

        try:
            result = process_lead(client, lead)
            results.append(result)
            succeeded += 1
            if result["found_existing_site"] == "yes":
                existing_found += 1
                note = "existing site found"
            else:
                note = "no existing site — built from CSV info"
            print(f"    done ({note}) -> {result['website_file']}", flush=True)
        except Exception as exc:  # one bad row never crashes the whole run
            failed += 1
            print(f"    FAILED: {exc}", file=sys.stderr, flush=True)

    # Write the output CSV (even if some/all leads failed).
    fieldnames = [
        "business_name", "email", "website_file", "research_summary",
        "found_existing_site", "email_subject", "email_body", "date", "status",
    ]
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    # Summary table.
    print("\n" + "=" * 44)
    print("  Rowan Copy — lead generation summary")
    print("=" * 44)
    print(f"  {'Total leads':<28}{total:>14}")
    print(f"  {'Succeeded':<28}{succeeded:>14}")
    print(f"  {'Failed':<28}{failed:>14}")
    print(f"  {'Existing site found':<28}{existing_found:>14}")
    print("=" * 44)
    print(f"  Results written to: {OUTPUT_CSV}")
    print(f"  Websites written to: {WEBSITES_DIR}/")
    print("  No emails were sent — all rows are drafts.")


if __name__ == "__main__":
    main()
