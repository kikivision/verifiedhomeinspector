// Shared by the three featured-spot functions: who is calling, what they may
// buy, and what fulfillment writes.
//
// These run on Netlify with the service-role key, so they can write to
// listings — the one place besides set-tier.mjs that can. Every write here is
// a tier change or a billing id; nothing an inspector types on the dashboard
// passes through this file.
//
// Environment (Netlify → Site configuration → Environment variables):
//   STRIPE_SECRET_KEY          sk_test_… until go-live, then sk_live_…
//   STRIPE_WEBHOOK_SECRET      whsec_… from the endpoint registered in Stripe
//   STRIPE_PRICE_FEATURED      price_… for the $50/month founding-rate price
//   PUBLIC_SUPABASE_URL        already set for the build
//   SUPABASE_SERVICE_ROLE_KEY  never PUBLIC_, never in the repo
//   RESEND_API_KEY             so notifyOps can mail hello@ when a paid card
//                              cannot be delivered as sold
//   NETLIFY_BUILD_HOOK         so a purchase rebuilds the site
//   URL                        set by Netlify itself: the site's canonical URL
import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CITY_FEATURED_CAP, COUNTY_FEATURED_CAP, MAX_FEATURED_CITIES, MIN_CITY_LISTINGS } from '../../src/lib/cities.ts';

/** How long a new featured card runs before the first charge. */
export const TRIAL_DAYS = 7;

/** The county page's ceiling; positions are 1..this. Defined once in
 *  lib/cities.ts, which the county page reads too. */
const COUNTY_POSITIONS = COUNTY_FEATURED_CAP;

export class HttpError extends Error {
  status: number;

  // Written out rather than as a `public status` parameter property, which
  // node's type stripper refuses: scripts/county-gate.test.mjs imports this
  // module directly, and a parameter property makes the whole file
  // unimportable outside the bundler. Same class either way.
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new HttpError(500, `Server is missing ${name}.`);
  return value;
}

export function stripe(): Stripe {
  // stripe-node defaults to an 80-second timeout. Netlify kills a function at
  // 30 (10 for a background one), so a single hung call takes the whole
  // invocation down and loses whatever it was going to report. 10 seconds is
  // far longer than a healthy Stripe call and far shorter than the ceiling.
  return new Stripe(env('STRIPE_SECRET_KEY'), { timeout: 10_000, maxNetworkRetries: 1 });
}

export function admin(): SupabaseClient {
  return createClient(env('PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function siteUrl(): string {
  return (process.env.URL || 'https://verifiedhomeinspector.com').replace(/\/$/, '');
}

/**
 * Turns whatever a function caught into a response. HttpErrors carry their
 * own status and message. A Stripe error's message is written for
 * developers and names the actual problem ("No such price", "Invalid API
 * Key") — shown as-is, because a dashboard that says "something went wrong"
 * for a mis-pasted price id costs an hour of guessing. Anything else is
 * logged and reported generically.
 */
export function errorResponse(err: unknown, fallback: string): Response {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  if (err instanceof Stripe.errors.StripeError) {
    console.error('Stripe error:', err.type, err.code, err.message);
    return json({ error: `Stripe: ${err.message}` }, 502);
  }
  if (err && typeof err === 'object' && 'message' in err && 'code' in err) {
    // Supabase/PostgREST errors have a message and a code.
    const e = err as { message: string; code: string };
    console.error('Database error:', e.code, e.message);
    return json({ error: `Database: ${e.message}` }, 500);
  }
  console.error(err);
  return json({ error: fallback }, 500);
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export interface ListingRow {
  id: string;
  county: string;
  city: string;
  license_number: string;
  licensee_name: string;
  business_name: string | null;
  tier: 'unclaimed' | 'claimed' | 'featured';
  featured_position: number | null;
  featured_cities: string[];
  claimed_by: string | null;
  delisted_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

/**
 * The signed-in inspector and the one listing attached to their account.
 * The dashboard sends the Supabase access token as a bearer token; the
 * service-role client checks it with Auth, so a forged or expired token
 * gets a 401 rather than someone else's listing.
 */
export async function callerListing(req: Request, db: SupabaseClient): Promise<{ userId: string; email: string; listing: ListingRow }> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new HttpError(401, 'Sign in first.');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Your sign-in has expired. Sign in again.');
  const { data: listing, error: listingError } = await db
    .from('listings')
    .select('id, county, city, license_number, licensee_name, business_name, tier, featured_position, featured_cities, claimed_by, delisted_at, stripe_customer_id, stripe_subscription_id')
    .eq('claimed_by', data.user.id)
    .maybeSingle();
  if (listingError) throw new HttpError(500, listingError.message);
  if (!listing) throw new HttpError(400, 'No listing is attached to this account. Claim one first.');
  return { userId: data.user.id, email: data.user.email ?? '', listing: listing as ListingRow };
}

/**
 * The cities a featured card may name, and how many spots each has left.
 * Same rules as set-tier.mjs: a city with a page (MIN_CITY_LISTINGS or more
 * listings in the county), CITY_FEATURED_CAP cards per city, counting a
 * featured listing with no cities set as featured in its own city.
 */
export async function cityAvailability(db: SupabaseClient, county: string, excludeLicense?: string): Promise<Map<string, number>> {
  const { data, error } = await db
    .from('listings')
    .select('license_number, city, tier, featured_cities')
    .eq('county', county)
    .is('delisted_at', null);
  if (error) throw new HttpError(500, error.message);
  const rows = data as Pick<ListingRow, 'license_number' | 'city' | 'tier' | 'featured_cities'>[];

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.city, (counts.get(r.city) ?? 0) + 1);

  const open = new Map<string, number>();
  for (const [city, n] of counts) if (n >= MIN_CITY_LISTINGS) open.set(city, CITY_FEATURED_CAP);
  for (const r of rows) {
    if (r.tier !== 'featured' || r.license_number === excludeLicense) continue;
    const cities = r.featured_cities?.length ? r.featured_cities : [r.city];
    for (const city of cities) if (open.has(city)) open.set(city, open.get(city)! - 1);
  }
  return open;
}

/** Throws a readable message if the requested cities cannot all be sold. */
export async function assertCitiesAvailable(db: SupabaseClient, listing: ListingRow, cities: string[]): Promise<string[]> {
  const wanted = [...new Set(cities.map((c) => String(c).trim()).filter(Boolean))];
  if (wanted.length === 0) throw new HttpError(400, 'Pick at least one city.');
  if (wanted.length > MAX_FEATURED_CITIES) {
    throw new HttpError(400, `Pick up to ${MAX_FEATURED_CITIES} cities.`);
  }
  const open = await cityAvailability(db, listing.county, listing.license_number);
  for (const city of wanted) {
    if (!open.has(city)) throw new HttpError(400, `${city} is not a city page in this county.`);
    if (open.get(city)! <= 0) throw new HttpError(409, `${city} has no featured spot open right now.`);
  }
  return wanted;
}

/**
 * Throws if every county-page position is taken, and returns the one this
 * listing would get. Called before Stripe for the same reason
 * assertCitiesAvailable is: a county page holds COUNTY_POSITIONS cards and
 * the copy on it promises never more, so a sale past that is a promise we
 * cannot keep and a card the buyer cannot be given. Refusing costs one sale;
 * taking the money costs the promise on every county page.
 */
export async function assertCountyHasRoom(db: SupabaseClient, listing: ListingRow): Promise<number> {
  const position = await nextPosition(db, listing.county);
  if (position === null) {
    throw new HttpError(409, `All ${COUNTY_POSITIONS} featured spots in this county are taken right now.`);
  }
  return position;
}

/** Lowest free county-page position, or null if all are taken. */
export async function nextPosition(db: SupabaseClient, county: string): Promise<number | null> {
  const { data, error } = await db
    .from('listings')
    .select('featured_position')
    .eq('county', county)
    .eq('tier', 'featured')
    // Deliberately NOT filtering delisted_at, though cityAvailability does.
    // `uniq_featured_slot_per_county` constrains (county, featured_position)
    // for every tier='featured' row with a position, delisted or not, and
    // import-dbpr sets delisted_at without touching tier or position. Skipping
    // those rows here hands out a position the index already holds: the sale
    // passes the gate, the card is taken, and the UPDATE in fulfill fails
    // 23505 forever while Stripe retries and the trial runs out. Counting them
    // as taken is a refusal; ignoring them is a charge for nothing.
    //
    // The cost is a lapsed license holding a spot that renders nowhere. The
    // billing half of that is handled: license-grace.mts pauses collection on
    // the lapse and releases the spot after GRACE_DAYS. Until it does, the
    // position stays counted here, which is the safe direction.
    .not('featured_position', 'is', null);
  if (error) throw new HttpError(500, error.message);
  const taken = new Set((data as { featured_position: number }[]).map((r) => r.featured_position));
  for (let p = 1; p <= COUNTY_POSITIONS; p += 1) if (!taken.has(p)) return p;
  return null;
}

/**
 * Mails hello@ when a purchase cannot be delivered as sold. The log line this
 * replaces went to Netlify function logs, which expire in 7 days and nobody
 * watches — and the free trial is 7 days, so the first charge landed before
 * anyone could have looked. Best effort: a send that fails must not 500 the
 * webhook, because Stripe would retry it and the customer would be billed
 * twice over an email.
 */
export async function notifyOps(subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY is not set; this needed a person:', subject, text);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      // Bounded: an unbounded call here holds the webhook open, Stripe gives up
      // and redelivers, and the redelivery repeats whatever this was reporting.
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Verified Home Inspector <hello@mail.verifiedhomeinspector.com>',
        to: ['hello@verifiedhomeinspector.com'],
        subject,
        text,
      }),
    });
    if (!res.ok) console.error('notifyOps failed', res.status, await res.text(), subject, text);
  } catch (err) {
    console.error('notifyOps threw', err, subject, text);
  }
}

/**
 * How long a featured spot is held after the license stops appearing in the
 * DBPR extract, and when the warning goes out.
 *
 * 35, not 30, and the reason is arithmetic rather than generosity.
 * `delisted_at` is only ever SET and only ever CLEARED by the monthly import
 * (`0 13 1 * *`), so the only thing that can rescue a lapsed inspector is the
 * next import — and consecutive imports are up to 31 days apart. A 30-day
 * threshold cancels them BEFORE that import in every 31-day month: delisted
 * 1 Aug 13:05, the daily job at 1 Sep sees 30.4 days and cancels, and the
 * import that would have restored them runs that afternoon. Seven months of
 * the year it released a customer who had already renewed. The threshold must
 * clear the longest possible import gap, so 31 plus margin.
 *
 * The warning at 30 days exists because the arithmetic is not the only way
 * this can go wrong: the import stops the whole run if one county trips its
 * shrink guard, so a month can pass with no re-check at all. The warning mails
 * a person while there are still days left to intervene.
 */
export const GRACE_DAYS = 35;
export const GRACE_WARN_DAYS = 30;

/**
 * Who, if anyone, paused a subscription's collection.
 *
 * 'lifted' is the fourth state and the reason this is not a boolean: the marker
 * is on the subscription but the pause is gone, which means a person removed a
 * pause this job set. Treating that as 'none' re-paused them the next morning
 * and mailed the pause email again, every day.
 */
export type PauseOwner = 'none' | 'ours' | 'theirs' | 'lifted';

/** Stamped on a pause so the daily job only ever lifts its own. */
export const PAUSE_MARKER = 'license-grace';

/** Stamped on a pause this job set that a person has since removed by hand. */
export const LIFTED_MARKER = 'license-grace-lifted';

/** Stamped when the warning has been sent, so a skipped run cannot lose it. */
export const WARN_MARKER = 'license_grace_warned_at';

export interface GraceInput {
  license_number: string;
  licensee_name: string;
  county: string;
  delisted_at: string | null;
  claimed_by: string | null;
  stripe_subscription_id: string | null;
}

/**
 * Who owns the pause on a subscription, from its live Stripe state. Pure so it
 * can be tested: the four states are derived from two independent facts and
 * getting the combination wrong is how a hand-set pause gets canceled.
 *
 * Takes only what it reads, so a test needs no Stripe object.
 */
export function pauseOwnerOf(paused: boolean, pausedBy: string | undefined): PauseOwner {
  if (pausedBy === PAUSE_MARKER) return paused ? 'ours' : 'lifted';
  // Our marker, rewritten once we have seen a person remove our pause. It stays
  // 'lifted' whether or not it is paused again, so a second hand action is never
  // mistaken for ours.
  if (pausedBy === LIFTED_MARKER) return 'lifted';
  return paused ? 'theirs' : 'none';
}

/**
 * What license-grace should do with one featured listing. Pure on purpose: it
 * decides about somebody's money, so it is separated from Stripe and tested
 * case by case in scripts/license-grace.test.mjs.
 *
 * `pause` and `warned` are read live from Stripe rather than stored here, which
 * is what makes every branch idempotent and needs no migration.
 *
 * ORDER MATTERS, and getting it wrong is how this shipped broken once: the
 * 'theirs'/'lifted' check has to come BEFORE the cancel, or a subscription a
 * person deliberately paused or un-paused by hand is still canceled on day 35,
 * with no pause and no warning email first because both are gated on 'ours'.
 */
export function graceAction(
  l: GraceInput,
  pause: PauseOwner,
  warned: boolean,
  now: Date,
): 'pause' | 'resume' | 'cancel' | 'warn' | 'clear' | 'none' {
  // Never touch a subscription that is not attached to a live claimed listing.
  if (!l.stripe_subscription_id) return 'none';

  if (l.delisted_at === null) {
    // Back in the extract. import-dbpr clears delisted_at by itself, so this is
    // the only signal needed. Only ever lift our own pause; a stale marker on a
    // subscription nobody paused is tidied so a later lapse is seen correctly.
    if (pause === 'ours') return 'resume';
    return pause === 'lifted' ? 'clear' : 'none';
  }

  // A person's decision about a customer's billing, in either direction. Hands
  // off, and no countdown to a cancellation on it either.
  if (pause === 'theirs' || pause === 'lifted') return 'none';

  const since = Date.parse(l.delisted_at);
  // Defensive, not currently load-bearing: NaN >= GRACE_DAYS is already false,
  // so an unparseable date falls through to 'pause' either way. It is here
  // because inverting the comparison below — writing `days < GRACE_DAYS` and
  // canceling in the else — would silently turn a corrupt timestamp into a
  // canceled customer, and that edit looks harmless in a diff.
  if (!Number.isFinite(since)) return pause === 'none' ? 'pause' : 'none';

  const days = (now.getTime() - since) / 86_400_000;

  // THE ORDER IS THE CONTRACT: pause, then warn, then cancel, always, whatever
  // the calendar says. An earlier version put the cancel above the warn, so a
  // subscriber first seen already 40 days lapsed was paused one morning and
  // released the next — having been told, in the pause email, that the spot was
  // held for 35 days. The cancel requires a warning to have been sent.
  //
  // A future timestamp is clock skew, not a license that lapsed ahead of time,
  // and negative days fail this check rather than passing it.
  if (days >= GRACE_DAYS && warned) return 'cancel';

  // Stopping the billing is the most urgent thing: their card is already
  // hidden, so every day unpaused is a day charged for nothing. If this write
  // keeps failing the spot stays held and ops is mailed every day, which is the
  // right way round — a broken automation should not release a paying customer.
  if (pause === 'none') return 'pause';

  // Warn once, tracked by a marker on the subscription rather than by a
  // one-day window. A window meant a single skipped run — a Netlify incident,
  // a deploy freeze — lost the warning silently and canceled on day 35 having
  // never told anybody.
  if (days >= GRACE_WARN_DAYS && !warned) return 'warn';
  return 'none';
}

/**
 * Takes a featured card down and frees its county position. The one place this
 * is written: `reconcile` calls it when a subscription ends, and license-grace
 * calls it when it finds a canceled subscription on a row still marked
 * featured — the state a missed `customer.subscription.deleted` leaves behind,
 * where the position was held by nobody and nothing ever noticed.
 */
export async function releaseFeaturedSpot(db: SupabaseClient, listingId: string): Promise<void> {
  const { error } = await db
    .from('listings')
    .update({
      tier: 'claimed',
      featured_position: null,
      featured_cities: [],
      featured_since: null,
      // Cleared too. Leaving it behind left a claimed row pointing at a
      // subscription that could still be billing — an inspector paying $50 a
      // month for a card that is not on the site, invisible to the daily job
      // (it reads tier='featured') and able to buy a second subscription
      // because create-checkout only refuses a listing already featured.
      // stripe_customer_id stays, so a later purchase reuses the same customer.
      stripe_subscription_id: null,
    })
    .eq('id', listingId);
  if (error) throw error;
}

/** POSTs the Netlify build hook so the change shows on the site. Best effort. */
export async function rebuild(): Promise<void> {
  const hook = process.env.NETLIFY_BUILD_HOOK;
  if (!hook) {
    console.warn('NETLIFY_BUILD_HOOK is not set; the site will not rebuild on its own.');
    return;
  }
  try {
    const res = await fetch(hook, { method: 'POST', signal: AbortSignal.timeout(5000) });
    if (!res.ok) console.error(`Build hook returned HTTP ${res.status}`);
  } catch (err) {
    console.error('Build hook failed:', err);
  }
}
