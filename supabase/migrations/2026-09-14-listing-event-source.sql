-- Which channel brought the visitor who clicked.
--
-- listing_events recorded the listing, the event and the page it happened
-- on. With paid traffic pointed at the St. Petersburg pages, the number that
-- decides whether the spend continues is not "this listing was called" but
-- "this listing was called by someone the ads paid for" — and that could not
-- be answered from this table at all.
--
-- Nullable on purpose. Every row written before this column existed has no
-- source and never will; a default would invent one. The client sends
-- 'unknown' when sessionStorage is unavailable, which is a different thing
-- from null and worth being able to tell apart: null means "before we
-- measured", 'unknown' means "we measured and could not tell".
--
-- The insert policy is unchanged: anon may INSERT and may never SELECT, so a
-- visitor can write their own source and cannot read anyone else's.

alter table public.listing_events
  add column if not exists source text;

comment on column public.listing_events.source is
  'Channel label captured at landing (google_ads, organic_google, direct, referral:host, utm:source/medium). Null for rows written before 2026-09-14.';

-- Every report of this table starts "for this listing, in this window, by
-- source", and without an index that is a full scan of a table designed to
-- grow by one row per phone call.
create index if not exists listing_events_listing_occurred_idx
  on public.listing_events (listing_id, occurred_at desc);
