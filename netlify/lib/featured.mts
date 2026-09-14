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
  return new Stripe(env('STRIPE_SECRET_KEY'));
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
    // The cost is a lapsed licence holding a spot that renders nowhere while
    // still being billed. That is a product decision (cancel? grace period?)
    // and is listed as not-built in DECISIONS.md.
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
 * How long a featured spot is held after the licence stops appearing in the
 * DBPR extract. Decided 2026-09-14: one monthly import cycle. The lapse may
 * already be up to a month old when the import first sees it, so the window
 * from the inspector's side is longer than this number suggests.
 */
export const GRACE_DAYS = 30;

export interface GraceInput {
  license_number: string;
  licensee_name: string;
  county: string;
  delisted_at: string | null;
  claimed_by: string | null;
  stripe_subscription_id: string | null;
}

/**
 * What licence-grace should do with one featured listing. Pure on purpose: it
 * decides about somebody's money, so it is separated from Stripe and tested
 * case by case in scripts/licence-grace.test.mjs.
 *
 * `paused` is read live from Stripe rather than stored, which is what makes
 * every branch idempotent — a second run the same day sees the state it just
 * set and returns 'none'.
 */
export function graceAction(l: GraceInput, paused: boolean, now: Date): 'pause' | 'resume' | 'cancel' | 'none' {
  // Never touch a subscription that is not attached to a live claimed listing.
  if (!l.stripe_subscription_id) return 'none';

  if (l.delisted_at === null) {
    // Back in the extract. import-dbpr clears delisted_at by itself, so this is
    // the only signal needed, and it must not resume something never paused.
    return paused ? 'resume' : 'none';
  }

  const since = Date.parse(l.delisted_at);
  // Defensive, not currently load-bearing: NaN >= GRACE_DAYS is already false,
  // so an unparseable date falls through to 'pause' either way. It is here
  // because inverting the comparison below — writing `days < GRACE_DAYS` and
  // cancelling in the else — would silently turn a corrupt timestamp into a
  // cancelled customer, and that edit looks harmless in a diff.
  if (!Number.isFinite(since)) return paused ? 'none' : 'pause';

  const days = (now.getTime() - since) / 86_400_000;
  // A future timestamp is clock skew, not a licence that lapsed ahead of time,
  // and negative days fail the check below rather than passing it.
  if (days >= GRACE_DAYS) return 'cancel';
  return paused ? 'none' : 'pause';
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
