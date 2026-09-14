#!/usr/bin/env node
/**
 * The county gate, checked case by case.
 *
 * assertCountyHasRoom is the only thing standing between a full county and a
 * card we cannot deliver: past it, the buyer is charged $50/month for a spot
 * on a page whose own copy promises never more than COUNTY_FEATURED_CAP. A
 * mistake here does not throw anywhere — it shows up as a seventh card on a
 * page that says six, or as a paid listing with no county placement at all.
 *
 * The database is stubbed: nextPosition issues one query and these cases are
 * about what it does with the answer, not about Supabase.
 *
 * Usage:  node scripts/county-gate.test.mjs
 */
import { assertCountyHasRoom, nextPosition } from '../netlify/lib/featured.mts';
import { COUNTY_FEATURED_CAP } from '../src/lib/cities.ts';

/** A Supabase client that answers one listings query with these rows. */
function stubDb(positions, error = null) {
  const result = { data: positions.map((featured_position) => ({ featured_position })), error };
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    not: () => chain,
    then: (resolve) => resolve(result),
  };
  return chain;
}

const listing = { county: 'pinellas', license_number: 'HI1422' };
const failures = [];
function check(name, condition, detail) {
  if (condition) return;
  failures.push(detail ? `${name}\n      ${detail}` : name);
}

async function refused(db) {
  try {
    await assertCountyHasRoom(db, listing);
    return null;
  } catch (err) {
    return err;
  }
}

// An empty county sells position 1, not 0 and not null.
check('empty county gives position 1', (await nextPosition(stubDb([]), 'pinellas')) === 1);

// Partly sold: the lowest free number, so a cancellation is reused rather
// than leaving a hole in the row.
check('gaps are reused before new numbers',
  (await nextPosition(stubDb([1, 3]), 'pinellas')) === 2,
  'A cancelled position 2 must be the next one sold, or the row grows holes.');
check('sells the last free position',
  (await nextPosition(stubDb([1, 2, 3, 4, 5]), 'pinellas')) === COUNTY_FEATURED_CAP);

// The whole point.
const full = Array.from({ length: COUNTY_FEATURED_CAP }, (_, i) => i + 1);
const err = await refused(stubDb(full));
check('a full county is refused', err !== null, 'assertCountyHasRoom returned instead of throwing.');
check('refusal is a 409', err?.status === 409, `status was ${err?.status}`);
check('refusal names the number of spots', /All 6 featured spots/.test(err?.message ?? ''),
  `message was ${JSON.stringify(err?.message)}`);

// Rows past the cap must not wrap around and hand out a position again.
check('over-full county is still refused', (await refused(stubDb([...full, 7]))) !== null);

// A county with room is not refused, and hands back the position it will get.
check('a county with room returns its position', (await assertCountyHasRoom(stubDb([1, 2]), listing)) === 3);

// Nulls never count as a taken position: a paid listing that lost the race
// carries one, and it must not consume a spot nobody can see.
check('null positions do not consume a spot',
  (await nextPosition(stubDb([1, null, 2]), 'pinellas')) === 3,
  'A null featured_position is a listing with no county placement, not a holder of one.');

if (failures.length > 0) {
  console.error(`\nCounty gate failed ${failures.length} check(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`County gate passed: ${COUNTY_FEATURED_CAP} spots per county, full counties refused.`);
