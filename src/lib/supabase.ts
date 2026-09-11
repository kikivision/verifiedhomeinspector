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
  created_at: string;
}

/**
 * Fetches all listings for a county, sorted the way the site should
 * actually display them: featured first (by position), then claimed,
 * then unclaimed — matching the tier ladder, not just an alphabetical dump.
 */
export async function getListingsForCounty(countySlug: string): Promise<Listing[]> {
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

  if (error) {
    console.error('Error fetching listings:', error.message);
    return [];
  }

  const tierRank: Record<Tier, number> = { featured: 0, claimed: 1, unclaimed: 2 };
  return (data as Listing[]).sort((a, b) => {
    if (a.tier !== b.tier) return tierRank[a.tier] - tierRank[b.tier];
    if (a.tier === 'featured') return (a.featured_position ?? 99) - (b.featured_position ?? 99);
    return a.licensee_name.localeCompare(b.licensee_name);
  });
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
