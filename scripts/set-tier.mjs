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
 *   node scripts/set-tier.mjs HI3532 unclaimed        # they cancelled
 *   node scripts/set-tier.mjs HI3532 claimed --dry-run
 *
 * Flags:
 *   --business, --phone, --bio   details the inspector is paying to show
 *   --position N                 featured slot, 1-6, required for featured
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
// Kept in step with the page's cap. The database check allows up to 6, so this
// enforces current policy rather than the schema's outer limit.
const FEATURED_CAP = 3;

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
  } else {
    // Only featured listings hold a slot; leaving a stale one behind would let a
    // downgraded listing silently block a slot someone else is paying for.
    update.featured_position = null;
  }

  if (tier === 'unclaimed') {
    // Cancelling returns the row to what an import would produce, so the next
    // import has nothing to disagree with. Their details go rather than linger
    // on a listing they no longer pay for.
    update.business_name = null;
    update.phone = null;
    update.bio = null;
    update.claimed_at = null;
  } else {
    update.claimed_at = listing.claimed_at ?? new Date().toISOString();
    if (flags.business !== undefined) update.business_name = flags.business;
    if (flags.phone !== undefined) update.phone = flags.phone;
    if (flags.bio !== undefined) update.bio = flags.bio;
  }

  const changes = Object.entries(update)
    .filter(([key, value]) => listing[key] !== value)
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
