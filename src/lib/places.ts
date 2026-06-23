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

import { PLACES_HARD_CAP, MAX_CIRCLE_METERS } from "@/lib/places-config";

// Re-export so existing server-side importers of "@/lib/places" keep working.
export { PLACES_HARD_CAP, MAX_CIRCLE_METERS };

const METERS_PER_MILE = 1609.344;

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

// --- Geocoding (for the radius circle) -----------------------------------
// Resolve a center location to lat/lng so we can pass a locationBias circle.
// Best-effort: returns null on any failure so the search still runs (query-only).
async function geocodeCenter(
  location: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${key}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: { geometry?: { location?: { lat?: number; lng?: number } } }[];
    };
    const loc = data.results?.[0]?.geometry?.location;
    if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
      return { latitude: loc.lat, longitude: loc.lng };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * One Text Search call. Returns up to `max` results (clamped to PLACES_HARD_CAP).
 * When `radiusMiles` is given and within Google's circle limit, the search is
 * biased to a circle around `area` (the radius narrows the area — it never
 * raises the result cap or the call count). Throws on a missing key or a Google
 * error — the caller decides how to surface it.
 */
export async function searchPlaces(
  area: string,
  category: string,
  max: number,
  radiusMiles?: number,
): Promise<FoundLead[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY is not set on the server.");

  const cap = Math.min(Math.max(1, Math.floor(max) || 1), PLACES_HARD_CAP);

  const body: {
    textQuery: string;
    maxResultCount: number;
    locationBias?: { circle: { center: { latitude: number; longitude: number }; radius: number } };
  } = {
    textQuery: `${category} in ${area}`,
    maxResultCount: cap, // single call, no pagination beyond the cap
  };

  // Add a circular location bias when a radius is requested and within Google's
  // 50 km circle limit. Larger radii stay query-biased (wider search).
  if (radiusMiles && Number.isFinite(radiusMiles) && radiusMiles > 0) {
    const meters = Math.round(radiusMiles * METERS_PER_MILE);
    if (meters <= MAX_CIRCLE_METERS) {
      const center = await geocodeCenter(area);
      if (center) body.locationBias = { circle: { center, radius: meters } };
    }
  }

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
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    // body is Google's error message (no API key in it).
    throw new Error(`Places API error ${res.status}: ${errBody.slice(0, 200)}`);
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
