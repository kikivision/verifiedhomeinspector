#!/usr/bin/env node
/**
 * Delete every listing whose license is in src/lib/removed.ts.
 *
 * Usage:
 *   node --env-file=.env scripts/remove-listing.mjs            # delete, then rebuild
 *   node --env-file=.env scripts/remove-listing.mjs --dry-run  # show what would go
 *
 * The list in removed.ts is the record; this script only makes the database
 * agree with it. A claimed or featured row is refused — releasing a paying
 * customer is a conversation, not a script — so run set-tier.mjs to unclaimed
 * first if that is really the intent.
 *
 * Deleting fires no rebuild trigger (it listens for updates), so this POSTs
 * the build hook itself. Pushing the removed.ts change to main rebuilds too.
 */
import { REMOVED_LICENSES } from '../src/lib/removed.ts';

const dryRun = process.argv.includes('--dry-run');
const licenses = Object.keys(REMOVED_LICENSES);
if (licenses.length === 0) {
  console.error('removed.ts lists nothing — nothing to do.');
  process.exit(0);
}

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: rows, error } = await supabase
  .from('listings')
  .select('license_number, licensee_name, city, county, tier, claimed_by')
  .in('license_number', licenses);
if (error) throw error;

if (rows.length === 0) {
  console.error(`None of ${licenses.join(', ')} is in the table — already removed.`);
  process.exit(0);
}

const paid = rows.filter((r) => r.tier !== 'unclaimed' || r.claimed_by);
if (paid.length > 0) {
  throw new Error(
    'Refusing to delete a claimed or featured listing: ' +
      paid.map((r) => `${r.license_number} ${r.licensee_name} (${r.tier})`).join(', ') +
      '. Release it with set-tier.mjs first if that is really the intent.',
  );
}

for (const r of rows) {
  console.error(`  ${r.license_number} ${r.licensee_name} (${r.city}, ${r.county}) — ${REMOVED_LICENSES[r.license_number].reason}`);
}
if (dryRun) {
  console.error(`\nDRY RUN — ${rows.length} listing(s) would be deleted.`);
  process.exit(0);
}

const { error: deleteError } = await supabase
  .from('listings')
  .delete()
  .in('license_number', rows.map((r) => r.license_number));
if (deleteError) throw deleteError;
console.error(`\n${rows.length} listing(s) deleted.`);

const hook = process.env.NETLIFY_BUILD_HOOK;
if (hook) {
  const res = await fetch(hook, { method: 'POST' });
  if (!res.ok) throw new Error(`Build hook failed: HTTP ${res.status}`);
  console.error('Rebuild triggered — the pages are gone in a few minutes.');
} else {
  console.error('No NETLIFY_BUILD_HOOK in the environment; push the removed.ts change to main to rebuild.');
}
