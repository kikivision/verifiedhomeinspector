import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly at build/dev time rather than silently returning no data —
  // an empty directory page is easy to mistake for "no inspectors yet"
  // instead of "the site isn't configured."
  throw new Error(
    'Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in the values from your Supabase project settings.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Tier = 'unclaimed' | 'claimed' | 'featured';

export interface Listing {
  id: string;
  county: string;
  city: string;
  license_number: string;
  licensee_name: string;
  business_name: string | null;
  phone: string | null;
  tier: Tier;
  specialties: string[];
  cert_badges: string[];
  photo_urls: string[];
  featured_position: number | null;
  /**
   * Brand mark, as a site-relative path like "/logos/rmc-inspections.png".
   *
   * Named path rather than the conventional url because "url" reads as where
   * the logo GOES, and it goes nowhere — it renders as a bare <img> with no
   * anchor around it, deliberately. A logo linking to the inspector's own site
   * would be a lead leaving uncounted, the same hole as printing their phone
   * number. The value is also required to be relative, so it is a path in the
   * literal sense too.
   *
   * Not part of photo_urls: a logo and a job photo want opposite treatment —
   * one contained on a plate at its own aspect ratio, the other filling a
   * square slot — and sharing one field is what put a brand mark in a square
   * photo slot to begin with.
   */
  logo_path: string | null;
  /** Years in business, as the inspector states it. Rendered as "N+ years". */
  years_experience: number | null;
  claimed_at: string | null;
  /**
   * The auth user who claimed this listing through the dashboard, or null for
   * an unclaimed row and for the listings set up by hand before self-serve
   * claims existed. Public reads see the uuid; it identifies nothing outside
   * auth.users.
   */
  claimed_by: string | null;
  /** Stored with its scheme, validated by update_my_listing. */
  website: string | null;
  /** Written by the inspector on their dashboard. Nothing is generated for them. */
  about: string | null;
  /** Cities the inspector serves, chosen from the cities in their county. */
  service_cities: string[];
  created_at: string;
}

/**
 * A listing that shows contact details. Both claimed and featured do; the
 * name is here so the page reads "if it is claimed" rather than repeating the
 * tier comparison in four places, each of which could drift.
 */
export function isClaimed(l: Pick<Listing, 'tier'>): boolean {
  return l.tier !== 'unclaimed';
}

/** "rmcinspections.com" for a stored "https://rmcinspections.com/". */
export function websiteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Every city with at least one live listing in a county. The dashboard offers
 * these as the cities an inspector can say they serve, so the list can never
 * name a place the county page has nothing for.
 */
export async function getCitiesForCounty(countySlug: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('city')
    .is('delisted_at', null)
    .eq('county', countySlug);
  if (error) {
    console.error('Error fetching cities:', error.message);
    return [];
  }
  return [...new Set((data as { city: string }[]).map((r) => r.city))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * Fetches all listings for a county, sorted the way the site should
 * actually display them: featured first (by position), then claimed,
 * then unclaimed — matching the tier ladder, not just an alphabetical dump.
 */
export async function getListingsForCounty(countySlug: string): Promise<Listing[]> {
  // One read per county per build. The county page, every inspector page and
  // every badge all need the same rows, and before this each asked for them
  // separately — twelve full-county selects fired at once, Supabase's free
  // tier answered some with Gateway Timeout, and the build carried on with an
  // empty county and 400 fewer pages, no error. The smoke test caught the page
  // count; this is the fix. Dev is not cached, so a change in the table shows
  // on the next reload.
  if (import.meta.env.PROD) {
    const cached = listingsCache.get(countySlug);
    if (cached) return cached;
    const pending = fetchListingsForCounty(countySlug);
    listingsCache.set(countySlug, pending);
    return pending;
  }
  return fetchListingsForCounty(countySlug);
}

const listingsCache = new Map<string, Promise<Listing[]>>();

async function fetchListingsForCounty(countySlug: string): Promise<Listing[]> {
  // A timeout on a shared read would still empty a county for the whole
  // build, so one retry after a pause. A second failure is logged and returns
  // nothing, which the smoke test turns into a failed build rather than a
  // deployed site with a county missing.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      // Delisted rows stopped appearing in the DBPR extract, so the license is no
      // longer current. They stay in the table — deleting them would destroy a
      // claimed listing over what might be a bad upstream file — but a site whose
      // promise is verified licensure must not show them.
      .is('delisted_at', null)
      .eq('county', countySlug)
      .order('featured_position', { ascending: true, nullsFirst: false });

    if (!error) return sortListings(data as Listing[]);
    console.error(`Error fetching listings for ${countySlug} (attempt ${attempt}):`, error.message);
    if (attempt === 1) await new Promise((r) => setTimeout(r, 1500));
  }
  return [];
}

function sortListings(rows: Listing[]): Listing[] {
  const tierRank: Record<Tier, number> = { featured: 0, claimed: 1, unclaimed: 2 };
  return rows.sort((a, b) => {
    if (a.tier !== b.tier) return tierRank[a.tier] - tierRank[b.tier];
    if (a.tier === 'featured') return (a.featured_position ?? 99) - (b.featured_position ?? 99);
    return a.licensee_name.localeCompare(b.licensee_name);
  });
}

/**
 * Every live listing in every live county, for building the per-inspector
 * pages. One query per county rather than one for the table: PostgREST caps a
 * select at 1,000 rows and there are more listings than that in total, so a
 * single query would silently drop the tail and build no page for those
 * inspectors, with no error. Sorted the same way the county page is.
 */
export async function getAllListings(countySlugs: string[]): Promise<Listing[]> {
  // Sequential on purpose: four full-county reads fired together is what
  // produced the timeouts the cache above exists for, and a build is not in a
  // hurry.
  const all: Listing[] = [];
  for (const slug of countySlugs) all.push(...(await getListingsForCounty(slug)));
  return all;
}

/**
 * How many live listings each county has, for the homepage county chooser.
 *
 * A HEAD count per county rather than one query grouped client-side, because
 * PostgREST caps a row-returning select at 1,000 and there are already more
 * listings than that across the four counties — a grouped count would silently
 * lose the tail and under-report a county with no error. `head: true` returns
 * only the count and is not subject to that cap.
 */
export async function getListingCounts(slugs: string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(
    slugs.map(async (slug) => {
      const { count, error } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .is('delisted_at', null)
        .eq('county', slug);
      if (error) {
        console.error(`Error counting listings for ${slug}:`, error.message);
        return [slug, 0] as const;
      }
      return [slug, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}
