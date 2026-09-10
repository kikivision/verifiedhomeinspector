// Client-side event logging for listings.
//
// Scope, on purpose: this logs CLICKS only (click_phone, click_request),
// not raw impressions. Impression-at-scroll tracking was considered and
// deliberately deferred — it multiplies write volume across 400+ listings
// for a signal that's weaker than "someone actually clicked." Revisit this
// only if click data alone isn't compelling enough for renewal pitches.
//
// This file is imported into a <script> tag on pages that render listings.
// It talks to Supabase directly from the browser using the public anon key,
// which is safe here because the `listing_events` RLS policy only allows
// INSERT, never SELECT — a visitor can log an event but can never read
// anyone else's event history back out through this same client.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type EventType = 'click_phone' | 'click_request';

/**
 * Call this from an onclick handler on a phone number or "Request
 * inspector" button. `pageContext` should describe where the click
 * happened — e.g. 'county_pinellas', 'filter_wind_mitigation' — so you
 * can later report "X of your clicks came from a wind-mit search" back
 * to the inspector, not just a raw total.
 */
export async function logListingEvent(
  listingId: string,
  eventType: EventType,
  pageContext: string
): Promise<void> {
  try {
    await supabase.from('listing_events').insert({
      listing_id: listingId,
      event_type: eventType,
      page_context: pageContext,
    });
  } catch (err) {
    // Never let analytics failure break the actual user action (revealing
    // a phone number should work even if logging the click fails).
    console.error('Failed to log listing event:', err);
  }
}
