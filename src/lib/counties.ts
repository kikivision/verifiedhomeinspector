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
export const counties: County[] = [
  { slug: 'pinellas', name: 'Pinellas County', status: 'live' },
  { slug: 'hillsborough', name: 'Hillsborough County', status: 'live', metro: 'Tampa' },
  { slug: 'pasco', name: 'Pasco County', status: 'live' },
  { slug: 'orange', name: 'Orange County', status: 'live', metro: 'Orlando' },
];

export function getCounty(slug: string): County | undefined {
  return counties.find((c) => c.slug === slug);
}

/** What to call a county in a title, description or heading. */
export function searchName(county: County): string {
  return county.metro ?? county.name;
}
