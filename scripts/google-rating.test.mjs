#!/usr/bin/env node
/**
 * googleRating() decides whether a rating renders at all. The rules are the
 * decision (DECISIONS.md 2026-09-23): never on an unclaimed listing, never
 * when the inspector switched it off, never before a fetch. A mistake here
 * does not throw — it puts a rating where one must not be.
 *
 * Usage:  node scripts/google-rating.test.mjs
 */
import { googleRating, googleReviewsUrl } from '../src/lib/google-rating.ts';

let failed = 0;
function check(cond, msg) { if (!cond) { failed += 1; console.error('FAIL', msg); } }

const attached = { tier: 'claimed', google_place_id: 'ChIJu8ipv3_6wogRPRYSpWlUlL0', google_rating: 5, google_rating_count: 79, show_google_rating: true };

let r = googleRating(attached);
check(r !== null, 'claimed + attached renders');
check(r.rating === '5.0', `rating is one decimal, got ${r.rating}`);
check(r.count === 79, 'count passes through');
check(r.url === googleReviewsUrl('ChIJu8ipv3_6wogRPRYSpWlUlL0'), 'links to Google reviews for that place');
check(r.url.startsWith('https://search.google.com/local/reviews?placeid='), 'reviews URL is Google\'s');

check(googleRating({ ...attached, google_rating: 4.75 }).rating === '4.8', 'rounds to one decimal like Google');
check(googleRating({ ...attached, tier: 'featured' }) !== null, 'featured renders too');
check(googleRating({ ...attached, tier: 'unclaimed' }) === null, 'unclaimed never renders, even with an ID');
check(googleRating({ ...attached, show_google_rating: false }) === null, 'inspector switch off renders nothing');
check(googleRating({ ...attached, show_google_rating: undefined }) !== null, 'switch absent (old DB) defaults to on');
check(googleRating({ ...attached, google_rating: null }) === null, 'no fetch yet renders nothing');
check(googleRating({ ...attached, google_rating_count: 0 }) === null, 'zero reviews renders nothing');
check(googleRating({ ...attached, google_place_id: null }) === null, 'no place ID renders nothing');
check(googleRating({ tier: 'claimed' }) === null, 'a row from a DB without the columns renders nothing');

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('google-rating: ok');
