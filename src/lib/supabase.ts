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
  bio: string | null;
  specialties: string[];
  cert_badges: string[];
  photo_urls: string[];
  featured_position: number | null;
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
