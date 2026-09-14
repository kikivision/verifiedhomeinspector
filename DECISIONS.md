# Decisions

Things decided but not built, and things built in a way that looks wrong
until you know why. Newest first.

---

## 2026-09-14 — City pages hold six too, so buyers five and six get real cities

**Built.** `CITY_FEATURED_CAP` is 6, matching the county page.
`CITY_FEATURED_TARGET` stays 4 and is what the city page draws open-slot
cards from, so an empty Gulfport shows four dashed boxes rather than six
on a page with three inspectors. The copy says "6 spots per city, never
more" on city pages, the sales page, the featured dialog, the dashboard
and the terms page, which now reads "each city page and each county page
holds at most six." `set-tier.mjs` and the smoke test follow. Reverses
"four cards per city" in the 2026-09-12 entry, hours after the county
cap moved to six.

### Why

With the county at six and each buyer naming three cities, four per city
left the fifth and sixth buyers shut out of the only cities they wanted.
In Pinellas, St. Petersburg and Clearwater were both full after four
buyers; five and six would have paid $50 for Tarpon Springs and Dunedin.
At six they get St. Petersburg and Clearwater like everyone else. The
point of the product is that a paying inspector gets the cities they
actually work in, not that we learn which cities are scarce.

This deliberately gives up the per-city waitlist signal: six buyers
naming three cities each is eighteen demands, and three cities at six
slots is eighteen slots, so in the concentrated case no city queue ever
forms. That is the trade, taken on purpose. Making people wait was never
the goal, and the county queue at buyer seven is the signal that matters.
It also removes most of the need for the city-swap machinery in the
waitlist entry above: the buyer who would have wanted to upgrade to
Clearwater now simply gets Clearwater.

### Small cities need no smaller cap

A city page holds at most as many featured cards as inspectors who named
it, and nobody picks Gulfport over Clearwater. Those pages stay small on
their own, so the cap can be one number everywhere and the copy can stay
one sentence.

### On diluting the inspector who already paid

Inspected PLLC bought at 3:32pm on 2026-09-14, hours before both cap
changes, under copy that said four. Doing this on day one, with one
paying inspector, is the cheapest it will ever be; five months from now
it is a promise taken back from a dozen people. He also keeps
`featured_position` 1, which orders the county page and every city page
he is on, so the extra cards land below him and nothing reshuffles: the
terms already promise that an inspector already featured keeps their
placement, and nothing in the code ever reassigns a held position.

---

## 2026-09-14 — The featured card: logo in the corner, contact on the bottom line, six specialties

**Built.** Three changes to `FeaturedCard.astro` and its CSS, all forced
by the county page going to six cards.

- **The logo is an 80x60 tile in the top-right corner**, not a
  full-width plate above the name. At full width the plate was the
  dominant thing on the card, pushed the business name to the middle,
  and made the grid ragged: RMC's card was much taller than the card
  beside it, and a square or tall logo made it worse. The profile page
  keeps the full-size plate. `data-logo` on the card pads the name clear
  of the tile; it is a data attribute rather than a class because the
  smoke test counts exact `class="card featured"` strings.
- **The contact block is pinned to the bottom of the card** and labelled
  "Contact:". Grid rows stretch to their tallest card, so every contact
  line in a row now sits on the same baseline. The label is a real
  `<span>`, not CSS `content`, so a screen reader announces it. The cost
  is some air inside the shorter cards, which is the price of alignment.
- **Cards show six specialties, then "+N more"** linking to the
  inspector's own page. Inspected PLLC lists eleven, which wrapped to
  four rows of tags and doubled the card's height while the card beside
  it had three. Six fills two rows beside the logo tile.

The row is still only as short as its tallest card, so one inspector
with a long list still sets the height of their row. Six is the ceiling
on that.

---

## 2026-09-14 — The waitlist is a queue per city, and paying inspectors are in it too

**Decided. Not built.** Build it when any Pinellas city page fills, when
the county reaches six, or when a featured inspector asks to change
cities — whichever comes first. Supersedes the shape in the 2026-09-11
entry, which still holds for what the full-city card says; this entry is
what happens after someone joins.

### The case that decided it

Buyer six in Pinellas picks Tarpon Springs, Dunedin and Seminole because
St. Petersburg and Clearwater are full. A Clearwater slot frees. Today
nothing tells him, nothing tells us, and he could not act on it anyway:
his dashboard offers Manage billing, which is Stripe, and Stripe knows
nothing about cities; `create-checkout` refuses him as already featured.
The slot goes to whoever checks out next, possibly someone who joined
after him. The waitlist was imagined as a line of people with no spot.
The people most likely to be in it already pay us.

### How it works

- **One queue per city page.** A row is (listing, city, joined_at, and
  for a featured inspector, which of their current cities the new one
  replaces). One row per listing per city. Joined from the dashboard: a
  city marked "(full)" stays clickable and asks "replace which?" if the
  inspector is featured, or reads "invite me when it opens" if claimed.
  The public full-city card (2026-09-11 entry) sends a claimed inspector
  to the same place after they claim.
- **A slot frees** in `reconcile` (cancellation), in a swap (below), or
  by `set-tier.mjs`. Whoever frees it runs the same promote step: first
  row in that city's queue by `joined_at`.
- **Promoting a featured inspector is an instant, free swap.** Update
  `featured_cities` (drop the named city, add the freed one, still at
  most `MAX_FEATURED_CITIES`), rebuild, email "You're on Clearwater now;
  Seminole is released." Nothing is charged, so no fresh yes is needed.
  The dropped city is now free: run promote again for it. Swaps cascade,
  and the cascade is bounded because each listing holds at most three.
- **Promoting a claimed inspector is an invite.** Email with a checkout
  link and a hold window (72 hours to start). Checkout honors the hold by
  treating the reserved slot as theirs; if it lapses, the next row is
  promoted. Never charge a stored card: "nothing is charged until it is
  live and you have seen it" has been promised since the first county
  page (see `create-checkout.mts`).
- **Order is joined_at, featured or not.** No priority rule. A featured
  inspector's promotion completes at once while a claimed one's waits on
  a hold, so the incumbent gets the practical edge without a special
  case to explain.
- **A separate county queue** for the six county positions, for claimed
  inspectors only; featured inspectors already hold one. Promote on the
  same trigger, invite-only, same hold. `create-checkout` must refuse a
  full county the way it refuses a full city today, and the county page
  must slice at `FEATURED_CAP`, or nothing is ever scarce and nobody
  joins.

### Build first: self-serve city changes

Changing cities into a city that already has room is the same write as a
swap, minus the queue: availability check, update `featured_cities`,
rebuild, email. Listed as "not built, contact form for now" on
2026-09-12. It is the prerequisite for the swap step and fixes buyer six
on its own on any day he happens to look; the queue is what makes him not
have to look.

### Why it matters beyond fairness

Queue length per city is the pricing instrument the 2026-09-11 entry
wanted, one level finer. Six waiting on Clearwater and none on Tarpon
Springs says which pages are worth more than $50, which the county queue
alone never could.

### What is deliberately not in it

No prorating, no partial months, no price differences by city or
position, no rising-over-time within the six. Position is the lowest
open number at fulfillment and stays yours while you stay; when position
one cancels the next buyer takes it. None of that is stated on the site
yet, and should not be until the row holds four or more cards.

---

## 2026-09-14 — The county page holds six featured spots, not four

**Built.** `FEATURED_CAP` on the county page, `COUNTY_POSITIONS` in
`netlify/lib/featured.mts` and `FEATURED_CAP` in `set-tier.mjs` are 6.
The open-slot copy and the terms page say "never more than six." The page
still draws only `FEATURED_TARGET` (4) "This spot could be yours" cards:
the copy states the ceiling, the page does not draw six empty boxes to
prove it. The smoke test now checks the rendered row against both
numbers and that the copy states the cap. City pages are unchanged at
four. The `featured_position` check in the schema already allowed 1–6.
Reverses "four on the county page" in the 2026-09-12 city-pages entry.

### Why

The four was chosen so that paid cards would not push the listings below
them too far down the page. That mattered when every row below the
featured grid was the product. It is not any more: since self-serve
claims (2026-09-12) the rows below are free claimed and unclaimed
listings, so two more paid cards above them cost nobody anything.

The county cap is the binding constraint on featured, and it binds long
before the city slots do. Pinellas has 56 city slots and had 4 county
positions, 2 taken on 2026-09-14 by the first paying subscriber and the
one comped card. Statewide: 1,260 city slots against 224 county
positions. Raising the county cap to six moves the statewide ceiling from
224 to 336 positions ($16,800/month at $50 and full occupancy, from
$11,200) and Pinellas from $200 to $300 a month, without touching the
city promise.

Inspectors think in counties: they service the whole county and see the
county spot as the product, with the three city pages as a bonus. Both
paying/comped cards in Pinellas picked St. Petersburg and Clearwater
among their three, so the big cities fill at about the same time the
county does. The fifth and sixth buyers will get the county page and
three cities from the 19-to-30-inspector tier (Largo, Palm Harbor, Tarpon
Springs, Seminole, Dunedin), not the two largest. That is real value and
it is shown honestly: the dashboard lists every city with "(N open)" or
"(full)" before checkout, and `create-checkout` refuses a full city
before Stripe. The first four getting the best cities is the reward for
being early, which is the same story the founding rate tells.

### What is still not built

Nothing enforces the six at checkout: `create-checkout` checks city
availability only, and `nextPosition` returns null past six, which the
webhook writes without an error. The county page also renders every
featured row rather than slicing at the cap. Both are part of the
waitlist build in the 2026-09-11 entry, which is now scoped to the
county-full case as well as the city-full one. Two of six Pinellas
positions are taken, so the seventh buyer is at least four sales away.

## 2026-09-12 — The request button is gone: the site does what the ad says

**Built.** No "Request this inspector" button on featured cards, listing
rows or inspector pages; no `inspector-request` form; no
`/request-received/` page. `RequestDialog.astro` became
`ListingEvents.astro`, which keeps the phone-tap and claim-link logging.
The smoke test fails if either the form or the button text appears on
any page. Reverses the "the request button stays" line in the entry
below.

### Why

The Google Ads campaign written tonight says *Call an Inspector Directly*
and *No Lead Forms, No Middleman*; the outreach email to inspectors says
*homeowners call you; nobody's in the middle.* A form that sent a
homeowner's details to hello@ and to the inspector was a lead form with a
middleman — smaller and more honest than the ones the site positions
against, but the same shape, and an inspector reading the ad and then the
page would be right to call it a contradiction. The phone number is the
product. The site should not carry a second contact path that the pitch
says does not exist.

### What is lost

A written channel for the homeowner who will not call at 9pm, and the one
contact event the site could see end to end. `request_submitted` stops
firing; the Google Ads "Contacts" goal imported from it will sit at zero
and can be removed. `click_request` rows from before today stay in
`listing_events` and in the `listing_request_counts` view; nothing writes
them now.

### What it is not

Not a change to featured, claims, or the inspector-side forms
(`claim-listing`, `featured-inquiry`, `inspector-question`), which are
inspectors talking to us, not homeowners talking to inspectors.

---

## 2026-09-12 — A listing can be removed by hand, and it stays removed — but the list is empty

**Built.** `src/lib/removed.ts` names licenses taken off the site with a
date and a reason; `scripts/remove-listing.mjs` deletes the rows; the DBPR
importer never re-inserts a listed license; the build filters on the list;
the smoke test fails if a removed license appears in any page.

### Why it exists

The site's promise is "everyone on the state roll, verified" — a license is
listed because the state says it is current, and nothing else. But the
owner also answers for what the site points people at, and there has to be
a way to act on that which survives the monthly import, because the import
restores any row whose license reappears in the extract. Setting
`delisted_at` would be undone in thirty days. So the record of a removal
lives in the repo, and everything that touches the table reads it.

### Why the list is empty

The first candidate was an inspector with no phone number of his own whose
name, looked up, led through people-search sites that tripped malware
warnings. Before the delete ran, the one number attached to him turned out
to be the front desk of Waypoint Property Inspection, a large Tampa firm he
inspects for. He is listed with that number, marked as an employee, like
the Pillar To Post and Your Castle inspectors. The lesson is in
`removed.ts`: check the employer before a name goes on the list, because a
licensee with no footprint of their own is usually someone's employee, not
a ghost.

### What it is not

Not a moderation queue, and not a place to park inspectors someone
dislikes. Each entry carries the date and the reason, in the repo history,
because a directory that quietly drops licensed people is worse than one
that lists everyone. Expect the list to stay very short — or empty.

---

## 2026-09-12 — Services are a fixed list, and the insurance ones are marked

**Built.** `public.allowed_services()` and a check constraint on
`listings.specialties`; `update_my_listing` refuses a service by name and
stores picks in list order; `set-tier.mjs` validates against the same list.
Three services added (Termite (WDO), Sewer Scope, Commercial). The dashboard
checklist shows the insurance three first, under their own heading.
`INSURANCE_SPECIALTIES` in `src/lib/specialties.ts` names them in code.

### Why now

Shelton Home Inspections — the first St. Petersburg contact researched for
outreach — runs two front doors: one for buyers (the home inspection, once,
during a sale) and one for owners (4-point, wind mitigation, roof
certification, whenever a carrier asks). The second is the Florida
peculiarity: repeat, year-round, and not tied to a home sale. A city page is
a buyer page. "Wind mitigation inspection in St. Petersburg" is a different
query with a different reader, and the site cannot answer it until it knows
which inspectors in a city do that work.

That knowledge has to come from claims — the public-contact import can see
a service on a website but the rule is the inspector confirms their own —
so the cheap move today is to make sure the checklist data will be usable
when there is enough of it. That meant enforcing the list: the one featured
listing already carried "4-Point Inspections" beside the checklist's
"4-Point Inspection", after one `set-tier` run.

### What it is not

Not a service page. That waits for a city with three or more claimed
inspectors ticking insurance work, and it renders from `INSURANCE_SPECIALTIES`
when it comes. Not a change to what shows on an inspector's page today.

---

## 2026-09-12 — Unclaimed rows may carry a phone number, if it says where it came from

**Built.** `scripts/import-contacts.mjs` pre-fills phone, website and
business name on unclaimed rows from a hand-researched CSV, marked
`contact_source = 'public'`; the site shows them with "From a public
listing" and still offers the claim.

### Why the rule changed

The rule since the first county page was that an unclaimed row shows no
contact: nothing is on file, and a number the site invented would be a
promise it could not keep. That rule was about *invented* contact. A number
taken from the inspector's own website is not invented, and a city page of
95 names with no way to call any of them is a page a homeowner leaves — and
a page no advertising should ever be pointed at. Supply has to exist before
demand is sent to it, and in a new city the fastest supply is the phone
numbers inspectors already publish.

It also changes the claim pitch from "please sign up" to "your number is
already here; claim it to add your website and your own words," which is
the email that gets answered.

### What it is not

Not Google Places data. Places may be used to *find* a business and its
website; the number that goes on the page comes from that website or a
public listing, and the CSV's `source` column says which. Not a request
path: a pre-filled row shows a phone and a website, never the request
button, because a request goes to an email the site does not have. Not
permanent: a claim overwrites it, and the inspector sees the pre-filled
values as the starting point on their dashboard.

### What keeps it honest

The row says "Not yet claimed · From a public listing" in the same cell as
the number. The smoke test allows a phone number on an unclaimed row only
inside a block marked `data-contact="public"` that carries that note, and
refuses a request button there.

---

## 2026-09-12 — Statewide, in one afternoon

**Built.** Every Florida county with five or more licensed inspectors is
live: 56 counties, 7,166 listings, 7,500 pages. The nine counties left
out (Calhoun, Dixie, Franklin, Hamilton, Holmes, Jefferson, Lafayette,
Liberty, Madison) have one to four inspectors each; a county page with
two names on it is not a directory, and their inspectors are not on the
site at all rather than on a page nobody should land on.

### Why now

The revenue cap is inventory times price, and inventory is city pages.
Four counties held 51 city pages; the state holds 317. Every other lever
— price, spots per city, cities per buyer — moves the cap by a factor of
two at most; geography moves it by six. The imports were an afternoon
because the importer already refused a county whose code did not match
its anchor city, and the codes turned out to be the counties in
alphabetical order plus ten.

### What changed to make it hold

`formatCity` gained general rules (SAINT → St., FT → Fort, trailing FL)
because the alias table could not enumerate every spelling in 67
counties. The smoke test's page budget scales with the rows on the page:
Miami-Dade's 888 rows are 594KB at the same per-row weight as Pinellas's
316. City pages in one-city counties still render the county link. The
`/for-inspectors/` hero stopped naming counties.

### Not done

A county page with 888 rows is a long page. It works, it is under 60KB
compressed, and the city links sit above the table, but a county that
size may want the table collapsed behind the city pages eventually. Not
until someone complains.

---

## 2026-09-12 — Featured is bought on the dashboard, through Stripe

**Built.** A claimed inspector picks up to three city pages on
`/dashboard/` and pays through Stripe Checkout. Three Netlify functions
(`create-checkout`, `stripe-webhook`, `billing-portal`) do the work; the
site stays static.

### A subscription with a free week, not a charge on sign-up

Every page has promised "nothing is charged until the card is live and you
have seen it." A card charged at checkout breaks that; a 7-day trial keeps
it literally: the card goes up at the next rebuild, the first charge is on
day eight, and Stripe's portal lets them cancel before it. Trials also
remove the "let me think about it" step from the sale.

### Netlify Functions rather than Supabase Edge Functions

SuperReports uses Edge Functions. Here the site is already on Netlify with
git-push deploys, the Supabase project is not in the tooling Claude can
deploy to, and Netlify functions ship with the repo and need nothing but
environment variables. Same Stripe account as the other Sunstate brands.

### The webhook re-checks the cities

Two people can check out for the last spot in Clearwater in the same
minute. `create-checkout` refuses a full city before Stripe, but the
webhook checks again at fulfillment and features the card on the cities
still open, logging the one that filled. Refusing the whole purchase after
the card was taken is worse; a person sorts out the one city with a swap
or a partial refund.

### What set-tier.mjs is for now

Spots arranged by hand (RMC) and revoking claims. A hand-set spot has no
Stripe ids; the dashboard shows "set up directly with us" and no billing
button. Attaching Stripe to an existing hand-set spot is not built.

### Not built

Changing cities on a live subscription (contact form for now), a waitlist
when a city is full (the 2026-09-11 entry below still applies), and
prorating anything.

---

## 2026-09-12 — City pages, and featured is sold by city

**Built.** `/fl/<county>/<city>/` for every city with three or more
listings (about 60 across the four counties). Each carries four featured
spots of its own.

### The product is "featured where you work"

An inspector does not think in counties. They think in the cities their
jobs come from, and a homeowner searches a city ("home inspector St.
Petersburg"), not a county. So featured is one product with one price:
the inspector names the cities they serve, their card sits at the top of
each of those city pages and of the county page, two cards per city. The
county page's featured row shows whoever is featured anywhere in the
county, capped at `FEATURED_CAP`. There is no separate county-level SKU
and no city-level SKU; an earlier draft had both, and the question "why
would I pay more for the county page when Google sends people to the city
page" had no answer.

The list of cities is `featured_cities` on the listing, set by
`set-tier.mjs --cities "Largo, Clearwater"` and never by the inspector,
because it is the thing being sold. Empty means the listing's own city, so
RMC's spot bought before city pages existed lands on Largo without anyone
touching it. `set-tier.mjs` refuses a third card in a two-spot city.

**$50/month buys the county page plus up to three city pages** the
inspector names (`MAX_FEATURED_CITIES`; `set-tier.mjs` refuses a fourth).
Three because that is how the work is shaped — a home base and the towns
next to it — and because it leaves something to sell: an inspector who
wants six cities is a conversation, at a price that is not $50. The other
two shapes were $50 per city, which puts four cities at $200/month against
a founding rate chosen to be easy to say yes to, and $50 for every city in
the county, which lets one Largo inspector occupy a St. Petersburg slot he
never works. Cross-county is not possible: a listing lives in one county.

Four cards per city and four on the county page, and the copy says
"never more" on every page that sells one: an inspector buying a spot has
to know they will not be one of twenty. (For one day the city pages said
"two while we build out, never more than four" — a misreading of the
county page's old cap/target split. The cap was always four.)

### Why three listings is the threshold

The DBPR extract files a license under a county but carries whatever
mailing city the licensee gave. Pinellas holds one inspector each in
Bradenton, Sarasota and St. Augustine; Hillsborough holds one in Lakeland.
A "Home inspectors in Sarasota" page under Pinellas with one unclaimed name
is a page Google should never index and a homeowner should never land on.
Those inspectors keep their own pages; their city crumb goes to the county
page with the city filter set. `MIN_CITY_LISTINGS` in `lib/cities.ts`.

### "Based nearby, serves X"

A claimed inspector's `service_cities` (chosen on the dashboard) put them
on city pages other than their mailing city, in their own section below
the featured row. That is the free version of being on a city page — a
reason to claim and fill in the dashboard, and the natural upsell to a
featured card on the same page.

### What was refactored to get here

The featured card, the listing rows and the featured dialog were inline in
the county page; a second copy for city pages was the wrong answer. They
are `FeaturedCard`, `ListingRows` and `FeaturedDialog` components now, and
the county page is 290 lines rather than 680.

---

## 2026-09-12 — One page per inspector, with the URL built from the state record

**Built.** Every live listing has a page at
`/fl/<county>/<city>/<hi####-licensee-name>/`, claimed or not, and every
claimed one has a badge at `/badge/HI####.svg`.

### Why every listing, not just claimed ones

An inspector who has never heard of this site finds it by searching their
own name. The county page put them in a row 20,000px down a 316-row table;
a page with their name as the H1 is what ranks for that search, and an
unclaimed page's whole right-hand column is the ask to claim. For a
homeowner the unclaimed page is thin, and it says so — "hasn't claimed their
page yet" — and points at the claimed inspectors in the same city.

### Why the URL uses the licensee name, not the business name

The business name is the better keyword and it is what the H1 shows. It is
not in the URL because it changes: it is empty until a claim, edited on the
dashboard, and cleared on release. A URL that changed with it would turn
every link to the page into a dead one — including the badge on the
inspector's own website, which is the one link we most want to keep. The
licensee name comes from the DBPR extract and does not change. The license
number in front makes the segment unique and lets the page find its own
data. `lib/slug.ts` is the only place the rule lives; the build and the
dashboard's snippet both call it.

### The city segment is a promise about the next step

`/fl/pinellas/largo/` does not exist yet. The inspector URL carries the city
anyway, so that when city pages are built (the next step: four featured
spots per city, "featured where you work"), no inspector URL has to move.
Until then the breadcrumb's city link goes to the county page with the city
filter preset (`?city=Largo`), which is what a city page would show.

### The badge is the backlink

A claimed inspector gets a snippet that puts a "Verified on Verified Home
Inspector" image on their own site, linking to their page. Inspectors like
credentials on their sites; each one is a link from a relevant Florida
local-business site to a page here. That is how Avvo, Houzz and
Healthgrades built domain authority, and it costs nothing. Only claimed
listings get one — an unclaimed inspector has nobody to paste it.

### Not built

Per-city pages, and the wind-mitigation-authorization fact the mock showed.
The DBPR extract does not carry whether an inspector may sign form
OIR-B1-1802, so it would have to come from the inspector on claim, and a
self-reported credential needs a decision about how it is worded first.

---

## 2026-09-12 — Claims are self-serve, free, and show contact details

**Built.** Supersedes the 2026-09-11 entry below on both stages: the site
left beta and shows contact details in one step, three days in.

### What changed

- A claimed listing is **free, outright**. The "free until five counted
  requests, then $10/month" offer is retired. Nobody had claimed under it.
- A claimed listing **shows the inspector's phone number and website**, on the
  county page row and on a featured card. A tap on the number logs
  `click_phone`; the request button and `click_request` stay.
- Claiming is **self-serve**: `/claim/` emails a 6-digit code (the same
  flow as SuperReports and Sunstate Trades — a magic link opens in whatever
  browser the mail app picks, which on a phone is often the wrong one), the
  inspector enters their license number on `/dashboard/`, and
  `claim_listing()` attaches the row to their account and moves it to
  `claimed` at once. They edit business name, phone, website, services, years,
  cities served and an about paragraph there, through `update_my_listing()`.
  No UPDATE policy exists on `listings`; the functions are the only write path.
- `/for-inspectors/` states the offer and both prices on one page. The nav's
  "List your business" goes there.
- The featured product is unchanged: $50/month founding rate, county-level,
  `FEATURED_CAP` still 2. Asking for a spot from the dashboard posts the
  existing `featured-inquiry` form.

### Why the sequence collapsed

The 2026-09-11 entry was right that counting requests and showing a phone
number are incompatible, and right that the count only existed to prove value
to inspectors deciding whether to pay $10. Once the claim costs nothing there
is nothing to prove and nothing to bill, and the form-only contact path was
costing homeowners the thing they came for while proving value to nobody. The
ordering problem went away by removing the thing that needed ordering.

What is lost: an exact per-listing request count as a sales instrument. What
replaces it: `click_phone` plus `click_request`, in the same
`listing_request_counts` view, which an inspector can be shown but is not
billed against.

### Why a claim goes live at once

The DBPR extract carries a mailing address and nothing else — no email, no
phone — so there is no way to prove the person signing in as HI7816 is HI7816
without mailing them something. The options were instant-and-revocable,
pending-until-a-person-approves, and a postcard code. Pending means every
claim waits on one person, including the ones made at 9pm; a postcard means a
week and postage per claim.

Instant is safe enough because a false claim gains little: the licensee's name
and license number come from the state record and cannot be edited, so a
squatter is advertising their own phone number under someone else's name,
which that someone will notice. Every claim emails the inbox (the dashboard
posts the `claim-listing` Netlify form after `claim_listing` succeeds), one
account can hold one listing, and `set-tier.mjs HI#### unclaimed` revokes a
claim in one line. RMC, set up by hand before this existed, is refused by
`claim_listing` and is attached to an account with a one-off UPDATE.

### No cold sign-ups

An account exists to claim a listing and for nothing else. `/claim/` requires
a license number, checks it is an unclaimed listing before sending a link, and
sends it as user metadata on the sign-in request; a `before insert` trigger on
`auth.users` (`require_claimable_license`) refuses to create an account whose
metadata names no such listing. The page's check is for a readable message;
the trigger is the rule, and it holds against a direct call to the auth API
with the anon key. Sunstate Trades has the mess of accounts that belong to
nobody; this site does not get one. An existing account is not inserted, so
it is not checked: it signs in with any license and is judged at claim time.

### What is deliberately not built yet

- **Per-inspector pages and per-city pages.** The dashboard already collects
  `service_cities` and `about` for them. Until they exist, `about` is stored
  and not rendered anywhere.
- **Stripe for featured.** Still an email and a hand-run `set-tier.mjs`.
- **Rebuild on save.** The dashboard tells the inspector the county page
  updates "after the next rebuild". That rebuild has to be wired as a Supabase
  database webhook on `listings` UPDATE pointing at the Netlify build hook, in
  the Supabase dashboard; nothing in the repo triggers it. Until it is wired,
  a claim is invisible on the county page until someone deploys.
- **Column-level hiding of `claimed_by`.** The anon role can read the uuid on
  every row. It is an auth user id and resolves to nothing outside
  `auth.users`, and hiding it would mean the site's `select('*')` fails on
  column privileges. Left as is, knowingly.

### What would reverse this

A claim made in bad faith that the inbox notice and the real licensee did not
catch quickly. One of those and claims go to pending.

---

## 2026-09-11 — Leaving beta and showing contact details are one sequence

**Direction set. Not built. Triggers deliberately unset — see below.**

Two changes that look independent and are not. They have a forced order.

### Stage 1 — leave beta, stop offering five free leads

A claimed listing is currently free until we have passed it five
homeowner requests. That is a beta offer, not a permanent one: it insures
an inspector against "I will pay and get nothing" while there is no
evidence either way. Once there is evidence, it has done its job.

Leaving beta means no longer offering it to NEW claims. **Anyone already
inside it keeps it** — someone sitting at request 3 of 5 gets the
remaining 2. It costs almost nothing and it is the difference between
"the price changed" and "they moved the goalposts on me". It is also what
the claim panel already promises, that the first inspectors keep their
rate for as long as they stay.

### Stage 2 — show contact details, measure clicks

Show phone and website on listings so homeowners call directly, replace
the counted form submission with a tracked `click_phone`, and let churn
carry the rest: if the traffic is real the inspector keeps paying.

Counting exists to prove value, not for its own sake. Once volume makes
value self-evident, an exact count is a cost — a bottleneck between a
homeowner and the person they want to call, which costs real leads on a
phone where tapping to call is what people do.

`listing_events.event_type` already includes `click_phone`, so this is a
`tel:` link that logs before dialling, not a new system.

### Why the order is forced

Five-free-leads is denominated in **counted requests**. Showing contact
details **ends** counting — a tracked tap measures intent, not a
conversation. So stage 1 must complete before, or exactly when, stage 2
ships. Running stage 2 first means billing against a number we no longer
collect.

They are written here as one entry because splitting them is how that
gets missed.

### The triggers are not set, on purpose

An earlier draft of this used "10,000 visitors a month". That number was
illustrative and was never measured against anything — recorded here only
so nobody later mistakes it for a finding.

Two things to fix when setting them for real:

**Gate on leads delivered, not sitewide visitors.** The offer insures
against an inspector getting nothing. A visitor count does not retire
that fear: traffic spread across four counties and 1,300 listings can
still leave one inspector at zero. Charging them at the moment we
announce the site works is the exact failure to avoid. The
`listing_request_counts` view already counts requests per listing and
flags `free_period_used`, so the honest threshold is something like the
median claimed inspector receiving N requests a month.

**Gate per county, not sitewide.** Inspectors buy a county. Orlando can
be working while Pasco is dead, and a sitewide gate would start charging
Pasco inspectors on the back of Orlando's traffic. Counties leaving beta
at different times is more to explain and is the version that is true.

### What has to change in the copy, in the same step

The five-requests offer appears in four places: the homepage claim panel,
the county claim panel, terms, and the request dialog's own copy.

The exclusivity promise — "Every request goes to you and nobody else. We
never send one homeowner to several inspectors, and we never charge per
lead" — stops being the product rather than becoming untrue. It stays
accurate about form requests and says nothing about a published phone
number, so the pitch has to rest on placement and traffic instead. Same
for the privacy page's version.

### Churn is honest but slow

"They keep paying or they do not" genuinely answers *does the site work*.
It cannot notice one inspector whose leads dried up two months ago — that
surfaces at cancellation, too late to fix. That is the argument for
keeping a click metric that nothing is billed against: not for billing,
for noticing.

### What would pull this forward

One inspector saying the form cost them a job — a homeowner who wanted to
call and filled nothing in. That is the failure the form has always
risked, and a single report of it outweighs any volume number.

## 2026-09-11 — When both featured spots fill, show a waitlist, not an empty slot

**Decided. Not built.** Build it when a second county sells its first
featured spot, or when either county fills both — whichever comes first.

*Update 2026-09-12, after city pages and Stripe:* the unit is now a city
page with four spots, and the entry below still holds with "city" for
"county". How it will work when built:

- **City page, all four taken:** the ad-slot card does not vanish (today
  it does — `openSpots` is zero and nothing renders). It becomes "All four
  featured spots in St. Petersburg are taken. Join the waitlist," same
  button, same dialog, `plan` = `Waitlist - St. Petersburg`. Lands in the
  inbox like every other form.
- **Dashboard, a full city:** the checkbox shows "(full — join waitlist)"
  and is still clickable; checking it posts the same form with the
  inspector's details and buys nothing. They can still check out for the
  cities that are open.
- **A spot frees** (the webhook's `reconcile` moves someone to claimed):
  the inbox has the list; the first on it gets an email and buys from
  the dashboard like anyone else. Automating that email is a later step
  — the list needs a table before it needs a robot.
- **The number is the pricing instrument.** Four waiting on Miami at $50
  is the evidence that Miami's next price for new buyers is not $50.
  Founding-rate holders keep theirs.

### The question

The featured row holds two spots (`FEATURED_CAP`). While one is empty it
renders a "This spot could be yours" card with a **Get featured** button,
which is the only prominent place the featured product is sold. The
thought was to leave the second spot deliberately empty so inspectors
keep seeing that advertisement.

### The decision

**Do not hold a spot empty. Fill both, and replace the empty-slot card
with a taken state that still asks.**

> **Both featured spots in Pinellas are taken.**
> 316 licensed inspectors are listed here. Only 2 sit above all of them.
> **Join the waitlist**

Same position, same button, same `featured_inquiry` event.

### Why

**Holding a spot empty costs $50/month to run an advertisement.** That is
paying for marketing with inventory.

**An empty slot is the weaker advertisement.** "This could be yours" beside
one taken spot reads as availability — come back later. Two taken spots
above all 316 listings read as necessity. Scarcity persuades once it is
demonstrated, not while it is merely claimed. It also contradicts the
claim panel's own line, that the first inspectors to take a spot keep
that rate for as long as they stay, which is urgency built on the spots
running out.

**The real loss when the row fills is capture, not advertising.**
`openFeaturedSlots` goes to zero, so no ad-slot card renders at all: the
Get featured button and its `featured_inquiry` event disappear from the
top of the page, and the only surviving pitch is one sentence in the
claim panel below 316 listings. An inspector who has finally decided has
no prominent way to say so.

Do not cite the `featured_inquiry` count as evidence that button works.
It fires when the dialog OPENS, not when anything is sent, so it counts
curiosity rather than intent. As of 2026-09-11 the site has three form
submissions in total and all three are founder tests ("karen test", "rmc
test"). Nobody outside has submitted anything through any form, and no
featured inquiry has ever been submitted at all.

**A waitlist is also the pricing instrument we do not have.** Four
inspectors waiting at $50/mo means the price is too low or the cap of 2
is too tight. The DB allows six positions (`featured_position` checks
1–6), so raising the cap is a one-line change — but today, when the row
fills, we learn nothing at all.

### Shape when built

A third state on the ad-slot card, reusing `#featuredDialog`, which
already exists and already logs `featured_inquiry`. The waitlist needs
somewhere to land — most cheaply the same Netlify form path the claim and
request forms use, rather than a new table.

### What would reverse this

An inspector saying the full row put them off asking. Nobody has said
that; nobody has been shown a full row yet.
