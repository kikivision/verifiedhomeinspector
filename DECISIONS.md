# Decisions

Things decided but not built, and things built in a way that looks wrong
until you know why. Newest first.

---

## 2026-09-22 — A Featured spot is not charged for 90 days

**Built.** `TRIAL_DAYS` is 90, not 7. The card is still collected at
checkout; the first charge is 90 days later.

### Why not a lower price

The question that started this was whether $50 is defensible when a
Featured spot has no homeowner traffic to show for itself yet — and the
first answer reached for was a $25 founding rate. It is the wrong
instrument. The site has run one price experiment already: the "free until
five counted requests, then $10/month" claim offer, retired 2026-09-12
because nobody claimed under it. Price was never the obstacle. A $25 rate
would have spent the founding rate, left the same inspector with the same
nothing to show, and made the guilt arrive at month three instead of month
one. The founding $50 is untouched.

What was actually wrong was selling a thing before it works. So it is not
sold yet — it is given 90 days first.

### Why 90 and not 180

180 is the honest match for how long this site plausibly needs before a
Featured spot is worth $50, and 90 was chosen anyway, knowingly. The
December conversion may well land before the numbers justify it. That is
accepted on the grounds that a decision made in December with three months
of real click data beats one made today on a guess, and that pulling a date
in is a pleasant email while pushing it out is an apology.

If December comes and the traffic is not there, the fix is per-subscription
(below) and it is manual. That is the price of 90 over 180 and it was known
when it was chosen.

### Why a card is still collected

Because this converts by itself. A free-with-no-card period needs a second
sale at the end of it, to an inspector who has spent 90 days paying
nothing; a card on file needs only a decision not to intervene. It also
keeps the offer honest about what it is, which is why no page calls it
free: a card is required, it is not charged for 90 days, and the
confirmation email names the date the first payment lands.

### `trial_period_days` is fixed when the subscription is created

**Changing `TRIAL_DAYS` reaches new checkouts only.** Stripe writes the
trial onto each subscription at creation, so an inspector who signed up
under one number keeps it. Extending an existing subscriber is a Stripe
dashboard edit on that subscription ("Add trial days"), never an edit here,
and it is one subscription at a time.

That is how Inspected PLLC was moved. Bought 2026-09-14 under the 7-day
trial, which ended 09-21; collection was paused by hand that day rather
than let the first charge go through on a site with nothing to show. Adding
trial days put the subscription back into `trialing` to **2026-12-13** — 90
days from his own signup — and the pause was then removed, because a trial
does the same job better: **no invoices generate during a trial**, so
nothing accrues behind it the way a `keep_as_draft` pause would have. He
has never been charged. No Featured revenue has ever been collected, from
him or anyone.

### `trial_settings` pauses rather than invoices

`missing_payment_method` is `'pause'`. Stripe's default is
`create_invoice`, which over a 7-day trial is unreachable and over a 90-day
one is ordinary: cards expire inside a quarter. The default would bill a
card that is gone, produce an unpayable invoice and a dunning sequence, and
need a person. `'pause'` stops collection and leaves the spot up, and
`license-grace` reads a pause it did not set as `'theirs'` and keeps its
hands off it.

Stripe's "send a reminder 7 days before a trial ends" is on, which is what
makes charging on day 91 fair rather than sprung. At 7 days nobody would
have noticed it being off.

### What the copy had to stop saying

Three words were ours and not the reader's, and all three were fixed the
same day:

- **"card"** meant the rendered placement to us and a credit card to
  everyone else, so "nothing is charged until your card is live and you
  have seen it" parsed as waiting to see one's own credit card. The
  placement is now described by what it is — "your logo at the top of the
  county page" — and `card` is left to mean the only thing a reader was
  ever going to assume.
- **"the 90-day trial"** referred back to something never introduced. Both
  the dialog and the dashboard now open it: "We're running a 90-day trial,
  so your card isn't charged until that period is complete."
- **"featured"** lowercase read as an adjective. It is the name of the
  thing being sold, so it is capitalized wherever a reader sees it.

---

## 2026-09-21 — "Based nearby" is rows below the city's own, not cards above them

**Built.** On a city page the claimed inspectors based elsewhere in the
county who chose this city render through `ListingRows` like every other
result, in a labelled section **below** the city's own table. They were a
grid of `.card.neighbor` cards above it. Four things moved with them:

- The search box filters both groups. It filtered only the table, so
  searching a nearby inspector's own licence answered "No inspectors match
  that search" while their card sat on screen above the box — and the
  message went on to suggest trying a licence number, which is what had
  just been typed. Found by Karen searching HI15206 on the Tampa page.
- A listing's status left the Contact cell for the last column, which is
  headed **Listing** and was headed "Hire". Green `CLAIMED` with "Owner
  managed" under it; an unclaimed row still offers the claim in the same
  cell. The badge beside the phone number competed with the one thing a
  homeowner scans a row for, and "Hire" never labelled anything to do with
  hiring — the column holds a listing's standing or the claim that changes
  it.
- Row specialties cap at three plus a "+X more" link to the profile. Not
  the featured card's six: that column is 150px and service names run
  105–140px, so tags never share a line and each costs a line of height.
  Uncapped, Inspected PLLC's eleven services made a 267px row against a
  95px claimed one; three is 164px. It never showed while claimed rows had
  no services on file.
- The component's one HTML comment is an Astro comment now. A city page
  renders `ListingRows` twice, so even a comment kept outside the loop came
  out twice and tripped the smoke test's repeated-comment check. The smoke
  test caught it; it emits nothing at all now, so every city page is
  slightly lighter.

### Why

Fixing the search exposed the placement. The cards put a **free** listing
in something close to a featured card's footprint, directly under the
"this spot could be yours" pitch, and above the claimed inspectors
actually based in the city. On Largo that was Inspected PLLC, based in St.
Petersburg, over ThoroSpect and Suncoast — both claimed, both in Largo.
Karen: "that's almost like a featured listing, but it's free," then "so
someone in a 'nearby' location gets better placement than a claimed
inspector within that city??" Rows below the table put the order of the
page in the order things are bought: featured cards, then this city, then
nearby.

Inspected PLLC keeps its Featured mark, through a new opt-in `featuredMark`
prop on `ListingRows`. It holds paid county position 1 and Largo is in
Pinellas, so the mark is true on a page its purchase covers. The prop is
off in the main table, where a featured row is the anomaly the county smoke
check warns about and relabelling it would dress up the very thing that
check exists to find.

### What was rejected

**One merged list**, headed "N inspectors serving <city>", sorted claimed
first with the City column carrying each row's real base city. It is the
only arrangement that gets a claimed nearby inspector above the unclaimed
in-city rows, and Karen made the argument for it herself — a homeowner
"shouldn't care where the inspector is driving from or where he parks his
car when he gets to work." Built as a prototype and rejected on sight: "I
don't like it. dont like st. pete mixed in with largo."

**Splitting the in-city table** to wedge the nearby block between its
claimed and unclaimed rows. Offered as the one shape that is neither mixed
nor buried; declined. One heading over two chunks of the same city with
another section in between, and a search box above all three.

So a nearby inspector sits below the unclaimed in-city rows, knowingly.
The route out of that is buying the city, which the open-slot card now
asks for honestly.

---

## 2026-09-21 — The open-slot card on a city page stops counting spots

**Built.** The card reads "Featured listing — this spot could be yours",
which is what the county page's card has always said. It read "1 featured
spot open in <city>".

### Why

The number was false. `openSpots` is how many dashed boxes to **draw** —
`cityFeaturedTarget`, two or four — not how many are for sale, which is
`CITY_FEATURED_CAP` (6) minus sold. Largo had one sold and advertised "1
featured spot open" with five available. The same total also printed inside
every box, so two open boxes would each have claimed "2 featured spots
open". The county card carries no count for exactly this reason, and the
cap lives in the unconditional note beside the heading, where the
2026-09-16 entry put it so the promise does not vanish as the row fills.

### What it is not

Not a change to the cap, the target, or how many boxes draw. Only the
heading inside the box.

---

## 2026-09-21 — A logo is for any claimed page, and its plate is a square

**Built.** The dashboard checklist line reads "Logo — email us the file and
we add it to your page", not "to your card". The profile plate is a 160px
square rather than a full-width band capped at 80px tall.

### Why

Anton Labuschagne (HI15206, Riverview) claimed on 2026-09-21 and emailed
his logo the same afternoon, which is exactly what his dashboard told him
to do — the checklist offers the logo to every claimed listing with no tier
check, and the profile plate is gated on `claimed`, not on tier. Only the
logo **tile** on a featured card is Featured-only, and that is because only
featured listings get a card at all. "To your card" read as a Featured perk
to a claimed inspector who has no card.

The band was sized for a horizontal wordmark. A 4:3 mark in it could only
ever reach 80px of roughly 296px of width — his filled 36% and read as
small. A square lets a mark of any proportion use the full height and
nearly all the width, which is the reasoning the featured card's fixed tile
already follows.

### What it is not

Not a change to how a logo arrives: still emailed in and applied by hand
with `set-tier.mjs --logo`, still committed to `public/logos/` and served
from our own domain. Note that writing `logo_path` fires
`rebuild_site_on_listing_change`, and that rebuild reads GitHub `main` — so
the file has to be on `main` or the page publishes a broken image. His was
404 for about a minute.

---

## 2026-09-21 — Netlify's plain-text claim-listing notification turned off

**Built.** The Netlify form notification for `claim-listing` is removed
from the Netlify UI. A claim reaching Karen now arrives only as the
branded "New claim" email from `claim-welcome.mts` (2026-09-16 below).

### Why

A real sign-up on 2026-09-20 landed both notices — the branded one and
Netlify's generic plain-text one — confirming the branded email was
working and arriving reliably. That was the condition the 2026-09-16
entry set for switching the old one off ("once the branded one is seen
arriving, not before").

### What it is not

Not a change to `featured-inquiry`, which still has no branded
counterpart and fires only Netlify's plain-text notification — that form
is an inspector asking about a paid spot, not a claim or a Featured sale.
A completed Featured sale already has its own branded email from
`stripe-webhook.mts`.

---

## 2026-09-16 — City pages draw two open featured boxes, not four

**Built.** `CITY_FEATURED_TARGET` in `src/lib/cities.ts` is two for every
city page. The cap stays six and every page that sells a spot still says
"6 spots per city, never more". Sold cards always show; open boxes fill up
to two, so a city with one sale shows one open box and a city with two or
more shows none. The county page still draws four.

### Why

The pages are being handed to homeowners directly (Nextdoor, first in
Palmetto), and four dashed boxes over a list where nobody has claimed yet
read as advertising before directory. Karen: "4 is a lot to scroll
through." The 2026-09-12 note in the file that called two "a misreading of
the cap/target split" was about the cap; the target was always free to be
smaller. A Palmetto-only override built earlier the same day was replaced
by this rule before anyone saw it.

### What it is not

Not a change to what is for sale, or to the promise. Six is still six.

---

## 2026-09-16 — Claims and Featured sales reach Karen as branded notices

**Built.** `netlify/lib/email.mts` is the email chrome for mail whose only
reader is us: mustard rule, live-text wordmark, a status pill, a key/value
table, one button. `claim-welcome.mts` sends "New claim" to
`OWNER_ALERT_TO` (default kikidailey@gmail.com) right after the welcome,
with the claimant's contact details, what they left empty, and a button to
their page; reply-to is the claimant. `stripe-webhook.mts` sends "New
Featured customer" after the fulfillment write and rebuild, with city
pages, county position, first-charge date and a link to the subscription
in Stripe. Neither can throw or hang: a lost notice must not become a
lost welcome, a 500, or a Stripe redelivery that bills twice.

### Why

Until now a claim reached Karen as Netlify's generic form notification and
a Featured sale reached her only through Stripe's own receipts, if at
all; neither said who, where, or what was still empty, and neither looked
like it came from this product. SuperReports already had the shape
(`supabase/functions/_shared/email.ts`), and the two products' notices
land in the same inbox, so this copies it with the site's palette rather
than inventing a second one.

### What it is not

Not a change to any inspector-facing email. The outreach sequence and the
claim welcome stay plain text from a person, on purpose: polish reads as a
campaign to the person receiving it. The Netlify form notification for
`claim-listing` still fires; switch it off in the Netlify UI once the
branded one is seen arriving, not before.

---

## 2026-09-16 — A claimed license can sign in again

**Built.** `/claim/` no longer refuses a license that is already claimed
before sending the code. The pre-check still catches an unknown or
delisted license with a readable message; a claimed one gets the code,
and the `require_claimable_license` trigger decides: the account the
license was claimed with signs in, any other email is refused and told
"already claimed, and not with this email." The footer of every page now
carries "Inspector sign in" pointing at `/claim/`.

### Why

The claim page was the only sign-in, and it treated "already claimed" as
a reason not to send a code. That was right for a stranger and wrong for
the owner: every claimed inspector was locked out of every browser but
the one they claimed on, with a message telling them to email us. The
Supabase session on the original browser hid it — Jason and Damir have
not hit it yet, because neither has tried from a second device.

The trigger was always the real gate. It runs only when an account is
being created, so sending the code for a claimed license admits nobody
new; it just stops refusing the person who is already in.

### What it is not

Not a separate sign-in page. One form, one flow, one place to link to.
The pending-license key in localStorage is not set for a claimed license,
so the dashboard does not offer a claim to someone who already has one.

---

## 2026-09-14 — The duplicate-subscription branch decides from Stripe, not from ids

**Built.** A third review found the fix for the double-subscription case
had two failure modes of its own, both from comparing ids and acting
without looking at what Stripe actually held.

- **The remedy made the alert lie.** A failed cancel mailed "TWO live
  subscriptions" and threw so Stripe would retry. Stripe retries for
  three days. The moment Karen did what the email said and canceled the
  duplicate by hand, every remaining retry failed the cancel again —
  Stripe refuses to cancel an already-canceled subscription — and mailed
  the same now-false warning, roughly ten times, each also 500-ing the
  endpoint.
- **It could cancel the subscription she kept.** If she resolved a double
  sale by keeping the *newer* subscription and canceling the original, a
  redelivery arriving before `customer.subscription.deleted` was
  processed still saw `tier='featured'` with a different id, and
  canceled the one she kept. The customer would be left with no card and
  nothing billing.

Both came from the same root: the branch compared ids and never asked
Stripe for either subscription's status. It now retrieves both first —
and only a genuine `resource_missing` counts as gone. A fourth review
caught that the first version swallowed *every* Stripe error into
"missing", so a transient outage reading the incoming subscription
returned 200 and left the customer billed twice with no retry, and a
transient outage reading the recorded one adopted over a live
subscription that would then bill forever with nothing pointing at it.
Anything that is not `resource_missing` rethrows now, so Stripe retries.

| state | action |
|---|---|
| the incoming one is canceled, or genuinely gone (`resource_missing`) | 200, nothing to do — this is what stops the retry storm |
| the recorded one is dead, incoming is live | adopt the live one onto the listing, keep position and cities, mail |
| both live | cancel the incoming duplicate, keep the running one, mail |
| both live and the cancel fails | mail the truth and throw, so the retry tries again and goes quiet once it works |

### Also from that review

A `checkout.session.completed` that never fulfills now mails hello@ from
the handler's outer catch. That is a customer who has paid and received
nothing, and until now the only trace was a `console.error` in logs that
expire in seven days. It covers the 23505 case and any alert dropped by a
failed write.

The build hook had no timeout, so the last step of a purchase could hang
the invocation; it is bounded at 5 seconds like the other calls. The
coming_soon skip in the smoke test matched a bare substring that is also
a CSS selector, which would have silently skipped the cap check on every
county page if the stylesheet were ever inlined; it matches the full
class attribute now. A dead type assertion in the dashboard is gone.

And the state is 314 city pages, not 315: two city spellings slugify to
one page, so counting distinct names in the database overcounts by one.

---

## 2026-09-14 — Where license-grace actually stands, and what is left

**Read this before touching `netlify/functions/license-grace.mts`.**

### State

Deployed, **disabled**, and it takes two deliberate acts to enable:

1. Set `LICENSE_GRACE_ENABLED=true` in Netlify (it is not set).
2. Restore the commented `schedule` line at the foot of the file.

Verified live: the URL returns 403 and the environment variable is absent.

### Why the guard exists, which is the lesson worth keeping

The first attempt at disabling it removed the `schedule` and asserted, in a
commit message and in this file, that the function therefore could not run.
That is backwards. A **scheduled** function has no public URL; a function
**without** a schedule is an ordinary HTTP endpoint. Unscheduling it
published `/.netlify/functions/license-grace` to the internet, where anyone
could invoke a job that pauses billing, cancels subscriptions and emails
customers. A `curl` returned 200 and it ran against production.

The guard stays after the schedule is restored. "Nothing can call it" was
the assumption that was wrong, and it should not be load-bearing again.

### Outstanding defects, from the seventh review round

None can fire while the function is disabled. All four are in the lapse
letters and the unpaid path:

1. **The release letter always claims 35 days.** It is sent whenever a
   lapsed row's subscription is found dead, so an inspector paused on day 3
   who then cancels through the portal is told his license "has not appeared
   for 35 days". It can also send twice — once from the cancel action, once
   from the dead-subscription branch the next day if the webhook is missed.
   Suggested: stamp `license_grace_canceled_at` before canceling, and send
   nothing when `cancellation_details.reason === 'cancellation_requested'`.
2. **`reconcile` does not void the open invoice.** The commit message and an
   entry above claim a canceled unpaid subscription has its invoice voided.
   Only the fallback in license-grace does. Stripe's cancel stops automatic
   collection but leaves the hosted invoice payable, so an inspector can pay
   $50 for a spot that is already released. Extract cancel-and-void into
   `featured.mts` and call it from both places.
3. **The three-run walk sends false letters.** For a row first seen already
   past 35 days the sequence is pause, warn, cancel on consecutive days, and
   the letters say "held for 35 days", then "you have not been charged", then
   released — none of which is true on that walk. Fix by measuring grace from
   `max(delisted_at, paused_at)` rather than from the lapse.
4. **It voids the wrong invoice.** `latest_invoice` on an unpaid subscription
   more than a cycle old is a *draft*; voiding throws, ops is told an invoice
   is "still payable" when it is a draft, and the genuinely open one is never
   touched. List `status: 'open'` invoices for the subscription instead.

Smaller: `maxNetworkRetries: 1` retries `subscriptions.cancel`, which is a
DELETE and so unkeyed, and a retried-after-success cancel reports a false
"cancel failed" to ops. `wasPaused` is wrong when a person deliberately
resumed billing, offering a refund for billing they chose to keep running.

### The recommendation

Do not fix these four on the current design. Six review rounds found real
defects here and the last three found them in the *fixes*; the function has
six decision outcomes and four pause states, and governs one subscription.
Cut it back to **pause and email only**, with spots released by hand from
`set-tier.mjs`. That deletes the cancel path, where nearly every finding has
been, along with the warn markers and most of the state. The pure decision
would fit in about fifteen lines and `scripts/license-grace.test.mjs` would
shrink with it.

---

## 2026-09-14 — license-grace is deployed and deliberately not scheduled

**Built, held.** `netlify/functions/license-grace.mts` exports
`config: Config = {}` instead of a `schedule`. Netlify never invokes a
scheduled function without one, and a scheduled function has no public URL,
so nothing can invoke it either. The code below it is complete, typed,
tested and on production; it simply cannot run.

### Why

Six review rounds went over this evening's work. Every round found a real
defect. The county gate stabilised after round three — the last three
rounds found nothing in it — and everything since has been in this
function, increasingly in the *fixes* rather than in the original:

- Round four: a 30-day threshold canceled inspectors hours before the
  monthly import that would have rescued them, seven months a year.
- Round five: `unpaid` released a spot while leaving a live subscription on
  a claimed row; a failed Stripe read was skipped in silence forever.
- Round six: the fix for the hand-pause case was unreachable dead code, and
  the release letter went to anybody whose subscription ended, telling a
  paying customer on a current license that it had lapsed 35 days ago.

Three rounds of that pattern is the signal, not the bugs themselves: six
decision outcomes and four pause states, stopping and restarting billing
and canceling subscriptions unattended, for a feature governing exactly one
subscription today. The gate, the webhook fixes and the page work do not
deserve to wait behind it, and it does not deserve to run on trust.

### To turn it on

Restore the one commented line at the foot of the file and nothing else.
Before doing that, the honest options are: let one review round come back
clean, or cut the function back to pause-and-email with spots released by
hand — which removes the cancel path, where nearly every finding has been.

### What is live without it

Everything else in the same eight commits: `assertCountyHasRoom` refusing a
full county before Stripe, the county page slicing at the cap, `notifyOps`
mailing hello@ when a paid card cannot be delivered, the duplicate-
subscription guard, the dead-subscription guard on redelivered checkouts,
`releaseFeaturedSpot` clearing `stripe_subscription_id`, the 10-second
Stripe timeout, and the six-spot caps with the card layout.

A lapsed featured license therefore still does what it did this morning:
nothing. The inspector keeps paying for a card that renders nowhere and
holds a county position. That is the gap this function closes, and it is
worth closing soon.

---

## 2026-09-14 — A lapsed license pauses the billing, holds the spot 35 days, then releases it

**Built.** `netlify/functions/license-grace.mts`, a Netlify scheduled
function running daily. Closes the gap the county-gate review left open.

### The problem

A delisted row renders on no page — that is the site's one promise kept
honestly. But `import-dbpr.mjs` sets `delisted_at` and touches nothing
else, so a *featured* inspector whose license stopped appearing in the
DBPR extract was invisible, still billed $50 a month, and still holding a
county position nobody could buy. Every part of that is wrong in a
different direction.

### What happens now

| state | action |
|---|---|
| lapsed, billing running | pause Stripe collection, mail the inspector and hello@ |
| back in the extract, paused by us | resume collection; the position never moved |
| back in the extract, our marker but no pause | clear the stale marker, tell nobody |
| lapsed `GRACE_WARN_DAYS` (30) | warn the inspector and hello@, once, marker-tracked |
| lapsed `GRACE_DAYS` (35) or more | cancel the subscription |
| paused or un-paused by hand | nothing, in either direction, ever |
| Stripe says canceled, unpaid or expired | release the spot; an unpaid one is canceled first |

The cancel does nothing else on purpose: the existing
`customer.subscription.deleted` webhook drops the row to claimed, frees
the position, clears the cities and rebuilds. That path already existed
and was already the one tested, so releasing a spot after grace and
releasing one after a voluntary cancellation are the same code.

### Why pause rather than keep billing

Their card is hidden the moment they are delisted. Charging $50 a month
for a card nobody can see is the opposite of what the name on the site
claims, and the amount of money involved is one month from one inspector.
Decided by Karen, 2026-09-14.

### Why 35 days, and a warning at 30

Not 30, and the reason is arithmetic rather than generosity. `delisted_at`
is only ever set and only ever cleared by the monthly import, and
consecutive imports are up to 31 days apart. A 30-day threshold cancels
the inspector BEFORE the import that could rescue them, in every 31-day
month: delisted 1 Aug 13:05, the job on 1 Sep sees 30.4 days and cancels,
and the import that would have restored them runs that afternoon. Seven
months of the year it released a customer who had already renewed. A
fourth review caught this before it shipped. The threshold has to clear
the longest possible gap between imports, so 31 plus margin, and the job
runs at 15:00 UTC — after the 13:00 import, not twelve hours ahead of it.

The warning at 30 days exists because arithmetic is not the only way this
goes wrong: the import stops the whole run if any county trips its shrink
guard, so a month can pass with no re-check at all. The warning mails the
inspector and Karen while there are still five days to intervene. It is
tracked by a marker on the Stripe subscription, so a skipped run cannot
lose it and it still sends only once.

The real window from the inspector's side is longer than 35 days either
way, because the lapse can already be a month old when the import first
sees it.

### Shape

`graceAction` in `netlify/lib/featured.mts` is pure and decides all six
outcomes; the function does the Stripe and email work around it. It
decides about somebody's money, so it is tested case by case in
`scripts/license-grace.test.mjs`, including the boundary day, a corrupt
timestamp, a future timestamp, and a listing with no subscription. Three
of those cases were verified by breaking the code and watching them fail.

Idempotent by reading the live `pause_collection` from Stripe rather than
storing a flag: a second run the same day sees the state it just set and
does nothing. That also means no migration.

It only ever lifts **its own** pause. The pause is stamped
`metadata.paused_by = 'license-grace'`, and a pause set by hand in the
Stripe dashboard — a comped month, a dispute — is left alone, and does not
count down to a cancellation either. Without that, the job would have
un-paused Karen's own decisions overnight and mailed the inspector that
billing had restarted.

A subscription Stripe reports as already canceled on a row still marked
featured is released rather than skipped. That is the state a missed
`customer.subscription.deleted` leaves behind: a county position held by
nobody, which nothing else would ever have noticed. The write is
`releaseFeaturedSpot`, now shared with `reconcile`, so "one path" is true
of the code and not just of the intention.


### The order of the checks is the whole thing

A fifth review found the hands-off check sitting *below* the cancel, so a
subscription Karen had paused by hand was still canceled on day 35 — with
no pause email and no warning first, because both of those are gated on
the pause being ours. The commit message and this entry both claimed
otherwise. The check moved above the cancel and four test cases now pin
it at the boundary and long after.

Two more from that review. The warning was a one-day window, so a single
skipped run lost it silently and canceled on day 35 having told nobody;
it is a marker on the subscription now. And a pause *removed* by hand
while the license was still lapsed read as "not paused", so the job
re-paused them and re-sent the pause email every morning; `'lifted'` is
the fourth pause state, left alone, and tidied once they are current
again so a later lapse still pauses.

### The budget: ordered rows and a wall clock

Rows come back from PostgREST in heap order with no ORDER BY, and the
first version counted every row read against a six-row budget. With a
seventh subscriber anywhere in Florida the same six would have been
examined every day and the seventh never looked at — the exact defect
this function exists to prevent, back silently. The query orders by
`delisted_at` so lapsed rows come first.

The count itself is gone. A long tail of no-op rows could still run past
Netlify's 30 seconds and kill the run mid-loop, after the Stripe writes
had landed and before anything was reported, so it is a 20-second wall
clock that reports what it did not reach. And `stripe()` now sets a
10-second timeout: stripe-node defaults to 80, which outlives the
function ceiling on its own and made any budget advisory.

### Round five: two majors, and a rule about who gets canceled

A row whose Stripe `retrieve` failed was skipped with a `console.error` and
nothing else — no ops mail, no counter, not even a line in the summary. A
county position held by something nobody could see, every day, silently.
Failures are their own bucket now, under a NEEDS A PERSON heading.

`unpaid` was treated as "gone". It is not: Stripe keeps an unpaid
subscription alive and generating invoices, so releasing the spot without
canceling left a *claimed* row whose owner could still pay the open invoice
and reasonably believe they were featured — while the daily job, which reads
`tier='featured'`, never looked at them again, and `create-checkout` would
have sold them a second subscription because the listing was no longer
featured. An unpaid subscription is canceled before the spot is released, in
both `reconcile` and the daily job, and `releaseFeaturedSpot` now clears
`stripe_subscription_id` so no claimed row points at a live one.

**Nobody is canceled who was never warned.** The cancel is gated on the
warning marker, so the order is pause, then warn, then cancel — three runs
minimum — whatever the calendar says. The first version of this rule only
guarded the unpaused case, so a subscriber first seen already 40 days
lapsed was paused one morning and released the next, having been promised
in the pause email that the spot was held for 35 days. A pause write that
keeps failing holds the spot indefinitely with a daily ops mail, which is
the right way round: a broken automation should not release a customer.

Two smaller ones. The budget was a row count, and a long tail of no-op rows
could still run past Netlify's 30 seconds and kill the run mid-loop after
the Stripe writes had landed; it is a 20-second wall clock now. And a pause
this job saw lifted by hand kept our marker, so a *second* hand action —
pausing it again from the dashboard — read as ours and would have been
canceled at day 35. A lifted pause is stamped with its own marker the
moment it is first seen, which matters: the first attempt at this wrote the
marker after the action block, and `graceAction` returns `'none'` for a
lifted pause, so the loop short-circuited before it and the write was
unreachable. Nothing in production ever carried the marker and the bug was
still live.

### Round six: a false letter to the one paying customer

The dead-subscription branch — the one that catches a row still marked
featured whose subscription Stripe says is over — was given an inspector
email in round five. It never reads `delisted_at`, so it sent the release
letter, *"your license has not appeared in the DBPR list for 35 days"*, to
anybody whose subscription ended for any reason. The likeliest trigger is
the most ordinary one: a customer cancels through the billing portal, the
webhook is late by more than the gap to 15:00 UTC, and the daily job mails
the one live paying subscriber to say his license lapsed. It also hard-coded
"billing should have been paused and was not", claiming a refund was owed.
It now mails only when the license actually lapsed, and reads the pause
state from the subscription in front of it.

A redelivered `checkout.session.completed` could also re-feature a listing
whose spot had since been released, on a subscription that was by then dead
— Stripe retries for three days and the dashboard can resend by hand. The
duplicate branch already checked the subscription was live; the plain path
did not, and now does.

### What it will do today

Nothing. Of the two featured listings, RMC has no Stripe subscription so
it is filtered out of the query entirely, and Inspected PLLC is current
and unpaused, which is `'none'`. The first time this function acts on
anything, it will email.

A scheduled function gets 30 seconds and each row can cost two Stripe
calls, a user lookup and a mail, so it works to a 20-second wall clock and
reports anything it did not reach, which is first in line the next day.

---

## 2026-09-14 — What a review of the county gate found, and what changed

**Built.** A second model reviewed the gate after it shipped and found
five real defects. All are fixed. Recorded because two of them are the
kind that look correct in the diff and are wrong in production, which is
what this file and the smoke test are both for.

### The promise lived inside the advertisement

The county page stated "never more than six" only inside the "This spot
could be yours" card, and that card stops rendering once
`COUNTY_FEATURED_TARGET` cards are sold. So the page dropped its own
promise exactly when the row filled, and the smoke test check added
hours earlier would have gone red on the fourth Pinellas sale — CI
failing precisely because the business was working. The promise is now an
unconditional `.note` beside the heading, the way the city page has always
had it, and the check reads that. (The Netlify build command is `npm run
build`, not `npm run verify`, so the post-purchase rebuild would have
survived. That was luck, not design.)

### A card that could not be delivered only wrote to a log

Both fulfillment failure branches — every city refused, and no county
position free — wrote `console.error` and nothing else. Netlify function
logs expire in 7 days and nobody watches them; the free trial is 7 days.
The first charge would have landed before anyone could have looked. Both
now call `notifyOps`, which mails hello@ through Resend with the license,
county, subscription id and what to do, and is best-effort so a failed
send can never 500 the webhook into a Stripe retry and a double charge.

### One listing could pay two subscriptions

`create-checkout` refuses an already-featured listing when the session is
created, and a Stripe session lives 24 hours. Open checkout, press back,
open it again, complete both: the first fulfillment features the listing,
the second sees a different subscription id, proceeds, and overwrites
`stripe_subscription_id`. The first subscription is orphaned and keeps
billing, and its eventual `deleted` event matches no row. `fulfill` now
cancels the duplicate, keeps the running subscription, and mails -- with
the mail composed **after** the attempt, saying which actually happened.
The first version built the "canceled it" text before calling Stripe and
sent it either way, so a Stripe outage would have produced an email
saying it was handled while the customer paid twice. A failed cancel now
mails the truth and throws, because a 500 makes Stripe redeliver and
redelivery retries the cancel; a 200 would end the only chance of it
succeeding on its own.

### A lapsed license holds a county position, and must keep holding it

`nextPosition` did not filter `delisted_at`, though `cityAvailability`
does and the dashboard's mirror did. The first fix added the filter to
`nextPosition`. That was the wrong direction, and a second review caught
it before it shipped: `uniq_featured_slot_per_county` constrains
`(county, featured_position)` for every `tier='featured'` row with a
position, delisted or not, and `import-dbpr.mjs` sets `delisted_at`
without touching tier or position. Skipping those rows hands out a
position the index already holds -- the gate passes, the card is taken,
the UPDATE in `fulfill` fails 23505, and Stripe retries that same failure
for three days while the 7-day trial runs out. A safe 409 became a charge
for nothing.

So the position stays counted, and the **dashboard** was changed to agree
with the server rather than the other way round: it reads positions
without the delisted filter and cities with it, which is the line
`nextPosition` and `cityAvailability` already drew.
`county-gate.test.mjs` pins the absence of that filter, with the reason,
so it does not get "fixed" again.

**Not built, and a real gap:** a featured inspector whose license lapses
keeps paying for a card that renders on no page, and holds a spot nobody
can buy. Canceling the subscription, a grace period, or simply mailing
Karen are all product decisions. `import-dbpr.mjs` is where it would go,
at the point it sets `delisted_at` on a `tier='featured'` row.

### The test was pretending to test the query

`county-gate.test.mjs` stubbed a chain that recorded nothing, so deleting
`.eq('tier','featured')` or the delisted filter from the real query left
every case green, and nothing checked that `create-checkout` calls the
gate at all — deleting the call kept the suite passing. The stub now
records the chain and the test asserts each filter; the smoke test
asserts the wiring. Both were verified by breaking them.

### And the smoke test only ever looked at Pinellas

One shared template renders all 56 county pages, so a miss is silent
everywhere at once. The cap and the promise are now checked on every
county page, and a `data-tier="featured"` row in the plain table is
reported as a warning: a featured listing down there holds no county
position, which means somebody is paying for a card they are not getting.
It is not a build failure, because no push can free a position — see
below.

### Two more the second review found

`notifyOps` had no timeout, and both alerts were sent before the row was
written -- so a hung Resend call would hold the webhook open until Stripe
gave up, and the redelivery would repeat the whole thing. The fetch is
bounded at 5 seconds and the alerts are collected and sent after the
UPDATE succeeds.

The stranded-featured check was a build failure. A featured listing in
the plain table is a data state, and no push can fix it: the listing is
down there precisely because no position was free to give it. It is a
warning now. `notifyOps` is the signal that matters, and blocking every
unrelated deploy was the wrong lever.

### Not changed

`featured_cities: []` at fulfillment still falls back to the listing's own
mailing city, a city the inspector never chose. It needs distinguishing
"never set" from "set to nothing" in the schema, and with the gate in
place it takes two races to reach. The notification above means a person
now hears about it either way.

---

## 2026-09-14 — A full county is refused at checkout

**Built.** `assertCountyHasRoom` in `netlify/lib/featured.mts`, called by
`create-checkout` before Stripe and before the city check, because a full
county cannot be sold whatever cities are open and "Pinellas is full" is a
clearer refusal than "Clearwater has no spot". It throws 409 naming the
number of spots. The dashboard mirrors it: when every position is taken
the buy button is disabled and the card says so with an email address,
before the inspector picks cities rather than after they click.

This is the piece the 2026-09-11 and 2026-09-14 waitlist entries were
waiting on. Nothing was scarce before it: the county cap existed in the
copy and in fulfillment, and the sale ignored it.

### The two ways a seventh card could still appear, and what happens now

- **A race for the last spot.** `create-checkout` checks, then Stripe
  takes a card, then the webhook fulfills. If the last position goes in
  between, `nextPosition` returns null. That used to be written as a
  silent null `featured_position`; it is now logged with the license
  number, the county and what to do (free a position with `set-tier.mjs`
  or refund). They keep the city cards they paid for.
- **`set-tier.mjs`**, which is the deliberate hand-operated escape hatch
  and stays one.

In both cases the county page no longer breaks its promise: the featured
row renders only listings that hold a position, sliced at
`COUNTY_FEATURED_CAP`, and anything past that drops into the rows below,
where it still shows as claimed with its contact details rather than
vanishing from the page.

### Tested by breaking it

`scripts/county-gate.test.mjs` stubs the database and pins the cases that
matter: an empty county sells position 1, a canceled position 2 is
reused before 3 so the row grows no holes, the sixth spot sells, the
seventh is refused with a 409, an over-full county is still refused, and a
null position never consumes a spot. Removing the throw and an
off-by-one in the position loop were both introduced on purpose and both
failed the test. It runs in `npm run verify` and in CI before the build,
along with the attribution-label test that had no runner until now.

### Two small things this forced

`HttpError` no longer uses a `public status` parameter property, and
`featured.mts` imports `../../src/lib/cities.ts` with its extension, as
`cities.ts` now does for `./slug.ts`. Node's type stripper rejects
parameter properties and extensionless specifiers, and without both
changes the module cannot be imported by a test at all. The netlify
tsconfig already set `allowImportingTsExtensions`.

### Still not built

The waitlist itself. A refused inspector is told to email, which is where
the 2026-09-11 entry said the list should land until it has a table.

---

## 2026-09-14 — The featured numbers live in one file, and the smoke test holds the prose to them

**Built.** `src/lib/cities.ts` is now the only place a featured-inventory
number is written: `COUNTY_FEATURED_CAP`, `COUNTY_FEATURED_TARGET`,
`COUNTY_POSITION_LIMIT`, `CITY_FEATURED_CAP`, `CITY_FEATURED_TARGET`,
`CITY_FEATURED_TARGET_SMALL`, `SMALL_CITY_LISTINGS`, `MAX_FEATURED_CITIES`
and `MIN_CITY_LISTINGS`. The county page and `netlify/lib/featured.mts`
import from it rather than declaring their own. `set-tier.mjs` still keeps
copies, because importing the module would pull the Supabase client into a
CLI script, and the smoke test compares them.

### Why

The caps moved from four to six across six files in one evening. Each move
touched a constant in one place and an English word in another: "Six spots
per city, never more" is hardcoded prose on the sales page, in the featured
dialog, on the dashboard and in the terms page, and none of it is derived
from the constant. A missed one is a promise broken in public with nothing
failing and no error anywhere.

### What now fails the build

- A cap the copy does not state, on the county page, city pages, the sales
  page, the featured dialog, the dashboard or the terms page. The prose
  spells the number out, so the check spells it too.
- `COUNTY_FEATURED_CAP` above `COUNTY_POSITION_LIMIT`. The schema checks
  `featured_position between 1 and 6`; a cap above that writes a position
  the database rejects at fulfillment, after the card is charged. Raising
  it needs the migration first.
- An odd target. Both grids are two columns, so an odd count leaves a
  visible hole where a card should be.
- `set-tier.mjs` drifting from `lib/cities.ts`.
- The county page redeclaring `FEATURED_CAP` or `FEATURED_TARGET` locally.

Each of the five was verified by breaking it on purpose and watching the
smoke test fail, then restoring. A guard nobody has seen fail is a guard
nobody knows works.

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

### Small cities need no smaller cap, but they do draw fewer empty boxes

The cap is one number everywhere and the copy stays one sentence: a city
page holds at most as many featured cards as inspectors who named it, and
nobody picks Gulfport over Clearwater, so those pages stay small on their
own and can still fill to six if six inspectors pay.

What does vary is how many "spot open" cards an unsold page draws.
`cityFeaturedTarget` returns 2 under `SMALL_CITY_LISTINGS` (10) and 4 at
or above it. Gulfport lists three inspectors; four dashed boxes above
them made the advertisement bigger than the page it sat on and read as a
page begging. Ten splits Pinellas where the data already splits it —
Dunedin has 19 and Pinellas Park has 9, with nothing between — and puts
about half the state's 314 city pages on two. Both values are even
because the grid is two columns.

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
- **The contact block is pinned to the bottom of the card** and labeled
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
Four counties held 51 city pages; the state holds 314 across 56 live counties. Every other lever
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
`tel:` link that logs before dialing, not a new system.

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
