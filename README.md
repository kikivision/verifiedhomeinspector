# Verified Home Inspector

A Florida home-inspector directory, built county-by-county from public
DBPR license records. Astro + Supabase, matching the stack already used
for Jet & Swim and Sky & Swim.

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in the real Supabase anon key from
   the **verified-home-inspector** project (Supabase dashboard >
   Project Settings > API). The project URL is already filled in.
3. Run the schema migration (`../verified-home-inspector-schema.sql`)
   in the Supabase SQL Editor if you haven't already.
4. Optionally run `supabase/seed.sql` in the SQL Editor to load ~11
   real, DBPR-verified Pinellas records to develop against before the
   full scraper is built.
5. `npm run dev`

## Adding a new county

Edit `src/lib/counties.ts` — that's the only file that needs to
change. Flip a county's `status` from `coming_soon` to `live` once
its DBPR data has been pulled and imported into the `listings` table
(with `county` set to the matching slug, e.g. `'hillsborough'`).

## How data gets in

This site does NOT scrape DBPR itself — that's a separate script,
still to be built, that pulls records and inserts them into the
`listings` table (matching the schema in
`../verified-home-inspector-schema.sql`). This site only reads from
that table and renders it.

## Rebuild required for new data

Pages are statically generated at build time, not server-rendered.
A new claim, a tier upgrade, or a freshly scraped county needs a
rebuild + redeploy (e.g. a Netlify build hook) to show up on the live
site — it won't appear automatically just because the database
changed.

## Analytics scope (v1)

`src/lib/analytics.ts` logs CLICKS only (`click_request`), tagged
with `page_context` so reporting can show which page/filter drove
the click. Raw impression logging and full lead-capture forms
(collecting a homeowner's info and emailing the inspector) are both
deliberately out of scope for v1 — see the comments in that file
before adding either.

## Decisions

Things decided but not built, and things built in a way that looks wrong
until you know why, live in [DECISIONS.md](DECISIONS.md). Read it before
changing the featured row.

## Brand tokens

All colors, type, and component styles live in
`src/styles/global.css`, carried over exactly from the approved
mockup. Match the existing tokens rather than introducing new ones
if you extend the design.
