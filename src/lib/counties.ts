export interface County {
  slug: string;
  name: string;
  status: 'live' | 'coming_soon';
  /**
   * The city people actually search for, when it is not the county name.
   * Nobody searches "Orange County home inspector" — they search Orlando, and
   * "Orange County" without a state reads as California to most of the web.
   *
   * Used for the page title, the meta description and the H1, which is where a
   * search term earns its keep. Everything else — the county tag above the H1,
   * the county selector, the hidden field on every form — stays on `name`, so
   * the precise geography is still on the page and a form submission still
   * arrives labelled with a real county.
   */
  metro?: string;
}

// Add a county here when its DBPR data has been pulled and imported.
// This is the ONLY place that needs to change to bring a new county
// online — pages, nav, and the selector all read from this list.
//
// Statewide since 2026-09-12: every Florida county with five or more licensed
// inspectors, alphabetical. The nine smaller ones are listed in
// scripts/import-dbpr.mjs. `metro` is set where the city people search is
// not the county name — Miami for Miami-Dade, Jacksonville for Duval — and
// left off where the county name is what people say (Palm Beach, Sarasota,
// Pasco, Pinellas).
export const counties: County[] = [
  { slug: 'alachua', name: 'Alachua County', status: 'live', metro: 'Gainesville' },
  { slug: 'baker', name: 'Baker County', status: 'live' },
  { slug: 'bay', name: 'Bay County', status: 'live', metro: 'Panama City' },
  { slug: 'bradford', name: 'Bradford County', status: 'live' },
  { slug: 'brevard', name: 'Brevard County', status: 'live', metro: 'Melbourne' },
  { slug: 'broward', name: 'Broward County', status: 'live', metro: 'Fort Lauderdale' },
  { slug: 'charlotte', name: 'Charlotte County', status: 'live', metro: 'Port Charlotte' },
  { slug: 'citrus', name: 'Citrus County', status: 'live' },
  { slug: 'clay', name: 'Clay County', status: 'live' },
  { slug: 'collier', name: 'Collier County', status: 'live', metro: 'Naples' },
  { slug: 'columbia', name: 'Columbia County', status: 'live', metro: 'Lake City' },
  { slug: 'desoto', name: 'DeSoto County', status: 'live' },
  { slug: 'duval', name: 'Duval County', status: 'live', metro: 'Jacksonville' },
  { slug: 'escambia', name: 'Escambia County', status: 'live', metro: 'Pensacola' },
  { slug: 'flagler', name: 'Flagler County', status: 'live', metro: 'Palm Coast' },
  { slug: 'gadsden', name: 'Gadsden County', status: 'live' },
  { slug: 'gilchrist', name: 'Gilchrist County', status: 'live' },
  { slug: 'gulf', name: 'Gulf County', status: 'live' },
  { slug: 'hardee', name: 'Hardee County', status: 'live' },
  { slug: 'hendry', name: 'Hendry County', status: 'live' },
  { slug: 'hernando', name: 'Hernando County', status: 'live', metro: 'Spring Hill' },
  { slug: 'highlands', name: 'Highlands County', status: 'live', metro: 'Sebring' },
  { slug: 'hillsborough', name: 'Hillsborough County', status: 'live', metro: 'Tampa' },
  { slug: 'indian-river', name: 'Indian River County', status: 'live', metro: 'Vero Beach' },
  { slug: 'jackson', name: 'Jackson County', status: 'live' },
  { slug: 'lake', name: 'Lake County', status: 'live' },
  { slug: 'lee', name: 'Lee County', status: 'live', metro: 'Fort Myers' },
  { slug: 'leon', name: 'Leon County', status: 'live', metro: 'Tallahassee' },
  { slug: 'levy', name: 'Levy County', status: 'live' },
  { slug: 'manatee', name: 'Manatee County', status: 'live', metro: 'Bradenton' },
  { slug: 'marion', name: 'Marion County', status: 'live', metro: 'Ocala' },
  { slug: 'martin', name: 'Martin County', status: 'live', metro: 'Stuart' },
  { slug: 'miami-dade', name: 'Miami-Dade County', status: 'live', metro: 'Miami' },
  { slug: 'monroe', name: 'Monroe County', status: 'live', metro: 'the Florida Keys' },
  { slug: 'nassau', name: 'Nassau County', status: 'live' },
  { slug: 'okaloosa', name: 'Okaloosa County', status: 'live' },
  { slug: 'okeechobee', name: 'Okeechobee County', status: 'live' },
  { slug: 'orange', name: 'Orange County', status: 'live', metro: 'Orlando' },
  { slug: 'osceola', name: 'Osceola County', status: 'live', metro: 'Kissimmee' },
  { slug: 'palm-beach', name: 'Palm Beach County', status: 'live' },
  { slug: 'pasco', name: 'Pasco County', status: 'live' },
  { slug: 'pinellas', name: 'Pinellas County', status: 'live' },
  { slug: 'polk', name: 'Polk County', status: 'live', metro: 'Lakeland' },
  { slug: 'putnam', name: 'Putnam County', status: 'live' },
  { slug: 'santa-rosa', name: 'Santa Rosa County', status: 'live' },
  { slug: 'sarasota', name: 'Sarasota County', status: 'live' },
  { slug: 'seminole', name: 'Seminole County', status: 'live' },
  { slug: 'st-johns', name: 'St. Johns County', status: 'live', metro: 'St. Augustine' },
  { slug: 'st-lucie', name: 'St. Lucie County', status: 'live', metro: 'Port St. Lucie' },
  { slug: 'sumter', name: 'Sumter County', status: 'live', metro: 'The Villages' },
  { slug: 'suwannee', name: 'Suwannee County', status: 'live' },
  { slug: 'union', name: 'Union County', status: 'live' },
  { slug: 'volusia', name: 'Volusia County', status: 'live', metro: 'Daytona Beach' },
  { slug: 'wakulla', name: 'Wakulla County', status: 'live' },
  { slug: 'walton', name: 'Walton County', status: 'live' },
  { slug: 'washington', name: 'Washington County', status: 'live' },
];

export function getCounty(slug: string): County | undefined {
  return counties.find((c) => c.slug === slug);
}

/** What to call a county in a title, description or heading. */
export function searchName(county: County): string {
  return county.metro ?? county.name;
}
