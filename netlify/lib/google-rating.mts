// The monthly refresh of cached Google ratings, shared by the scheduled
// function and scripts/google-rating.mjs so the by-hand path and the
// automatic one cannot drift.
//
// Google's terms allow caching place data for at most 30 days. Rows are
// refreshed once their cache is STALE_DAYS old; a run that happens twice
// (Netlify crons are at-least-once) finds nothing due the second time, so it
// is idempotent by construction rather than by a lock.
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPlace } from '../../src/lib/google-rating.ts';

/** Refresh at 25 days so a run that slips a few days still lands inside 30. */
export const STALE_DAYS = 25;

interface Row {
  id: string;
  license_number: string;
  google_place_id: string;
  google_rating: number | null;
  google_rating_count: number | null;
  google_rating_fetched_at: string | null;
}

export interface RefreshResult {
  checked: number;
  changed: number;
  cleared: number;
  failed: number;
  lines: string[];
}

export async function refreshGoogleRatings(
  db: SupabaseClient,
  apiKey: string,
  opts: { force?: boolean; now?: Date } = {},
): Promise<RefreshResult> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - STALE_DAYS * 86_400_000).toISOString();
  let q = db.from('listings')
    .select('id, license_number, google_place_id, google_rating, google_rating_count, google_rating_fetched_at')
    .not('google_place_id', 'is', null);
  if (!opts.force) q = q.or(`google_rating_fetched_at.is.null,google_rating_fetched_at.lt.${cutoff}`);
  const { data, error } = await q;
  if (error) throw error;

  const result: RefreshResult = { checked: 0, changed: 0, cleared: 0, failed: 0, lines: [] };
  for (const row of (data ?? []) as Row[]) {
    result.checked += 1;
    try {
      const place = await fetchPlace(row.google_place_id, apiKey);
      const fetched = now.toISOString();
      if (!place) {
        // Google no longer knows the ID — a merged or removed profile. Keep
        // the ID (so it shows up in a report) but stop showing numbers Google
        // itself no longer stands behind.
        const { error: e } = await db.from('listings')
          .update({ google_rating: null, google_rating_count: null, google_rating_fetched_at: fetched })
          .eq('id', row.id);
        if (e) throw e;
        result.cleared += 1;
        result.lines.push(`${row.license_number}: place ${row.google_place_id} gone from Google; rating cleared`);
        continue;
      }
      const changed = place.rating !== row.google_rating || place.count !== row.google_rating_count;
      const { error: e } = await db.from('listings')
        .update({ google_rating: place.rating, google_rating_count: place.count, google_rating_fetched_at: fetched })
        .eq('id', row.id);
      if (e) throw e;
      if (changed) result.changed += 1;
      result.lines.push(`${row.license_number}: ${place.rating?.toFixed(1) ?? '-'} ★ (${place.count})${changed ? '  CHANGED' : ''}`);
    } catch (err) {
      result.failed += 1;
      result.lines.push(`${row.license_number}: FAILED — ${(err as Error).message}`);
    }
  }
  return result;
}
