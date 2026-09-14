#!/usr/bin/env node
/**
 * The licence grace decision, case by case.
 *
 * graceAction decides whether to stop billing somebody, start billing them
 * again, or cancel their subscription outright. A mistake here does not throw:
 * it silently charges an inspector whose card is hidden, or cancels a paying
 * customer who never lapsed. Both are the kind of thing you learn about from
 * the customer, which is the wrong way to learn about it.
 *
 * Usage:  node scripts/licence-grace.test.mjs
 */
import { graceAction, GRACE_DAYS } from '../netlify/lib/featured.mts';

const NOW = new Date('2026-09-14T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const base = {
  license_number: 'HI1422',
  licensee_name: 'Jason Vandomo Hebert',
  county: 'pinellas',
  delisted_at: null,
  claimed_by: 'user-1',
  stripe_subscription_id: 'sub_live',
};
const row = (over) => ({ ...base, ...over });

const failures = [];
const check = (name, got, want) => {
  if (got !== want) failures.push(`${name}\n      wanted ${want}, got ${got}`);
};

// The ordinary state: current licence, billing running. Touch nothing.
check('current licence, not paused', graceAction(row({}), false, NOW), 'none');

// Just lapsed. Their card is already hidden from every page, so stop billing.
check('lapsed today', graceAction(row({ delisted_at: daysAgo(0) }), false, NOW), 'pause');
check('lapsed a week ago', graceAction(row({ delisted_at: daysAgo(7) }), false, NOW), 'pause');

// Already paused. Running the job twice in a day must not pause twice.
check('lapsed and already paused', graceAction(row({ delisted_at: daysAgo(7) }), true, NOW), 'none');

// Renewed inside the window: import-dbpr clears delisted_at, so this is the
// only signal. Resume, and the position never moved.
check('back in the extract while paused', graceAction(row({ delisted_at: null }), true, NOW), 'resume');
check('back in the extract, never paused', graceAction(row({ delisted_at: null }), false, NOW), 'none');

// The boundary. GRACE_DAYS exactly is up: the spot goes.
check('one day short of the grace period', graceAction(row({ delisted_at: daysAgo(GRACE_DAYS - 1) }), true, NOW), 'none');
check('grace period reached exactly', graceAction(row({ delisted_at: daysAgo(GRACE_DAYS) }), true, NOW), 'cancel');
check('long past the grace period', graceAction(row({ delisted_at: daysAgo(120) }), true, NOW), 'cancel');
// Cancel regardless of pause state: a row that somehow never paused still goes.
check('past grace and never paused', graceAction(row({ delisted_at: daysAgo(GRACE_DAYS + 1) }), false, NOW), 'cancel');

// A listing with no subscription is not ours to act on, whatever else is true.
check('no subscription, lapsed', graceAction(row({ delisted_at: daysAgo(90), stripe_subscription_id: null }), false, NOW), 'none');
check('no subscription, current', graceAction(row({ stripe_subscription_id: null }), true, NOW), 'none');

// A corrupt timestamp must never read as "long ago" and cancel somebody.
check('unparseable delisted_at does not cancel', graceAction(row({ delisted_at: 'not a date' }), false, NOW), 'pause');
check('unparseable delisted_at, already paused', graceAction(row({ delisted_at: 'not a date' }), true, NOW), 'none');

// A future timestamp is clock skew, not a licence that lapsed in the future.
check('future delisted_at does not cancel', graceAction(row({ delisted_at: daysAgo(-5) }), false, NOW), 'pause');

if (failures.length > 0) {
  console.error(`\nLicence grace failed ${failures.length} check(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`Licence grace passed: paused on lapse, held ${GRACE_DAYS} days, released after.`);
