# Verified Home Inspector

A Florida home-inspector directory, built county-by-county from public
DBPR license records. Astro + Supabase, matching the stack already used
for Jet & Swim and Sky & Swim.

Live at https://verifiedhomeinspector.com. Statewide since 2026-09-12:
every Florida county with five or more licensed inspectors, 56 of them,
about 7,200 listings. `src/lib/counties.ts` is the list.

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in the values — see **Environment**
   below for what each one is and which are optional.
3. Run `verified-home-inspector-schema.sql` (repo root) in the Supabase
   SQL Editor if you haven't already, then everything in
   `supabase/migrations/` in date order. The schema file is the source
   of truth for tables; the migrations carry the functions the dashboard
   calls and the deltas for a project that already existed. There is no
   migration tooling, so each is applied by hand, once.
4. Optionally run `supabase/seed.sql` in the SQL Editor to load ~11
   real, DBPR-verified Pinellas records to develop against.
5. `npm run dev`

Run `npm run verify` before opening a pull request. It builds and runs
`scripts/smoke-test.mjs` against the built HTML; CI runs the same thing.
See [CLAUDE.md](CLAUDE.md) for why every assertion in that file exists.

## Environment

| Variable | Needed for |
|---|---|
| `PUBLIC_SUPABASE_URL` | everything |
| `PUBLIC_SUPABASE_ANON_KEY` | reading listings; the site's own key, read-only |
| `SUPABASE_SERVICE_ROLE_KEY` | writing — `import-dbpr.mjs` and `set-tier.mjs`. Not needed for a dry run |
| `PUBLIC_GA_MEASUREMENT_ID` | optional; unset means the site runs without analytics rather than breaking |
| `NETLIFY_BUILD_HOOK` | optional; lets `set-tier.mjs --deploy` publish a change. Secret — anyone holding it can trigger a build |

## Self-serve claims

An inspector claims their own listing without anyone at Sunstate in the
loop. `/for-inspectors/` states the offer and the prices; `/claim/` emails
a 6-digit code through Supabase Auth and signs them in on the spot;
`/dashboard/` is where they enter their license number and fill in what
the listing shows. Every write goes through a
database function (`claim_listing`, `update_my_listing`,
`release_my_listing` in `supabase/migrations/`); there is no UPDATE
policy on `listings`, on purpose.

A claim goes live at once and emails the inbox through the
`claim-listing` Netlify form. To revoke one:

```
node --env-file=.env scripts/set-tier.mjs HI7816 unclaimed --deploy
```

**Supabase configuration the code assumes** (Authentication settings in
the Supabase dashboard; none of it is in the repo):

- Email provider enabled and "Allow new users to sign up" left ON. **Two**
  email templates must carry `{{ .Token }}` so the email is a code rather
  than a link: **Confirm sign up**, which is what a first-time email
  receives (Supabase treats an unknown address as a sign-up even through
  signInWithOtp), and **Magic link or OTP**, which every later sign-in
  receives. Missing the first one means the very first inspector gets a
  "confirm your email" link and no code. The email OTP length must be
  **6** — the page's input accepts six digits and nothing else. (This
  drifted to 8 on SuperReports once and every sign-in failed; check the
  live setting, not the runbook.) Sign-ups are gated in the database instead: the
  `require_claimable_license` trigger refuses an account whose sign-in
  request did not carry an unclaimed license number, which is what
  `/claim/` sends. There are no cold sign-ups and no accounts that belong
  to nobody. The Magic Link template, edited to carry the code, is what
  the inspector receives.
- Site URL `https://verifiedhomeinspector.com`. No redirect allowlist is
  needed: the code is verified on `/claim/` itself and nothing follows a
  link back.
- Custom SMTP. Supabase's built-in sender is rate-limited to a handful of
  emails an hour and only delivers to project members, which is fine for
  testing and useless for a real inspector. Resend with a
  `mail.verifiedhomeinspector.com` sending domain is the known-good setup
  from SuperReports.
- The `rebuild_site_on_listing_change` trigger from the migration file,
  with the `supabase-listings` build hook URL pasted in and the `pg_net`
  extension enabled, so a claim or a save rebuilds the site. Not the
  dashboard's point-and-click Database Webhook: that fires on every
  update, and the monthly import would queue hundreds of builds. Without
  the trigger, nothing an inspector does is visible until someone
  deploys. See "Rebuild required for new data" below.

## Per-inspector pages

Every live listing builds a page at
`/fl/<county>/<city>/<hi####-licensee-name>/` (about 1,300 pages), and
every claimed listing builds a badge at `/badge/HI####.svg` that the
inspector embeds on their own site, linking back. The path segment comes
from the licensee name in the state record — never the business name,
which changes on claim — so a page's URL never moves; `src/lib/slug.ts`
is the one place that rule lives and the dashboard's badge snippet uses
it too. See [DECISIONS.md](DECISIONS.md) for why.

The build reads listings per county (`getAllListings`) because PostgREST
caps a query at 1,000 rows and one query for the table would silently
build no page for the tail. The smoke test fails if fewer than 1,000
inspector pages come out.

## City pages

`/fl/<county>/<city>/` is built for every city with three or more
listings (`MIN_CITY_LISTINGS` in `src/lib/cities.ts`); smaller cities
get no page, and their inspectors' pages link to the filtered county
page instead. Each city page has four featured spots. A featured listing
shows on the city pages named in its `featured_cities`, or on its own
city's page when that is empty:

```
node --env-file=.env scripts/set-tier.mjs HI7816 featured --position 1   --cities "Largo, Clearwater, Seminole" --deploy
```

City names must be spelled as the site shows them. The script refuses a
third card in a two-spot city and a fourth city on one listing:
$50/month covers the county page plus up to three city pages. Claimed inspectors also appear on the
pages of the cities they chose as served on their dashboard, in a
"Based nearby, serves …" section — that part is free.

## Featured spots are sold through Stripe

A claimed inspector buys a featured spot from `/dashboard/`: they pick up
to three city pages, and `netlify/functions/create-checkout.mts` starts
a Stripe Checkout session for a $50/month subscription with a 7-day free
trial. `netlify/functions/stripe-webhook.mts` moves the listing to
`featured` when Stripe confirms, assigns the county-page position, sets
`featured_cities`, and triggers a rebuild; a canceled or unpaid
subscription moves it back to `claimed`. `billing-portal.mts` sends them
to Stripe's customer portal to update a card or cancel. `set-tier.mjs`
still exists for spots arranged by hand (RMC), which have no Stripe ids
and show "set up directly with us" on the dashboard. `npm run check`
type-checks the functions along with the site.

**Setup, once, in this order:**

1. Stripe (test mode first) → Product "Verified Home Inspector — Featured
   spot", recurring price **$50.00 / month**. Copy the `price_…` id. A
   later price rise is a *new* price for new buyers; existing
   subscriptions keep theirs, which is the founding-rate promise.
2. Stripe → Developers → Webhooks → Add endpoint
   `https://verifiedhomeinspector.com/.netlify/functions/stripe-webhook`
   with events `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy the `whsec_…` signing secret.
3. Stripe → Settings → Billing → Customer portal: enable it, allow
   canceling and updating payment methods.
4. Netlify → Site configuration → Environment variables:
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FEATURED`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NETLIFY_BUILD_HOOK`. (`PUBLIC_SUPABASE_URL`
   is already there for the build; `URL` is set by Netlify.)
5. Run the Stripe block at the bottom of
   `supabase/migrations/2026-09-12-self-serve-claims.sql`.
6. Test with the test account: buy with card `4242 4242 4242 4242`, any
   future date, any CVC. The dashboard should flip to "You're featured"
   and the county page should show the card after the rebuild. Cancel
   from Manage billing and watch it come down.
7. Go live: swap `STRIPE_SECRET_KEY` for the live key, register the
   webhook again in live mode (a new `whsec_…`), and create the price in
   live mode (a new `price_…`). All three env vars change.

## How data gets in

`scripts/import-dbpr.mjs` pulls the official DBPR public-records extract
for the Home Inspector board and writes it to `listings`. It is not a
scrape of the licence-lookup UI.

```
node --env-file=.env scripts/import-dbpr.mjs --county orange --dry-run
node --env-file=.env scripts/import-dbpr.mjs --county orange
```

Claimed data is never overwritten: only `city`, `licensee_name` and
`delisted_at` are written back to an existing row, so an import cannot
revert a paying customer. Licences that stop appearing in the extract
are marked `delisted_at` and never deleted.

Every county carries an **anchor city** that the importer checks before
writing — the anchor must appear among the top five cities in the
matched rows, or the run refuses. Two of the original three county codes
were wrong and nothing caught it, because a wrong code still returns
rows and still reports success.

## Adding a new county

Two files, then an import:

1. `scripts/import-dbpr.mjs` — add the DBPR county code and an anchor
   city to `COUNTIES`. **Verify the code against the extract** rather
   than looking it up; group the CSV by county code and read the city
   distribution.
2. Run the import (dry run first).
3. `src/lib/counties.ts` — add the county and set `status: 'live'`.
   Everything else reads from this list: the pages, the nav, the county
   selector, the sitemap filter, and the homepage chooser. Set `metro`
   when the city people search for is not the county name — Orlando for
   Orange, Tampa for Hillsborough. It drives the title, description and
   H1 only; the county name still labels the page and every form.

Import before flipping to `live`, or the county goes live empty.

## Changing a listing

`scripts/set-tier.mjs` — for featured spots and revoking claims; an
inspector's own details are theirs to change on `/dashboard/`. Never
hand-written SQL against the live table.
It checks what it is about to do, reports what changed, and refuses what
it cannot verify.

```
node --env-file=.env scripts/set-tier.mjs HI7816 featured --position 1 \
  --business "RMC Inspections" --phone "727-422-7688" \
  --specialties "4-Point Inspections, Wind Mitigation, Roof Certifications" \
  --experience 14 --logo /logos/rmc-inspections.png --deploy
```

`--specialties` **replaces** the list rather than adding to it, so a
shorter list drops what it omits — that is how an inspector removes a
service, and it is also how you delete one by accident. `--logo ""`
removes a logo the same way.

`--dry-run` prints the change and writes nothing, and is the fastest way
to see exactly which fields a command would touch. `--deploy` triggers a
rebuild, which is required for any of it to be visible (see below).

## Rebuild required for new data

Pages are statically generated at build time. A tier change, a new logo
or a freshly imported county will **not** appear on the live site just
because the database changed — the built HTML is a photograph of the
data at build time.

Either pass `--deploy`, or merge anything to `main`, which rebuilds and
re-reads Supabase on the way.

## Contact is shown on claimed listings

A claimed or featured listing shows its phone number as a `tel:` link and
its website as a link; an unclaimed one shows neither, because there is
nothing on file. A tap on the number logs `click_phone` before the dial.
Until 2026-09-12 no listing showed contact on any tier, so that requests
could be counted against a "free until five requests" offer; that offer
is retired and the reasoning is in [DECISIONS.md](DECISIONS.md).

## Analytics scope

`src/lib/analytics.ts` logs clicks — `click_request` — to Supabase,
tagged with `page_context`. Raw impression logging remains deliberately
out of scope; read the comments in that file before adding it.

Four Netlify forms carry the real conversions, read out of the built
HTML so none of them needs a mailbox on this domain:
`inspector-request` (a homeowner asking for an inspection),
`claim-listing` (posted from the dashboard after a self-serve claim),
`featured-inquiry` (an inspector asking about a paid spot, from the
county page or the dashboard) and `inspector-question` (the contact form
on `/for-inspectors/`).

GA4 events, all sent through `trackEvent` and only from the live host.
Key events (conversions) are the four marked; everything else is a
funnel step for reading drop-off.

| Event | Fires when | Key |
|---|---|---|
| `request_inspector` | request dialog opened (intent, including abandons) | |
| `request_submitted` | homeowner request form sent (`/request-received/`) | **yes** |
| `click_phone` | tap on a claimed listing's phone number | **yes** |
| `claim_listing` | claim link clicked on a row or an inspector page | |
| `claim_code_sent` | sign-in code emailed from `/claim/` | |
| `claim_signed_in` | code accepted | |
| `claim_completed` | listing attached to the account | **yes** |
| `listing_saved` | dashboard save | |
| `listing_released` | inspector released their listing | |
| `featured_inquiry` | ad-slot "Get featured" dialog opened (curiosity, not intent) | |
| `featured_submitted` | featured inquiry form sent (`/featured-received/`) | |
| `featured_checkout_started` | "Start featured" pressed on the dashboard | |
| `featured_purchased` | back from Stripe with `?featured=success` | **yes** |

`claim_submitted` no longer exists: it fired from the claim confirmation
page, which went with the county claim form.

## Brand tokens

All colors, type, and component styles live in
`src/styles/global.css`, carried over exactly from the approved
mockup. Match the existing tokens rather than introducing new ones
if you extend the design.

## Decisions

Things decided but not built, and things built in a way that looks wrong
until you know why, live in [DECISIONS.md](DECISIONS.md). Read it before
changing the featured row.
