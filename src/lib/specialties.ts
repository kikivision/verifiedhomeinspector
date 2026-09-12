/**
 * The services an inspector can pick on their dashboard.
 *
 * A fixed list rather than free text so that two inspectors who do the same
 * thing carry the same tag, which is what a service filter on the county page
 * will need. Order is the order they render in.
 */
export const SPECIALTIES = [
  'Full Home Inspection',
  '4-Point Inspection',
  'Wind Mitigation',
  'Roof Certification',
  'Pre-Listing Inspection',
  'New Construction',
  'Mold & Air Quality',
  'Pool & Spa',
] as const;

export type Specialty = (typeof SPECIALTIES)[number];
