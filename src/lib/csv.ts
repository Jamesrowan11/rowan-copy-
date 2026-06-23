// Dependency-free, RFC-4180-ish CSV parser + column-mapping helpers for the
// Lead Generator CSV import. Handles quoted fields, commas and newlines inside
// quotes, "" escapes, CRLF line endings, and a leading BOM.

export function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Flush the final field/row (file may not end with a newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop blank rows (e.g. trailing newline).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// The fields we can map CSV columns onto. Mirrors the Demo intake fields.
export const IMPORT_FIELDS = [
  "businessName",
  "city",
  "industry",
  "email",
  "currentWebsite",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  businessName: "Business name",
  city: "City",
  industry: "Industry",
  email: "Email",
  currentWebsite: "Current website",
};

// Case-insensitive header aliases used to pre-guess the column mapping.
const GUESS_ALIASES: Record<ImportField, string[]> = {
  businessName: [
    "business name",
    "company",
    "company name",
    "organization name",
    "organization",
    "org",
    "account",
    "account name",
    "name",
  ],
  city: ["city", "town", "locality"],
  industry: ["industry", "category", "type", "sector", "vertical"],
  email: ["email", "contact email", "e-mail", "work email", "email address"],
  currentWebsite: ["website", "url", "domain", "web site", "site", "homepage"],
};

function normalize(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Best-guess mapping of our fields -> a detected header name (or "" if none). */
export function guessMapping(headers: string[]): Record<ImportField, string> {
  const normalized = headers.map((h) => normalize(h));
  const result = {} as Record<ImportField, string>;
  for (const field of IMPORT_FIELDS) {
    const aliases = GUESS_ALIASES[field];
    let matchIdx = -1;
    // Prefer an exact alias match, then a contains match.
    for (const alias of aliases) {
      const exact = normalized.indexOf(alias);
      if (exact !== -1) {
        matchIdx = exact;
        break;
      }
    }
    if (matchIdx === -1) {
      matchIdx = normalized.findIndex((h) =>
        aliases.some((a) => h.includes(a)),
      );
    }
    result[field] = matchIdx === -1 ? "" : headers[matchIdx];
  }
  return result;
}
