/**
 * The services an inspector can pick on their dashboard.
 *
 * A fixed list rather than free text so that two inspectors who do the same
 * thing carry the same tag, which is what a service filter — or a per-city
 * insurance page — needs. Order is the order they render in.
 *
 * The list is enforced in the database too: public.allowed_services() in
 * supabase/migrations/2026-09-12-self-serve-claims.sql carries the same names,
 * update_my_listing rejects anything else, and a check constraint on
 * listings.specialties is the backstop for admin scripts. Change a name here
 * and it has to change there in the same commit, or the dashboard save fails
 * with "Unknown service".
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
  'Termite (WDO)',
  'Sewer Scope',
  'Commercial',
] as const;

export type Specialty = (typeof SPECIALTIES)[number];

/**
 * The insurance side of the business. A buyer orders a home inspection once;
 * a homeowner is sent for one of these every time a carrier asks, which in
 * Florida is at renewal and after most storms. Kept as a named subset so a
 * city page for "4-point and wind mitigation in St. Petersburg" can be built
 * from claims alone, once enough inspectors in a city have ticked them.
 */
export const INSURANCE_SPECIALTIES: readonly Specialty[] = [
  '4-Point Inspection',
  'Wind Mitigation',
  'Roof Certification',
];

export const isInsuranceSpecialty = (s: string): boolean =>
  (INSURANCE_SPECIALTIES as readonly string[]).includes(s);
