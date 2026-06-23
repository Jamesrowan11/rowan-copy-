// Google Places API (New) Text Search client for the lead-finder.
// GOOGLE_PLACES_API_KEY is read from the server environment ONLY and is never
// sent to the browser. Cost is controlled here: a single Text Search call per
// find, a tight field mask (cheap fields only), and a hard result cap.

export type FoundLead = {
  businessName: string;
  address: string;
  currentWebsite: string; // "" when the business has no website (the hot leads)
  phone: string;
  primaryType: string;
};

// Absolute hard cap regardless of caller input — one Text Search returns at
// most 20 results and we never paginate.
export const PLACES_HARD_CAP = 20;

// Only the fields we actually use. Requesting more raises the billing SKU.
const FIELD_MASK = [
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.primaryType",
].join(",");

export function placesConfigured(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}

/**
 * One Text Search call. Returns up to `max` results (clamped to PLACES_HARD_CAP).
 * Throws on a missing key or a Google error — the caller decides how to surface it.
 */
export async function searchPlaces(
  city: string,
  category: string,
  max: number,
): Promise<FoundLead[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY is not set on the server.");

  const cap = Math.min(Math.max(1, Math.floor(max) || 1), PLACES_HARD_CAP);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: `${category} in ${city}`,
        maxResultCount: cap, // single call, no pagination beyond the cap
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // body is Google's error message (no API key in it).
    throw new Error(`Places API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { places?: unknown[] };
  const places = Array.isArray(data.places) ? data.places : [];

  return places
    .slice(0, cap)
    .map((raw) => {
      const p = raw as {
        displayName?: { text?: string };
        formattedAddress?: string;
        websiteUri?: string;
        nationalPhoneNumber?: string;
        primaryType?: string;
      };
      return {
        businessName: String(p.displayName?.text || "").trim(),
        address: String(p.formattedAddress || "").trim(),
        currentWebsite: String(p.websiteUri || "").trim(),
        phone: String(p.nationalPhoneNumber || "").trim(),
        primaryType: String(p.primaryType || "").trim(),
      };
    })
    .filter((l) => l.businessName);
}
