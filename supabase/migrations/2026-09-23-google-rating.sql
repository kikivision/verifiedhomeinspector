-- An inspector's Google rating on their card and page, linking out to the
-- reviews on Google. See DECISIONS.md 2026-09-23: the site never hosts
-- reviews; it shows Google's number, on claimed listings only, and the
-- inspector can turn it off.
--
-- google_place_id is the only column a person sets. It is attached by hand
-- (scripts/google-rating.mjs --set) or at claim time after the inspector
-- confirms the match — never by a blind name search, because a wrong match
-- puts someone else's stars under a real inspector's name.
--
-- The rating and count are a cache of Google's numbers. Google's terms allow
-- holding them for at most 30 days, so google_rating_fetched_at is what the
-- monthly refresh (netlify/functions/google-rating-refresh.mts) keys on, and
-- the place ID — which may be kept indefinitely — is what it refreshes from.
--
-- show_google_rating defaults to true: a claimed listing with a place ID shows
-- its rating unless the inspector switches it off. Off renders nothing — no
-- "rating hidden" label, which would read as a bad rating.

alter table public.listings
  add column if not exists google_place_id text,
  add column if not exists google_rating numeric(2,1) check (google_rating between 1 and 5),
  add column if not exists google_rating_count int check (google_rating_count >= 0),
  add column if not exists google_rating_fetched_at timestamptz,
  add column if not exists show_google_rating boolean not null default true;

comment on column public.listings.google_place_id is
  'Places API (New) place ID. Set by hand or confirmed by the inspector at claim; never from an unconfirmed name match.';
comment on column public.listings.google_rating is
  'Cached from Google; refreshed monthly (30-day cache limit in Google''s terms). Null until first fetch.';
comment on column public.listings.show_google_rating is
  'Inspector''s switch. False renders nothing at all.';
