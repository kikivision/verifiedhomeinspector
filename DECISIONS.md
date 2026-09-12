# Decisions

Things decided but not built, and things built in a way that looks wrong
until you know why. Newest first.

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
