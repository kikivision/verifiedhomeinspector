# Decisions

Things decided but not built, and things built in a way that looks wrong
until you know why. Newest first.

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
