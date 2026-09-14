-- Claim welcome email.
--
-- Batch 1 of the Pinellas outreach (2026-09-14) produced three claims in the
-- first hour, and two of the three stopped right after typing a phone number:
-- no cities served, no services, no years, no about. The dashboard's only
-- post-claim prompt was one line of status text. This sends the inspector an
-- email the moment they claim, listing what is still empty on their page and
-- linking to the dashboard.
--
-- Same shape as rebuild_site_on_listing_change: a trigger on listings calls
-- out through pg_net, wrapped so a delivery problem can never roll back the
-- claim itself. The Netlify function (netlify/functions/claim-welcome.mts)
-- does the actual work — looks up the claimant's address in auth, renders the
-- message, sends through Resend, stamps welcome_sent_at — because plpgsql has
-- no business holding a Resend key or building email bodies.
--
-- Fires ONLY on the self-serve claim: claimed_at going from null to set with a
-- claimed_by user. A listing set to 'claimed' by scripts/set-tier.mjs has no
-- claimed_by and therefore no inbox to write to, and the Stripe webhook only
-- ever touches a listing that is already claimed.
--
-- Replace <CLAIM_WELCOME_SECRET> with the value of the CLAIM_WELCOME_SECRET
-- environment variable set on Netlify before running, the same way the build
-- hook URL is pasted into rebuild_site_on_listing_change. The function
-- refuses any call that does not carry it.

alter table public.listings
  add column if not exists welcome_sent_at timestamptz;

comment on column public.listings.welcome_sent_at is
  'When the post-claim welcome email was sent. Set by the claim-welcome function; makes a retried webhook a no-op.';

create or replace function public.send_claim_welcome_on_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform net.http_post(
      url := 'https://verifiedhomeinspector.com/.netlify/functions/claim-welcome',
      body := jsonb_build_object('listing_id', new.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Claim-Welcome-Secret', trim('<CLAIM_WELCOME_SECRET>')
      )
    );
  exception when others then
    raise warning 'send_claim_welcome_on_claim: welcome not requested for %: %', new.license_number, sqlerrm;
  end;
  return null;
end
$$;

drop trigger if exists send_claim_welcome_on_claim on public.listings;
create trigger send_claim_welcome_on_claim
  after update on public.listings
  for each row
  when (
    old.claimed_at is null
    and new.claimed_at is not null
    and new.claimed_by is not null
  )
  execute function public.send_claim_welcome_on_claim();
