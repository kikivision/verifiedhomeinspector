#!/usr/bin/env node
/**
 * The license grace decision, case by case.
 *
 * graceAction decides whether to stop billing somebody, start billing them
 * again, or cancel their subscription outright. A mistake here does not throw:
 * it silently charges an inspector whose card is hidden, or cancels a paying
 * customer who never lapsed. Both are the kind of thing you learn about from
 * the customer, which is the wrong way to learn about it.
 *
 * Usage:  node scripts/license-grace.test.mjs
 */
import { graceAction, GRACE_DAYS, GRACE_WARN_DAYS } from '../netlify/lib/featured.mts';

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

// The ordinary state: current license, billing running. Touch nothing.
check('current license, not paused', graceAction(row({}), 'none', NOW), 'none');

// Just lapsed. Their card is already hidden from every page, so stop billing.
check('lapsed today', graceAction(row({ delisted_at: daysAgo(0) }), 'none', NOW), 'pause');
check('lapsed a week ago', graceAction(row({ delisted_at: daysAgo(7) }), 'none', NOW), 'pause');

// Already paused by us. Running the job twice in a day must not pause twice.
check('lapsed and already paused by us', graceAction(row({ delisted_at: daysAgo(7) }), 'ours', NOW), 'none');

// Renewed inside the window: import-dbpr clears delisted_at, so this is the
// only signal. Resume, and the position never moved.
check('back in the extract, we paused it', graceAction(row({ delisted_at: null }), 'ours', NOW), 'resume');
check('back in the extract, never paused', graceAction(row({ delisted_at: null }), 'none', NOW), 'none');

// Somebody paused this by hand in the Stripe dashboard — a comped month, a
// dispute. Lifting it, and mailing the inspector that billing has restarted,
// is not this job's business, and nor is counting down to a cancel on it.
check('back in the extract, somebody else paused it', graceAction(row({ delisted_at: null }), 'theirs', NOW), 'none');
check('lapsed, somebody else paused it', graceAction(row({ delisted_at: daysAgo(7) }), 'theirs', NOW), 'none');
check('long lapsed but paused by hand, still no warn', graceAction(row({ delisted_at: daysAgo(GRACE_WARN_DAYS) }), 'theirs', NOW), 'none');

// The warning: one day wide, and the job runs daily, so it fires exactly once.
check('a day before the warning', graceAction(row({ delisted_at: daysAgo(GRACE_WARN_DAYS - 1) }), 'ours', NOW), 'none');
check('the warning day', graceAction(row({ delisted_at: daysAgo(GRACE_WARN_DAYS) }), 'ours', NOW), 'warn');
check('the day after the warning', graceAction(row({ delisted_at: daysAgo(GRACE_WARN_DAYS + 1) }), 'ours', NOW), 'none');

// The boundary. GRACE_DAYS exactly is up: the spot goes.
check('one day short of the grace period', graceAction(row({ delisted_at: daysAgo(GRACE_DAYS - 1) }), 'ours', NOW), 'none');
check('grace period reached exactly', graceAction(row({ delisted_at: daysAgo(GRACE_DAYS) }), 'ours', NOW), 'cancel');
check('long past the grace period', graceAction(row({ delisted_at: daysAgo(120) }), 'ours', NOW), 'cancel');
check('past grace and never paused', graceAction(row({ delisted_at: daysAgo(GRACE_DAYS + 1) }), 'none', NOW), 'cancel');

// The bug this threshold exists for. delisted_at is set and cleared ONLY by the
// monthly import, and consecutive imports are up to 31 days apart, so a
// threshold of 31 or less cancels a renewed inspector hours before the import
// that would have rescued them. 35 must clear the longest gap.
check('grace period clears the longest gap between imports', GRACE_DAYS > 31, true);
check('the warning leaves time to act', GRACE_DAYS - GRACE_WARN_DAYS >= 3, true);
check('a 31-day month does not cancel early',
  graceAction(row({ delisted_at: '2026-08-01T13:05:00Z' }), 'ours', new Date('2026-09-01T15:00:00Z')), 'none');

// A listing with no subscription is not ours to act on, whatever else is true.
check('no subscription, lapsed', graceAction(row({ delisted_at: daysAgo(90), stripe_subscription_id: null }), 'none', NOW), 'none');
check('no subscription, current', graceAction(row({ stripe_subscription_id: null }), 'ours', NOW), 'none');

// A corrupt timestamp must never read as "long ago" and cancel somebody.
check('unparseable delisted_at does not cancel', graceAction(row({ delisted_at: 'not a date' }), 'none', NOW), 'pause');
check('unparseable delisted_at, already paused', graceAction(row({ delisted_at: 'not a date' }), 'ours', NOW), 'none');

// A future timestamp is clock skew, not a license that lapsed in the future.
check('future delisted_at does not cancel', graceAction(row({ delisted_at: daysAgo(-5) }), 'none', NOW), 'pause');

if (failures.length > 0) {
  console.error(`\nLicense grace failed ${failures.length} check(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`License grace passed: paused on lapse, warned at ${GRACE_WARN_DAYS}, released at ${GRACE_DAYS}.`);
