-- Self-serve claims.
--
-- Run this once in the Supabase SQL Editor for the verified-home-inspector
-- project. verified-home-inspector-schema.sql at the repo root carries the same
-- definitions for a project created from scratch; this file is the delta for
-- the project that already exists.
--
-- What it adds:
--   * four columns an inspector fills in themselves: claimed_by, website, about,
--     service_cities
--   * three functions the dashboard calls: claim_listing, update_my_listing,
--     release_my_listing
--
-- Every write an inspector can make goes through those functions. There is
-- still no UPDATE policy on listings for anon or authenticated, on purpose: a
-- policy would let a signed-in user change any column on their row, including
-- tier and featured_position, which are what they would otherwise pay for.
-- The functions run as their definer and write only the columns listed in them.
--
-- A claim goes live immediately. There is no email or phone in the DBPR extract
-- to verify a claimant against, so the choice was between instant-and-revocable
-- and pending-until-approved, and pending means every claim waits on a person.
-- The licensee's name on the listing comes from the state record and cannot be
-- edited here, so a false claim advertises someone else's phone number under
-- the real inspector's name and license, which the real inspector will notice.
-- Revoke with: node scripts/set-tier.mjs HI#### unclaimed --deploy

alter table public.listings
  add column if not exists claimed_by uuid references auth.users(id) on delete set null,
  -- Shown on the listing as a link. Stored with its scheme so the page never
  -- has to guess one.
  add column if not exists website text,
  -- Written by the inspector. Empty until they write it; nothing is generated
  -- on their behalf.
  add column if not exists about text,
  -- Cities the inspector serves, chosen from the cities present in their
  -- county's listings. Feeds the per-city pages when those exist.
  add column if not exists service_cities jsonb not null default '[]'::jsonb;

create index if not exists idx_listings_claimed_by on public.listings(claimed_by);

-- One live claim per account. An inspector holds one license; an account that
-- could claim several would be the obvious way to squat on competitors.
create unique index if not exists uniq_listing_per_claimant
  on public.listings (claimed_by)
  where claimed_by is not null;

-- ---------------------------------------------------------------------------
-- claim_listing(license)
--
-- Attaches the signed-in user to an unclaimed listing and moves it to
-- 'claimed'. Refuses anything it cannot do cleanly, with a message written to
-- be shown to the inspector as-is.
--
-- A listing that is already claimed or featured but has no claimed_by (RMC,
-- set up by hand before this existed) is refused rather than handed to whoever
-- asks first: those are linked by hand, once, with
--   update listings set claimed_by = '<auth user id>' where license_number = 'HI####';
-- ---------------------------------------------------------------------------
create or replace function public.claim_listing(p_license text)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_license text := upper(regexp_replace(coalesce(p_license, ''), '\s', '', 'g'));
  v_row public.listings;
begin
  if v_uid is null then
    raise exception 'You need to be signed in to claim a listing.';
  end if;
  if v_license !~ '^HI[0-9]{1,6}$' then
    raise exception 'That does not look like a Florida home inspector license number. It is the HI number on your license, like HI3532.';
  end if;
  if exists (select 1 from public.listings where claimed_by = v_uid) then
    raise exception 'This account already has a listing. Release it from your dashboard before claiming another.';
  end if;

  select * into v_row from public.listings where license_number = v_license for update;
  if not found then
    raise exception 'No listing with license % yet. We list counties one at a time; if yours is not on the site, tell us and we will add it.', v_license;
  end if;
  if v_row.delisted_at is not null then
    raise exception 'License % no longer appears in the DBPR extract, so it cannot be claimed. If the state shows it as current, contact us.', v_license;
  end if;
  if v_row.claimed_by is not null then
    raise exception 'License % has already been claimed. If that was not you, contact us and we will sort it out.', v_license;
  end if;
  if v_row.tier <> 'unclaimed' then
    raise exception 'License % was set up before self-serve claims existed. Contact us and we will attach it to your account.', v_license;
  end if;

  update public.listings
     set claimed_by = v_uid,
         tier = 'claimed',
         claimed_at = now()
   where id = v_row.id
   returning * into v_row;
  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- update_my_listing(...)
--
-- Writes the fields an inspector controls on the one listing attached to their
-- account. Every parameter replaces the stored value, so passing null clears a
-- field; the dashboard always sends all of them.
-- ---------------------------------------------------------------------------
create or replace function public.update_my_listing(
  p_business_name text,
  p_phone text,
  p_website text,
  p_specialties jsonb,
  p_years_experience int,
  p_about text,
  p_service_cities jsonb
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.listings;
  v_business text := nullif(trim(coalesce(p_business_name, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_website text := nullif(trim(coalesce(p_website, '')), '');
  v_about text := nullif(trim(coalesce(p_about, '')), '');
  v_specialties jsonb;
  v_cities jsonb;
begin
  if v_uid is null then
    raise exception 'You need to be signed in.';
  end if;

  if v_business is not null and length(v_business) > 80 then
    raise exception 'Business name is too long (80 characters at most).';
  end if;

  -- Ten digits, optionally with a leading 1, however it was typed. Stored as
  -- typed so it renders the way the inspector wrote it.
  if v_phone is not null then
    if length(regexp_replace(v_phone, '\D', '', 'g')) not between 10 and 11
       or length(v_phone) > 25 then
      raise exception 'Phone number should be a 10-digit US number.';
    end if;
  end if;

  if v_website is not null then
    if v_website !~* '^https?://' then
      v_website := 'https://' || v_website;
    end if;
    if v_website !~* '^https?://[a-z0-9.-]+\.[a-z]{2,}(/\S*)?$' or length(v_website) > 200 then
      raise exception 'Website should be a plain address like yourcompany.com.';
    end if;
  end if;

  if v_about is not null and length(v_about) > 800 then
    raise exception 'About is too long (800 characters at most).';
  end if;

  if p_years_experience is not null and (p_years_experience < 0 or p_years_experience > 80) then
    raise exception 'Years in business should be between 0 and 80.';
  end if;

  if p_specialties is null or jsonb_typeof(p_specialties) <> 'array' then
    v_specialties := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(trim(e #>> '{}')), '[]'::jsonb)
      into v_specialties
      from jsonb_array_elements(p_specialties) e
     where jsonb_typeof(e) = 'string'
       and length(trim(e #>> '{}')) between 1 and 40;
    if jsonb_array_length(v_specialties) > 8 then
      raise exception 'Pick up to eight services.';
    end if;
  end if;

  if p_service_cities is null or jsonb_typeof(p_service_cities) <> 'array' then
    v_cities := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(trim(e #>> '{}')), '[]'::jsonb)
      into v_cities
      from jsonb_array_elements(p_service_cities) e
     where jsonb_typeof(e) = 'string'
       and length(trim(e #>> '{}')) between 1 and 40;
    if jsonb_array_length(v_cities) > 12 then
      raise exception 'Pick up to twelve cities.';
    end if;
  end if;

  update public.listings
     set business_name = v_business,
         phone = v_phone,
         website = v_website,
         specialties = v_specialties,
         years_experience = p_years_experience,
         about = v_about,
         service_cities = v_cities
   where claimed_by = v_uid
   returning * into v_row;
  if not found then
    raise exception 'No listing is attached to this account yet.';
  end if;
  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- release_my_listing()
--
-- The inspector's own undo. Returns a claimed listing to exactly what an import
-- would produce, the same as set-tier.mjs does for a cancellation. A featured
-- listing is refused: that has billing attached and is handled by a person.
-- ---------------------------------------------------------------------------
create or replace function public.release_my_listing()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.listings;
begin
  if v_uid is null then
    raise exception 'You need to be signed in.';
  end if;
  select * into v_row from public.listings where claimed_by = v_uid for update;
  if not found then
    raise exception 'No listing is attached to this account.';
  end if;
  if v_row.tier = 'featured' then
    raise exception 'This listing has a featured spot. Contact us to cancel it and we will release the listing at the same time.';
  end if;
  update public.listings
     set claimed_by = null,
         tier = 'unclaimed',
         claimed_at = null,
         business_name = null,
         phone = null,
         website = null,
         about = null,
         specialties = '[]'::jsonb,
         service_cities = '[]'::jsonb,
         years_experience = null,
         logo_path = null,
         -- Billing ids belong to the person who released, not to the row.
         -- Left behind, the next person to claim this license would check
         -- out against the previous claimant's Stripe customer. Found on the
         -- first sandbox test, 2026-09-12; re-run this function definition.
         stripe_customer_id = null,
         stripe_subscription_id = null,
         featured_since = null,
         featured_cities = '[]'::jsonb
   where id = v_row.id;
end
$$;

-- Signed-in users only. PUBLIC would include anon, and these check auth.uid()
-- anyway, but there is no reason to let the anon role call them at all.
revoke all on function public.claim_listing(text) from public, anon;
revoke all on function public.update_my_listing(text, text, text, jsonb, int, text, jsonb) from public, anon;
revoke all on function public.release_my_listing() from public, anon;
grant execute on function public.claim_listing(text) to authenticated;
grant execute on function public.update_my_listing(text, text, text, jsonb, int, text, jsonb) to authenticated;
grant execute on function public.release_my_listing() to authenticated;

-- ---------------------------------------------------------------------------
-- No cold sign-ups.
--
-- An account exists only to claim a listing, so creating one requires an
-- unclaimed listing to name. /claim/ sends the license number as user metadata
-- on the sign-in request; this trigger refuses the auth.users insert when that
-- metadata names no claimable listing. It runs inside Supabase Auth's own
-- insert, so it holds even for someone calling the auth API directly with the
-- anon key — the page's check is for a friendly message, this is the rule.
--
-- "Claimable" here is looser than claim_listing's: any listing with no account
-- attached and a current license, whatever its tier. That lets an inspector
-- whose featured listing was set up by hand (RMC) create an account with their
-- license, after which the listing is attached to it with a one-off UPDATE.
--
-- Supabase Auth surfaces a refused insert as "Database error saving new user";
-- the page translates that. An existing account is not inserted and is not
-- checked: it signs in with any license and is judged at claim time.
-- ---------------------------------------------------------------------------
create or replace function public.require_claimable_license()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_license text := upper(regexp_replace(coalesce(new.raw_user_meta_data->>'license', ''), '\s', '', 'g'));
begin
  if v_license = '' then
    raise exception 'Accounts are created by claiming a listing. Start from your listing on the site.';
  end if;
  if not exists (
    select 1 from public.listings
     where license_number = v_license
       and delisted_at is null
       and claimed_by is null
  ) then
    raise exception 'License % is not an unclaimed listing on this site.', v_license;
  end if;
  return new;
end
$$;

drop trigger if exists require_claimable_license on auth.users;
create trigger require_claimable_license
  before insert on auth.users
  for each row execute function public.require_claimable_license();

-- ---------------------------------------------------------------------------
-- City pages (added later the same day).
--
-- A featured listing's card shows at the top of each city page named here,
-- two spots per city. Set by scripts/set-tier.mjs --cities, never by the
-- inspector; empty means the listing's own city. Safe to add after the site
-- has deployed: the build reads select('*') and treats a missing column as
-- an empty list.
-- ---------------------------------------------------------------------------
alter table public.listings
  add column if not exists featured_cities jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Stripe (added later the same day).
--
-- Written only by the Netlify functions with the service-role key. The
-- dashboard reads them back through the public select to decide whether to
-- show "Start featured" or "Manage billing"; a customer id and a
-- subscription id identify nothing outside Stripe's dashboard.
-- ---------------------------------------------------------------------------
alter table public.listings
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists featured_since timestamptz;

create index if not exists idx_listings_stripe_subscription
  on public.listings (stripe_subscription_id)
  where stripe_subscription_id is not null;
