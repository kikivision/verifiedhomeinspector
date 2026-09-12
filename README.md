# Verified Home Inspector

A Florida home-inspector directory, built county-by-county from public
DBPR license records. Astro + Supabase, matching the stack already used
for Jet & Swim and Sky & Swim.

Live at https://verifiedhomeinspector.com. Four counties: Pinellas,
Hillsborough (shown as Tampa), Pasco, and Orange (shown as Orlando).

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
loop. `/for-inspectors/` states the offer and the prices; `/claim/` sends
a Supabase magic link; `/dashboard/` is where they enter their license
number and fill in what the listing shows. Every write goes through a
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

- Email provider enabled, with magic links, and "Allow new users to sign
  up" left ON. Sign-ups are gated in the database instead: the
  `require_claimable_license` trigger refuses an account whose sign-in
  request did not carry an unclaimed license number, which is what
  `/claim/` sends. There are no cold sign-ups and no accounts that belong
  to nobody. The default "magic link" template is what the inspector
  receives.
- Site URL `https://verifiedhomeinspector.com`, and
  `https://verifiedhomeinspector.com/dashboard/` plus
  `http://localhost:4321/dashboard/` in the redirect allowlist. A link
  that redirects somewhere not on the list lands on the site root with
  no session.
- Custom SMTP. Supabase's built-in sender is rate-limited to a handful of
  emails an hour and only delivers to project members, which is fine for
  testing and useless for a real inspector. Resend with a
  `mail.verifiedhomeinspector.com` sending domain is the known-good setup
  from SuperReports.
- A database webhook on `listings` (UPDATE) pointing at the Netlify build
  hook, so a claim or a save rebuilds the site. Without it, nothing an
  inspector does is visible until someone deploys. See "Rebuild required
  for new data" below.

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
on `/for-inspectors/`). GA4 mirrors these as `request_inspector`,
`claim_completed` and `featured_inquiry`.

## Brand tokens

All colors, type, and component styles live in
`src/styles/global.css`, carried over exactly from the approved
mockup. Match the existing tokens rather than introducing new ones
if you extend the design.

## Decisions

Things decided but not built, and things built in a way that looks wrong
until you know why, live in [DECISIONS.md](DECISIONS.md). Read it before
changing the featured row.
