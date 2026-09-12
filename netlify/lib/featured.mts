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
//   NETLIFY_BUILD_HOOK         so a purchase rebuilds the site
//   URL                        set by Netlify itself: the site's canonical URL
import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CITY_FEATURED_CAP, MAX_FEATURED_CITIES, MIN_CITY_LISTINGS } from '../../src/lib/cities';

/** How long a new featured card runs before the first charge. */
export const TRIAL_DAYS = 7;

/** The county page's ceiling; positions are 1..this. Matches FEATURED_TARGET. */
const COUNTY_POSITIONS = 4;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
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

/** Lowest free county-page position, or null if all are taken. */
export async function nextPosition(db: SupabaseClient, county: string): Promise<number | null> {
  const { data, error } = await db
    .from('listings')
    .select('featured_position')
    .eq('county', county)
    .eq('tier', 'featured')
    .not('featured_position', 'is', null);
  if (error) throw new HttpError(500, error.message);
  const taken = new Set((data as { featured_position: number }[]).map((r) => r.featured_position));
  for (let p = 1; p <= COUNTY_POSITIONS; p += 1) if (!taken.has(p)) return p;
  return null;
}

/** POSTs the Netlify build hook so the change shows on the site. Best effort. */
export async function rebuild(): Promise<void> {
  const hook = process.env.NETLIFY_BUILD_HOOK;
  if (!hook) {
    console.warn('NETLIFY_BUILD_HOOK is not set; the site will not rebuild on its own.');
    return;
  }
  try {
    const res = await fetch(hook, { method: 'POST' });
    if (!res.ok) console.error(`Build hook returned HTTP ${res.status}`);
  } catch (err) {
    console.error('Build hook failed:', err);
  }
}
