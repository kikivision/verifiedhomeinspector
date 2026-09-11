-- Verified Home Inspector — initial schema
-- Run this in the Supabase SQL Editor for the verified-home-inspector project

create table listings (
  id uuid primary key default gen_random_uuid(),
  county text not null,
  city text not null,
  license_number text not null unique,
  licensee_name text not null,
  business_name text,
  phone text,
  tier text not null default 'unclaimed' check (tier in ('unclaimed', 'claimed', 'featured')),
  specialties jsonb not null default '[]'::jsonb,
  cert_badges jsonb not null default '[]'::jsonb,
  photo_urls jsonb not null default '[]'::jsonb,
  featured_position int check (featured_position between 1 and 6),
  -- Years in business, as the inspector states it, rendered as "N+ years".
  -- Not a cert_badge: it is not a certification, and putting it there would
  -- have meant a card claiming a credential nobody issued.
  years_experience int check (years_experience between 0 and 80),
  claimed_at timestamptz,
  -- Set when a license stops appearing in the DBPR extract. Null means current.
  -- The importer marks rows here and never deletes them, so a claimed listing
  -- survives a bad upstream file and can be restored by clearing this.
  delisted_at timestamptz,
  created_at timestamptz not null default now()
);

create table listing_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'click_phone', 'click_request')),
  page_context text not null,
  occurred_at timestamptz not null default now()
);

-- Indexes for the queries you'll actually run: filtering by county/city,
-- sorting by tier, and pulling a listing's event history for reporting.
create index idx_listings_county on listings(county);
create index idx_listings_city on listings(city);
create index idx_listings_tier on listings(tier);

-- Six featured slots per county are sold separately, so two listings holding the
-- same slot means one of them is paying for something they are not getting.
-- Partial, so only actually-featured rows are constrained: unclaimed and claimed
-- rows all carry a null featured_position and must stay unconstrained.
create unique index uniq_featured_slot_per_county
  on listings (county, featured_position)
  where tier = 'featured' and featured_position is not null;
create index idx_events_listing on listing_events(listing_id);
create index idx_events_type_context on listing_events(event_type, page_context);

-- Row Level Security: locked down by default (matches the project's
-- "Enable automatic RLS" setting), then opened up specifically for what
-- actually needs to be public.
alter table listings enable row level security;
alter table listing_events enable row level security;

-- The public site needs to read listings to render the directory.
create policy "Public can view listings"
  on listings for select
  using (true);

-- The public site needs to write events (impressions/clicks) but never
-- read them back — reporting/analytics queries should go through the
-- dashboard or a service-role connection, not the public API.
create policy "Public can insert events"
  on listing_events for insert
  with check (true);

-- RLS policies decide which rows a role may touch, but Postgres checks table
-- privileges first, and a table created here grants nothing to anon by default.
-- Without these the site's reads fail with 42501 ("permission denied for table
-- listings") before the policies above are ever consulted.
grant select on listings to anon, authenticated;
grant insert on listing_events to anon, authenticated;

-- service_role bypasses RLS but table privileges are still checked, and this
-- project was created without Supabase's usual default grants. Without these
-- the admin scripts authenticate successfully and are then refused by Postgres
-- with "permission denied for table listings", which reads like a bad key.
grant select, insert, update, delete on listings to service_role;
grant select, insert, update, delete on listing_events to service_role;

-- So a table added later does not have to rediscover the same thing.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

-- No public update/delete policies on either table on purpose — claiming
-- a listing, upgrading tiers, and reading event history for reports are
-- all admin/service-role operations, not public API actions.

-- Reporting view for the "free until five requests" offer: how many requests
-- each listing has had, and whether it has passed the threshold.
--
-- Deliberately NOT granted to anon. listing_events is INSERT-only to the public
-- so a visitor can log an event but never read anyone's history back out, and
-- this view must not become the hole in that. security_invoker keeps the
-- underlying RLS in force for whoever queries it, so it is readable from the
-- SQL editor and a service-role connection, which is where reporting belongs.
create or replace view listing_request_counts
with (security_invoker = true) as
select
  l.id,
  l.county,
  l.city,
  l.license_number,
  l.licensee_name,
  l.business_name,
  l.tier,
  count(e.id) filter (where e.event_type = 'click_request') as requests,
  count(e.id) filter (where e.event_type = 'click_phone') as phone_clicks,
  count(e.id) filter (where e.event_type = 'click_request') >= 5 as free_period_used,
  max(e.occurred_at) as last_activity
from listings l
left join listing_events e on e.listing_id = l.id
group by l.id;
