// An inspector's Google rating, shown on their card and page and linking out
// to the reviews on Google. Decided 2026-09-23 (DECISIONS.md): the site never
// hosts reviews of its own; it shows Google's number, with attribution, on
// CLAIMED listings only, and the inspector can turn it off.
//
// Shared by the Astro pages (render), scripts/google-rating.mjs (attach and
// refresh by hand) and netlify/functions/google-rating-refresh.mts (the
// monthly refresh Google's terms require — place data may be cached for at
// most 30 days; the place ID itself may be kept indefinitely).

/** The columns this feature adds to listings. All optional on the type so a
 *  build against a database without them still works — select('*') omits
 *  what is not there and nothing renders. */
export interface GoogleRatingFields {
  /** Places API (New) place ID, "ChIJ…". Attached by hand or at claim; never
   *  by a blind name match — see DECISIONS.md for why. */
  google_place_id?: string | null;
  google_rating?: number | null;
  google_rating_count?: number | null;
  google_rating_fetched_at?: string | null;
  /** The inspector's switch. Default true; off renders nothing at all. */
  show_google_rating?: boolean;
}

export interface GoogleRating {
  /** "5.0", one decimal, as Google shows it. */
  rating: string;
  count: number;
  /** Opens Google's own review list for the place. */
  url: string;
}

/** Google's review list for a place ID. */
export function googleReviewsUrl(placeId: string): string {
  return `https://search.google.com/local/reviews?placeid=${encodeURIComponent(placeId)}`;
}

/**
 * What to render, or null. Null when the listing is unclaimed (a rating on a
 * listing nobody has confirmed is the wrong-match risk the decision rules out),
 * when the inspector turned it off, or when no rating has been fetched yet.
 * A place with a rating but zero reviews cannot happen on Google's side, but
 * the guard costs nothing.
 */
export function googleRating(l: GoogleRatingFields & { tier: string }): GoogleRating | null {
  if (l.tier === 'unclaimed') return null;
  if (l.show_google_rating === false) return null;
  if (!l.google_place_id || l.google_rating == null || !l.google_rating_count) return null;
  return {
    rating: l.google_rating.toFixed(1),
    count: l.google_rating_count,
    url: googleReviewsUrl(l.google_place_id),
  };
}

const PLACES = 'https://places.googleapis.com/v1';

export interface PlaceCandidate {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  count: number;
  /** True for a business with no public address. Google's text search
   *  often cannot find these by name (RMC Inspections, 2026-09-23), which is
   *  why the claim flow must also accept a pasted Google link. */
  serviceArea: boolean;
}

interface PlacesPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  pureServiceAreaBusiness?: boolean;
}

function candidate(p: PlacesPlace): PlaceCandidate {
  return {
    id: p.id ?? '',
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    rating: p.rating ?? null,
    count: p.userRatingCount ?? 0,
    serviceArea: p.pureServiceAreaBusiness === true,
  };
}

const FIELDS = 'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,pureServiceAreaBusiness';

/** Text search, for finding a listing's Google profile to confirm by hand. */
export async function searchPlaces(query: string, apiKey: string): Promise<PlaceCandidate[]> {
  const res = await fetch(`${PLACES}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELDS.split(',').map((f) => `places.${f}`).join(','),
    },
    body: JSON.stringify({ textQuery: query, regionCode: 'US', maxResultCount: 5 }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Places searchText HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { places?: PlacesPlace[] };
  return (body.places ?? []).map(candidate);
}

/**
 * One place by ID. Null when Google no longer knows the ID (a merged or
 * removed profile) so the caller can clear the stale rating rather than keep
 * showing a number Google itself no longer stands behind.
 */
export async function fetchPlace(placeId: string, apiKey: string): Promise<PlaceCandidate | null> {
  const res = await fetch(`${PLACES}/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELDS },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Places get HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return candidate((await res.json()) as PlacesPlace);
}
