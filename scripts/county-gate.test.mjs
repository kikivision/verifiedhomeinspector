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

/**
 * A Supabase client that answers one listings query with these rows, and
 * RECORDS the chain it was asked for. The first version of this stub returned
 * the same answer whatever was called on it, so deleting a .eq() or .is()
 * filter from the real query left every case green — the stub was testing the
 * arithmetic and pretending to test the query.
 */
function stubDb(positions, error = null) {
  const result = { data: positions.map((featured_position) => ({ featured_position })), error };
  const calls = [];
  // String(), not join's default: Array#join turns null into an empty string,
  // so `.is('delisted_at', null)` recorded as "is delisted_at " and no probe
  // for a null-valued filter could ever match.
  const record = (name) => (...args) => { calls.push([name, ...args.map(String)].join(' ')); return chain; };
  const chain = {
    calls,
    from: record('from'),
    select: record('select'),
    eq: record('eq'),
    is: record('is'),
    not: record('not'),
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
  'A canceled position 2 must be the next one sold, or the row grows holes.');
check('sells the last free position',
  (await nextPosition(stubDb([1, 2, 3, 4, 5]), 'pinellas')) === COUNTY_FEATURED_CAP);

// The whole point.
const full = Array.from({ length: COUNTY_FEATURED_CAP }, (_, i) => i + 1);
const err = await refused(stubDb(full));
check('a full county is refused', err !== null, 'assertCountyHasRoom returned instead of throwing.');
check('refusal is a 409', err?.status === 409, `status was ${err?.status}`);
check('refusal names the number of spots',
  new RegExp(`All ${COUNTY_FEATURED_CAP} featured spots`).test(err?.message ?? ''),
  `message was ${JSON.stringify(err?.message)}`);

// A stored position above the cap must not be read as "nothing in 1..6 is
// taken". The earlier version of this case fed [...full, 7], which every
// implementation refuses because all six are already taken — it proved
// nothing. [7] alone is the case that bites: six spots stand empty.
check('a position above the cap does not block the free ones',
  (await nextPosition(stubDb([7]), 'pinellas')) === 1,
  'A 7 is out of range, not a holder of position 1.');

// A failed query must surface, not read as an empty county and sell position 1.
let queryError = null;
try {
  await nextPosition(stubDb([], { message: 'connection reset' }), 'pinellas');
} catch (e) {
  queryError = e;
}
check('a failed query throws rather than selling position 1', queryError?.status === 500,
  `got ${queryError === null ? 'no error' : `status ${queryError.status}`}`);

// A county with room is not refused, and hands back the position it will get.
check('a county with room returns its position', (await assertCountyHasRoom(stubDb([1, 2]), listing)) === 3);

// Nulls never count as a taken position: a paid listing that lost the race
// carries one, and it must not consume a spot nobody can see. This holds for
// any implementation, because the loop compares against numbers — it is here
// to pin the behaviour, not to catch a likely bug.
check('null positions do not consume a spot',
  (await nextPosition(stubDb([1, null, 2]), 'pinellas')) === 3,
  'A null featured_position is a listing with no county placement, not a holder of one.');

// The query itself, not just what is done with the answer. Each of these
// filters is load-bearing and none of them is visible in the returned rows:
// drop the county and every county shares one set of six positions; drop the
// tier and a claimed listing's stale position blocks a sale. An earlier stub
// could not see any of this. (Delisted is deliberately NOT filtered here; the
// case below says why.)
const probe = stubDb([1]);
await nextPosition(probe, 'pinellas');
for (const [what, needle] of [
  ['scope to the county', 'eq county pinellas'],
  ['count only featured rows', 'eq tier featured'],
  ['read the listings table', 'from listings'],
]) {
  check(`nextPosition must ${what}`, probe.calls.includes(needle),
    `The query was: ${probe.calls.join(' | ')}`);
}

// The absence of a filter, pinned deliberately. A delisted featured row still
// occupies (county, featured_position) in uniq_featured_slot_per_county, and
// import-dbpr sets delisted_at without touching tier or position. Filtering
// here was tried on 2026-09-14 and is the wrong direction: it hands out a
// position the index already holds, so the gate passes, the card is taken, and
// the UPDATE in fulfill fails 23505 while Stripe retries and the trial expires.
// Counting a delisted row as taken refuses the sale, which is the safe answer.
check('nextPosition must NOT skip delisted rows',
  !probe.calls.includes('is delisted_at null'),
  `The query was: ${probe.calls.join(' | ')}. See DECISIONS.md 2026-09-14.`);

if (failures.length > 0) {
  console.error(`\nCounty gate failed ${failures.length} check(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`County gate passed: ${COUNTY_FEATURED_CAP} spots per county, full counties refused.`);
