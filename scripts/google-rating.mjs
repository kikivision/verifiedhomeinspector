#!/usr/bin/env node
/**
 * Attach an inspector's Google profile to their listing, and refresh the
 * cached rating. See DECISIONS.md 2026-09-23 and src/lib/google-rating.ts.
 *
 * Usage:
 *   node --env-file=.env scripts/google-rating.mjs search HI7816 ["extra words"]
 *       Prints Google's candidates for the listing's business name and city.
 *       Read them; do not attach one on a name alone. A service-area business
 *       (no public address) often does not come back at all — get its place
 *       ID from the "Write a review" link on its Google panel instead.
 *
 *   node --env-file=.env scripts/google-rating.mjs set HI7816 ChIJ...
 *       Attaches the place ID after you have confirmed it is theirs, fetches
 *       the rating once, and prints what Google returned so a wrong ID is
 *       obvious (the name and phone are shown beside the listing's own).
 *
 *   node --env-file=.env scripts/google-rating.mjs refresh [--force]
 *       Re-pulls rating and count for every listing with a place ID whose
 *       cache is older than 25 days (--force: all of them). The same thing
 *       netlify/functions/google-rating-refresh.mts does monthly.
 *
 *   node --env-file=.env scripts/google-rating.mjs clear HI7816
 *       Detaches the place ID and clears the cached numbers.
 *
 * Writing requires SUPABASE_SERVICE_ROLE_KEY; searching only needs
 * GOOGLE_PLACES_API_KEY. Neither triggers a rebuild: run set-tier.mjs
 * --deploy or push a commit when you want the site to show the change.
 */
import { createClient } from '@supabase/supabase-js';
import { searchPlaces, fetchPlace } from '../src/lib/google-rating.ts';

const [cmd, ...rest] = process.argv.slice(2);
const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) die('GOOGLE_PLACES_API_KEY is not set. Run with node --env-file=.env …');

function die(msg) { console.error(msg); process.exit(1); }

function db() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to write.');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function listing(client, license) {
  const { data, error } = await client.from('listings')
    .select('id, license_number, licensee_name, business_name, city, phone, website, tier, google_place_id, google_rating, google_rating_count, google_rating_fetched_at')
    .eq('license_number', license.toUpperCase()).maybeSingle();
  if (error) die(error.message);
  if (!data) die(`No listing with license ${license}.`);
  return data;
}

function printCandidate(c, prefix = '  ') {
  const stars = c.rating == null ? '  - ' : c.rating.toFixed(1);
  console.log(`${prefix}${stars} ★  ${String(c.count).padStart(5)} reviews  ${c.name}${c.serviceArea ? '  (service-area business, no address)' : ''}`);
  console.log(`${prefix}      ${c.address ?? '(no address)'}`);
  console.log(`${prefix}      ${c.phone ?? '-'}   ${c.website ?? '-'}`);
  console.log(`${prefix}      id=${c.id}`);
}

if (cmd === 'search') {
  const [license, extra = ''] = rest;
  if (!license) die('search needs a license number.');
  const l = await listing(db(), license);
  const name = l.business_name || l.licensee_name;
  const query = `${name} ${l.city} FL ${extra}`.trim();
  console.log(`Listing: ${name} · ${l.city} · ${l.phone ?? 'no phone'} · ${l.website ?? 'no website'}`);
  console.log(`Google query: "${query}"\n`);
  const found = await searchPlaces(query, apiKey);
  if (found.length === 0) console.log('  No results. If they have a Google profile, take the place ID from its "Write a review" link and use set.');
  for (const c of found) { printCandidate(c); console.log(); }
} else if (cmd === 'set') {
  const [license, placeId] = rest;
  if (!license || !/^ChIJ[\w-]{10,}$/.test(placeId ?? '')) die('set needs a license number and a place ID starting with ChIJ.');
  const client = db();
  const l = await listing(client, license);
  const place = await fetchPlace(placeId, apiKey);
  if (!place) die(`Google returned nothing for ${placeId}.`);
  console.log(`Listing: ${l.business_name || l.licensee_name} · ${l.phone ?? 'no phone'} · ${l.website ?? 'no website'}`);
  console.log('Google:');
  printCandidate(place);
  const { error } = await client.from('listings').update({
    google_place_id: placeId,
    google_rating: place.rating,
    google_rating_count: place.count,
    google_rating_fetched_at: new Date().toISOString(),
  }).eq('id', l.id);
  if (error) die(error.message);
  console.log(`\nAttached. ${l.license_number} now shows ${place.rating?.toFixed(1) ?? '-'} ★ (${place.count}) once the site rebuilds.`);
  if (l.tier === 'unclaimed') console.log('NOTE: this listing is unclaimed, so nothing renders until it is claimed. That is by design.');
} else if (cmd === 'clear') {
  const [license] = rest;
  if (!license) die('clear needs a license number.');
  const client = db();
  const l = await listing(client, license);
  const { error } = await client.from('listings').update({
    google_place_id: null, google_rating: null, google_rating_count: null, google_rating_fetched_at: null,
  }).eq('id', l.id);
  if (error) die(error.message);
  console.log(`Cleared ${l.license_number}.`);
} else if (cmd === 'refresh') {
  const force = rest.includes('--force');
  const client = db();
  const { refreshGoogleRatings } = await import('../netlify/lib/google-rating.mts');
  const result = await refreshGoogleRatings(client, apiKey, { force });
  console.log(result.lines.join('\n') || 'Nothing due.');
} else {
  die('Usage: google-rating.mjs search <license> | set <license> <placeId> | clear <license> | refresh [--force]');
}
