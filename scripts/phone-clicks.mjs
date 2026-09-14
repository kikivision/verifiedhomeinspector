#!/usr/bin/env node
/**
 * Who got called, and which channel sent them.
 *
 * The report behind two different questions. "Your page got 14 calls last
 * month" is what an inspector is paying for and what sells the next featured
 * spot. "11 of them came from the ads" is what says whether the ad budget
 * stays. Both come out of listing_events; this prints them together so the
 * second is never quoted without the first.
 *
 * Usage:
 *   node --env-file=.env scripts/phone-clicks.mjs                 # last 30 days
 *   node --env-file=.env scripts/phone-clicks.mjs --days 7
 *   node --env-file=.env scripts/phone-clicks.mjs --county pinellas
 *
 * Reads with the service-role key: the anon key may INSERT into
 * listing_events and may never SELECT, which is what stops one inspector
 * reading another's numbers out of the browser.
 */
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const days = Number(flag('days', 30));
const county = flag('county', null);
if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be a positive number.');

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(url, key, { auth: { persistSession: false } });

const since = new Date(Date.now() - days * 86400000).toISOString();
const { data: events, error } = await supabase
  .from('listing_events')
  .select('listing_id, event_type, page_context, source, occurred_at')
  .eq('event_type', 'click_phone')
  .gte('occurred_at', since);
if (error) throw error;

if (!events.length) {
  console.log(`No phone clicks in the last ${days} days.`);
  process.exit(0);
}

const { data: listings, error: listingError } = await supabase
  .from('listings')
  .select('id, license_number, licensee_name, business_name, city, county, tier')
  .in('id', [...new Set(events.map((e) => e.listing_id))]);
if (listingError) throw listingError;
const byId = new Map(listings.map((l) => [l.id, l]));

const rows = events.filter((e) => !county || byId.get(e.listing_id)?.county === county);
if (!rows.length) {
  console.log(`No phone clicks in the last ${days} days${county ? ` in ${county}` : ''}.`);
  process.exit(0);
}

// A source of null predates the column; say so rather than printing "null".
const label = (s) => s ?? '(before tracking)';

const bySource = new Map();
for (const e of rows) bySource.set(label(e.source), (bySource.get(label(e.source)) ?? 0) + 1);

const perListing = new Map();
for (const e of rows) {
  const entry = perListing.get(e.listing_id) ?? { total: 0, sources: new Map() };
  entry.total += 1;
  entry.sources.set(label(e.source), (entry.sources.get(label(e.source)) ?? 0) + 1);
  perListing.set(e.listing_id, entry);
}

console.log(`Phone clicks, last ${days} days${county ? ` — ${county}` : ''}: ${rows.length}\n`);

console.log('By source');
for (const [source, n] of [...bySource].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${source}  (${Math.round((100 * n) / rows.length)}%)`);
}

console.log('\nBy listing');
const sorted = [...perListing].sort((a, b) => b[1].total - a[1].total);
for (const [id, entry] of sorted) {
  const l = byId.get(id);
  const who = l ? `${l.business_name || l.licensee_name} (${l.license_number}, ${l.city})` : id;
  const split = [...entry.sources].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(', ');
  console.log(`  ${String(entry.total).padStart(4)}  ${l?.tier === 'featured' ? '★' : ' '} ${who}`);
  console.log(`        ${split}`);
}

const paid = [...bySource].filter(([s]) => s === 'google_ads' || s.startsWith('paid_')).reduce((n, [, v]) => n + v, 0);
if (paid > 0) {
  console.log(`\n${paid} of ${rows.length} clicks came from paid traffic.`);
  console.log('Divide the spend for this window by that number for a cost per phone click.');
}
