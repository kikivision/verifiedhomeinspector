export interface County {
  slug: string;
  name: string;
  status: 'live' | 'coming_soon';
}

// Add a county here when its DBPR data has been pulled and imported.
// This is the ONLY place that needs to change to bring a new county
// online — pages, nav, and the selector all read from this list.
export const counties: County[] = [
  { slug: 'pinellas', name: 'Pinellas County', status: 'live' },
  { slug: 'hillsborough', name: 'Hillsborough County', status: 'coming_soon' },
  { slug: 'pasco', name: 'Pasco County', status: 'coming_soon' },
];

export function getCounty(slug: string): County | undefined {
  return counties.find((c) => c.slug === slug);
}
