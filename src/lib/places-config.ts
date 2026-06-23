// Pure config constants for the Places lead-finder. No server deps and NOT a
// "use server" module, so these can be imported safely from client components
// (a non-async value export from a "use server" file becomes a server reference
// at runtime and breaks on the client).

// Absolute hard cap regardless of caller input — one Text Search returns at
// most 20 results and we never paginate.
export const PLACES_HARD_CAP = 20;

// Google's locationBias circle radius maxes out at 50,000 m (~31 mi). Larger
// requested radii fall back to query-only bias (a wider, unconstrained search).
export const MAX_CIRCLE_METERS = 50000;

// Allowed search radii in miles (UI selector + server validation).
export const SEARCH_RADII_MILES = [1, 3, 5, 10, 25, 50, 100, 200, 400, 500, 1000];
