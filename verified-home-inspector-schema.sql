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
  bio text,
  specialties jsonb not null default '[]'::jsonb,
  cert_badges jsonb not null default '[]'::jsonb,
  photo_urls jsonb not null default '[]'::jsonb,
  featured_position int check (featured_position between 1 and 6),
  claimed_at timestamptz,
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

-- No public update/delete policies on either table on purpose — claiming
-- a listing, upgrading tiers, and reading event history for reports are
-- all admin/service-role operations, not public API actions.
