#!/usr/bin/env node
/**
 * Move a listing between tiers when an inspector claims, upgrades or cancels.
 *
 * This exists so that changing a paying customer's listing is never a hand-typed
 * SQL statement against the live table. It checks what it is about to do, tells
 * you what changed, and refuses anything it cannot verify.
 *
 * Usage:
 *   node scripts/set-tier.mjs HI3532 claimed \
 *     --business "Inspect Florida LLC" --phone "(727) 222-5955"
 *   node scripts/set-tier.mjs HI3532 featured --position 3
 *   node scripts/set-tier.mjs HI3532 unclaimed        # they cancelled, or revoke a claim
 *   node scripts/set-tier.mjs HI3532 claimed --dry-run
 *
 * Flags:
 *   --business, --phone          details the inspector is paying to show
 *   --specialties "A, B, C"      comma-separated, replaces the list outright
 *   --experience N               years in business, shown as "N+ years"
 *   --logo /logos/name.png       brand mark; site-relative, committed to public/
 *   --position N                 featured slot, 1-6, required for featured
 *   --cities "Largo, Clearwater"  city pages the featured card shows on, up to
 *                                three; two cards per city, so this checks
 *                                both counts. Empty means the listing's own city
 *   --dry-run                    print the change, write nothing
 *   --deploy                     trigger a rebuild so the change goes live
 *
 * The site is statically built, so a tier change is invisible to visitors until
 * the site rebuilds. Either pass --deploy (needs NETLIFY_BUILD_HOOK) or trigger
 * a deploy in Netlify afterwards.
 *
 * Writing requires SUPABASE_SERVICE_ROLE_KEY: the anon key the site uses is
 * read-only, and changing tiers is an admin operation.
 */

const TIERS = ['unclaimed', 'claimed', 'featured'];
// The county page's ceiling (FEATURED_TARGET there): positions 1-4. The page
// advertises two open slots while building out, but a paid card past two still
// renders, so the script allows the ceiling rather than the advertised count.
const FEATURED_CAP = 4;
// Kept in step with the same names in src/lib/cities.ts.
const CITY_FEATURED_CAP = 2;
const MAX_FEATURED_CITIES = 3;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (name === 'dry-run' || name === 'deploy') {
      flags[name] = true;
    } else {
      flags[name] = argv[++i];
    }
  }
  return { positional, flags };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [licenseArg, tier] = positional;

  if (!licenseArg || !tier) {
    throw new Error(
      'Usage: node scripts/set-tier.mjs <LICENSE> <unclaimed|claimed|featured> [flags]',
    );
  }
  const license = licenseArg.trim().toUpperCase();
  if (!TIERS.includes(tier)) {
    throw new Error(`Unknown tier "${tier}". Use one of: ${TIERS.join(', ')}`);
  }

  // Range-check the slot here rather than after the read: it needs no database
  // to know 9 is not a valid slot, and failing before connecting keeps an
  // obvious typo from looking like a backend problem.
  let position = null;
  if (tier === 'featured') {
    position = Number(flags.position);
    if (!Number.isInteger(position) || position < 1 || position > FEATURED_CAP) {
      throw new Error(
        `--position must be a whole number 1-${FEATURED_CAP} for a featured listing.`,
      );
    }
  }

  const url = process.env.PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: listing, error: readError } = await supabase
    .from('listings')
    .select('*')
    .eq('license_number', license)
    .maybeSingle();
  if (readError) throw readError;
  if (!listing) {
    throw new Error(
      `No listing with license ${license}. Check the number against the site — ` +
        `it is the DBPR alternate license format, e.g. HI3532.`,
    );
  }

  // Selling a spot to someone the state no longer lists would break the one
  // promise this site makes, so it has to be a deliberate act, not a flag.
  if (listing.delisted_at && tier !== 'unclaimed') {
    throw new Error(
      `${license} (${listing.licensee_name}) is delisted: they stopped appearing ` +
        `in the DBPR extract on ${listing.delisted_at.slice(0, 10)}. Confirm their ` +
        `license is current with DBPR and clear delisted_at before selling them a spot.`,
    );
  }

  const update = { tier };

  if (tier === 'featured') {
    const { data: holders, error: slotError } = await supabase
      .from('listings')
      .select('license_number, licensee_name, featured_position')
      .eq('county', listing.county)
      .eq('tier', 'featured')
      .eq('featured_position', position);
    if (slotError) throw slotError;

    const clash = holders.find((h) => h.license_number !== license);
    if (clash) {
      throw new Error(
        `Featured slot ${position} in ${listing.county} already belongs to ` +
          `${clash.licensee_name} (${clash.license_number}). Pick another slot or move them first.`,
      );
    }
    update.featured_position = position;

    // Which city pages carry the card. Each name must be a city with listings
    // in this county, and no city may end up with more cards than it has
    // spots: a third card in a two-spot row is someone paying for a
    // placement that does not render.
    if (flags.cities !== undefined) {
      const wanted = [...new Set(flags.cities.split(',').map((c) => c.trim()).filter(Boolean))];
      if (wanted.length > MAX_FEATURED_CITIES) {
        throw new Error(
          `${wanted.length} cities named; a featured listing covers up to ${MAX_FEATURED_CITIES}. ` +
            `More than that is a separate conversation, not a flag.`,
        );
      }
      const { data: countyRows, error: cityError } = await supabase
        .from('listings')
        .select('license_number, city, tier, featured_cities')
        .eq('county', listing.county)
        .is('delisted_at', null);
      if (cityError) throw cityError;
      const known = new Set(countyRows.map((r) => r.city));
      for (const city of wanted) {
        if (!known.has(city)) {
          throw new Error(
            `"${city}" is not a city with listings in ${listing.county}. ` +
              `Spell it as the site does (e.g. "St. Petersburg"), and check the county page.`,
          );
        }
        const holders = countyRows.filter((r) => {
          if (r.tier !== 'featured' || r.license_number === license) return false;
          const cities = r.featured_cities?.length ? r.featured_cities : [r.city];
          return cities.includes(city);
        });
        if (holders.length >= CITY_FEATURED_CAP) {
          throw new Error(
            `${city} already has ${holders.length} featured card(s): ` +
              `${holders.map((h) => h.license_number).join(', ')}. The cap is ${CITY_FEATURED_CAP}.`,
          );
        }
      }
      update.featured_cities = wanted;
    }
  } else {
    // Only featured listings hold a slot; leaving a stale one behind would let a
    // downgraded listing silently block a slot someone else is paying for.
    update.featured_position = null;
    update.featured_cities = [];
  }

  if (tier === 'unclaimed') {
    // Cancelling returns the row to what an import would produce, so the next
    // import has nothing to disagree with. Their details go rather than linger
    // on a listing they no longer pay for.
    //
    // This is also how a self-serve claim is revoked: clearing claimed_by
    // detaches the account, so the same person cannot simply reload their
    // dashboard and find the listing still theirs. They can claim again, which
    // is fine for an honest mistake and visible in the inbox for anything else.
    update.business_name = null;
    update.phone = null;
    update.website = null;
    update.about = null;
    update.specialties = [];
    update.service_cities = [];
    update.years_experience = null;
    update.logo_path = null;
    update.claimed_at = null;
    update.claimed_by = null;
  } else {
    update.claimed_at = listing.claimed_at ?? new Date().toISOString();
    if (flags.business !== undefined) update.business_name = flags.business;
    if (flags.phone !== undefined) update.phone = flags.phone;
    // Replaces the list rather than appending: an inspector who drops a service
    // needs a way to remove it, and --specialties "" is that way. Appending
    // would make removal impossible without hand-written SQL, which is the one
    // thing this script exists to avoid.
    if (flags.logo !== undefined) {
      // Site-relative only. An absolute URL would put a third-party host in the
      // render path of a paid card, so the file is committed to public/ and
      // served from our own domain.
      if (flags.logo && !flags.logo.startsWith('/')) {
        throw new Error(`--logo must be a site-relative path like /logos/name.png, got "${flags.logo}".`);
      }
      update.logo_path = flags.logo || null;
    }
    if (flags.experience !== undefined) {
      const years = Number(flags.experience);
      if (!Number.isInteger(years) || years < 0 || years > 80) {
        throw new Error(`--experience must be a whole number of years, got "${flags.experience}".`);
      }
      update.years_experience = years;
    }
    if (flags.specialties !== undefined) {
      update.specialties = flags.specialties
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  const changes = Object.entries(update)
    // Compared as JSON because specialties is an array: === on two arrays is
    // always false, so every run would report a change and the "nothing to
    // change" guard below would never fire.
    .filter(([key, value]) => JSON.stringify(listing[key]) !== JSON.stringify(value))
    .map(([key, value]) => `  ${key}: ${JSON.stringify(listing[key])} -> ${JSON.stringify(value)}`);

  console.error(`${listing.licensee_name} (${license}) in ${listing.city}, ${listing.county}`);
  if (changes.length === 0) {
    console.error('  already in that state — nothing to change');
    return;
  }
  console.error(changes.join('\n'));

  if (flags['dry-run']) {
    console.error('\nDRY RUN — nothing written');
    return;
  }

  const { error: writeError } = await supabase
    .from('listings')
    .update(update)
    .eq('license_number', license);
  if (writeError) throw writeError;
  console.error('\nSaved.');

  const hook = process.env.NETLIFY_BUILD_HOOK;
  if (flags.deploy) {
    if (!hook) throw new Error('--deploy needs NETLIFY_BUILD_HOOK set to a Netlify build hook URL.');
    const res = await fetch(hook, { method: 'POST' });
    if (!res.ok) throw new Error(`Build hook failed: HTTP ${res.status}`);
    console.error('Rebuild triggered — live in a minute or so.');
  } else {
    console.error(
      'The site is statically built, so this is not visible to visitors yet. ' +
        'Re-run with --deploy, or trigger a deploy in Netlify.',
    );
  }
}

main().catch((err) => {
  console.error(`\n${err.message ?? err}`);
  process.exit(1);
});
