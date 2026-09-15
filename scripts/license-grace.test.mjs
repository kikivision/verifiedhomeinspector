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
import { graceAction, pauseOwnerOf, PAUSE_MARKER, LIFTED_MARKER, GRACE_DAYS, GRACE_WARN_DAYS } from '../netlify/lib/featured.mts';

// graceAction(listing, pause, warned, now). `warned` is a marker on the Stripe
// subscription, so a skipped run cannot lose the warning.
const act = (l, pause, now = NOW, warned = false) => graceAction(l, pause, warned, now);

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
check('current license, not paused', act(row({}), 'none'), 'none');

// Just lapsed. Their card is already hidden from every page, so stop billing.
check('lapsed today', act(row({ delisted_at: daysAgo(0) }), 'none'), 'pause');
check('lapsed a week ago', act(row({ delisted_at: daysAgo(7) }), 'none'), 'pause');

// Already paused by us. Running the job twice in a day must not pause twice.
check('lapsed and already paused by us', act(row({ delisted_at: daysAgo(7) }), 'ours'), 'none');

// Renewed inside the window: import-dbpr clears delisted_at, so this is the
// only signal. Resume, and the position never moved.
check('back in the extract, we paused it', act(row({ delisted_at: null }), 'ours'), 'resume');
check('back in the extract, never paused', act(row({ delisted_at: null }), 'none'), 'none');
check('back in the extract, somebody else paused it', act(row({ delisted_at: null }), 'theirs'), 'none');

// Somebody paused this by hand in the Stripe dashboard — a comped month, a
// dispute. Lifting it is not this job's business, and NEITHER IS CANCELING IT.
// The cancel check used to run first, so a hand-paused subscription was
// canceled on day 35 with no pause and no warning email, because both of those
// are gated on the pause being ours. That is the bug these four pin.
check('lapsed, somebody else paused it', act(row({ delisted_at: daysAgo(7) }), 'theirs'), 'none');
check('paused by hand, no warn at the warning mark', act(row({ delisted_at: daysAgo(GRACE_WARN_DAYS) }), 'theirs'), 'none');
check('paused by hand, NOT canceled at the grace boundary', act(row({ delisted_at: daysAgo(GRACE_DAYS) }), 'theirs'), 'none');
check('paused by hand, NOT canceled long after', act(row({ delisted_at: daysAgo(400) }), 'theirs'), 'none');

// Somebody removed a pause this job set, while the license is still lapsed.
// That is a decision to keep billing them; re-pausing every morning and
// re-sending the pause email every morning is not a response to it.
check('our pause lifted by hand, still lapsed', act(row({ delisted_at: daysAgo(7) }), 'lifted'), 'none');
check('our pause lifted by hand, not canceled at the boundary', act(row({ delisted_at: daysAgo(GRACE_DAYS) }), 'lifted'), 'none');
// Once they are current again the stale marker is tidied, or a later lapse
// would read as 'lifted' forever and never pause.
check('stale marker on a current listing is cleared', act(row({ delisted_at: null }), 'lifted'), 'clear');

// The warning is tracked by a marker, not a one-day window: a single skipped
// run used to lose it silently and cancel on day 35 having warned nobody.
check('a day before the warning', act(row({ delisted_at: daysAgo(GRACE_WARN_DAYS - 1) }), 'ours'), 'none');
check('the warning day', act(row({ delisted_at: daysAgo(GRACE_WARN_DAYS) }), 'ours'), 'warn');
check('still warns after a missed run', act(row({ delisted_at: daysAgo(GRACE_WARN_DAYS + 3) }), 'ours'), 'warn');
check('does not warn twice', act(row({ delisted_at: daysAgo(GRACE_WARN_DAYS + 3) }), 'ours', NOW, true), 'none');

// The boundary. GRACE_DAYS exactly is up: the spot goes.
// warned=true on the boundary cases so they isolate the cancel, not the warn.
check('one day short of the grace period', act(row({ delisted_at: daysAgo(GRACE_DAYS - 1) }), 'ours', NOW, true), 'none');
check('grace period reached exactly, once warned', act(row({ delisted_at: daysAgo(GRACE_DAYS) }), 'ours', NOW, true), 'cancel');
check('long past the grace period, once warned', act(row({ delisted_at: daysAgo(120) }), 'ours', NOW, true), 'cancel');
// The contract, walked in order. A subscriber first seen already 40 days
// lapsed must be paused, then warned, then released — three runs — not paused
// one morning and released the next after a pause email promising 35 days.
const LATE = { delisted_at: daysAgo(GRACE_DAYS + 5) };
check('first run on a long-lapsed subscriber: pause', act(row(LATE), 'none'), 'pause');
check('second run, paused but not warned: warn, NOT cancel', act(row(LATE), 'ours'), 'warn');
check('third run, paused and warned: cancel', act(row(LATE), 'ours', NOW, true), 'cancel');
// Even at exactly the boundary, an unwarned row warns rather than cancels.
check('grace boundary without a warning warns first', act(row({ delisted_at: daysAgo(GRACE_DAYS) }), 'ours'), 'warn');
// Warned but never paused: they know it is coming, so it goes ahead, and the
// release email says plainly that billing should have stopped and did not.
check('past grace, warned, but the pause never took: cancels and says so', act(row(LATE), 'none', NOW, true), 'cancel');
// A pause that keeps failing before any warning holds the spot rather than
// releasing a customer on the strength of a broken automation. Ops is mailed
// every day it fails.
check('unpaused and unwarned past grace: pause first, never release', act(row(LATE), 'none'), 'pause');

// The bug this threshold exists for. delisted_at is set and cleared ONLY by the
// monthly import, and consecutive imports are up to 31 days apart, so a
// threshold of 31 or less cancels a renewed inspector hours before the import
// that would have rescued them. 35 must clear the longest gap.
check('grace period clears the longest gap between imports', GRACE_DAYS > 31, true);
check('the warning leaves time to act', GRACE_DAYS - GRACE_WARN_DAYS >= 3, true);
check('a 31-day month does not cancel early',
  act(row({ delisted_at: '2026-08-01T13:05:00Z' }), 'ours', new Date('2026-09-01T15:00:00Z'), true), 'none');
// The same instant with the old 00:00 schedule and a 30-day threshold is the
// shipped-and-caught bug: it canceled 13 hours before the import that would
// have restored them. Pinned as arithmetic so the constants cannot drift back.
check('the old 00:00 run would have canceled before the rescuing import',
  (new Date('2026-09-01T00:00:00Z') - new Date('2026-08-01T13:05:00Z')) / 86400000 >= 30, true);

// A listing with no subscription is not ours to act on, whatever else is true.
check('no subscription, lapsed', act(row({ delisted_at: daysAgo(90), stripe_subscription_id: null }), 'none'), 'none');
check('no subscription, current', act(row({ stripe_subscription_id: null }), 'ours'), 'none');

// A corrupt timestamp must never read as "long ago" and cancel somebody.
check('unparseable delisted_at does not cancel', act(row({ delisted_at: 'not a date' }), 'none'), 'pause');
check('unparseable delisted_at, already paused', act(row({ delisted_at: 'not a date' }), 'ours'), 'none');

// A future timestamp is clock skew, not a license that lapsed in the future.
check('future delisted_at does not cancel', act(row({ delisted_at: daysAgo(-5) }), 'none'), 'pause');

// The derivation of the pause state from Stripe, which decides which branch of
// everything above is taken. It was inline and untested, so the pure decisions
// were covered and the thing feeding them was not.
check('no pause, no marker', pauseOwnerOf(false, undefined), 'none');
check('paused by a person', pauseOwnerOf(true, undefined), 'theirs');
check('paused by us', pauseOwnerOf(true, PAUSE_MARKER), 'ours');
check('our marker but the pause is gone', pauseOwnerOf(false, PAUSE_MARKER), 'lifted');
// The two-hand-action case: a person lifted our pause, then paused it again
// themselves. Reading that as ours is how the job would cancel a pause
// somebody deliberately set.
check('re-paused by hand after lifting ours', pauseOwnerOf(true, LIFTED_MARKER), 'lifted');
check('lifted marker, still unpaused', pauseOwnerOf(false, LIFTED_MARKER), 'lifted');
// Stripe stores a deleted key as absent, but an empty string must never read
// as one of our markers.
check('empty marker is nobody', pauseOwnerOf(true, ''), 'theirs');
check('unknown marker is somebody else', pauseOwnerOf(true, 'someone-else'), 'theirs');

if (failures.length > 0) {
  console.error(`\nLicense grace failed ${failures.length} check(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`License grace passed: paused on lapse, warned at ${GRACE_WARN_DAYS}, released at ${GRACE_DAYS}.`);
