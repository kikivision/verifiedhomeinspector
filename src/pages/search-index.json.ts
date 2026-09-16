// The statewide search index behind the box on the home page: one row per
// live listing, as arrays rather than objects so the file stays small enough
// to fetch on focus (about 7,200 rows). The page path is not in here; the
// script rebuilds it with inspectorPath, the same function the pages use, so
// the two cannot drift.
//
// Row: [license, licensee name, business name or "", city, county slug, flags]
// flags: bit 1 = claimed, bit 2 = a phone number shows on the page.
import type { APIRoute } from 'astro';
import { counties } from '../lib/counties';
import { getAllListings, isClaimed, hasPublicContact } from '../lib/supabase';

export const GET: APIRoute = async () => {
  const live = counties.filter((c) => c.status === 'live');
  const all = await getAllListings(live.map((c) => c.slug));
  const rows = all.map((l) => [
    l.license_number,
    l.licensee_name,
    l.business_name ?? '',
    l.city,
    l.county,
    (isClaimed(l) ? 1 : 0) | (l.phone && (isClaimed(l) || hasPublicContact(l)) ? 2 : 0),
  ]);
  const names = Object.fromEntries(live.map((c) => [c.slug, c.name]));
  return new Response(JSON.stringify({ counties: names, rows }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
