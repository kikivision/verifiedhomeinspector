// Scheduled monthly. Re-pulls each attached listing's Google rating and review
// count so the numbers on the site are never older than Google's 30-day cache
// limit, then rebuilds if anything moved.
//
// This one IS scheduled, unlike license-grace.mts beside it. That job stops
// and starts billing with nobody watching and was held for that reason. This
// one reads two numbers from Google and writes them back; the worst run
// leaves a rating a month stale, which the next run fixes. Not the same risk.
//
// Idempotent: the refresh only touches rows whose cache is older than
// STALE_DAYS, so a duplicate invocation (Netlify crons are at-least-once)
// finds nothing due.
//
// Env (Netlify → Environment variables): GOOGLE_PLACES_API_KEY,
// PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NETLIFY_BUILD_HOOK.
import type { Config } from '@netlify/functions';
import { admin, rebuild } from '../lib/featured.mts';
import { refreshGoogleRatings } from '../lib/google-rating.mts';

export default async (): Promise<Response> => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('google-rating-refresh: GOOGLE_PLACES_API_KEY is not set; nothing refreshed.');
    return new Response('no api key', { status: 500 });
  }
  const result = await refreshGoogleRatings(admin(), apiKey);
  console.log(`google-rating-refresh: checked ${result.checked}, changed ${result.changed}, cleared ${result.cleared}, failed ${result.failed}`);
  for (const line of result.lines) console.log('  ' + line);
  if (result.changed + result.cleared > 0) await rebuild();
  return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
};

// 14:00 UTC on the 2nd of the month: after the DBPR import on the 1st, so a
// listing delisted that morning is not fetched for nothing, and at a
// different hour from every other job here.
export const config: Config = { schedule: '0 14 2 * *' };
