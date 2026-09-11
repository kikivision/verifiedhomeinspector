# Decisions

Things decided but not built, and things built in a way that looks wrong
until you know why. Newest first.

---

## 2026-09-11 — At scale, show contact details and measure clicks instead of requests

**Direction set. Not built, and not yet due.** The trigger is volume:
roughly 100 paying inspectors, or any point where routing every lead by
hand stops being possible.

### The plan

Today every lead passes through the request form so it can be counted,
and no listing shows a phone number or a website (see "Contact is
deliberately not shown" in the README). That works because the volume is
small enough to watch by hand.

At scale it stops working. The intent is to show inspectors' contact
details directly so homeowners call them, keep a lighter measurement — a
tracked click rather than a counted form submission — and let the
relationship prove itself: if the traffic is real the inspector keeps
paying, and if it is not they stop.

### Why this is fine

Counting exists to prove value, not for its own sake. Once there is
enough traffic that value is self-evident, an exact count is a cost
rather than a feature — it is a bottleneck sitting between a homeowner
and the person they want to call, and it costs real leads on a phone
where tapping to call is what people do.

`listing_events.event_type` already includes `click_phone`. Whoever
designed that table expected this, so the measurement half needs a
`tel:` link that logs before dialling, not a new system.

### What has to change WITH it, not after

**The "free until five requests" offer cannot survive this.** It is a
promise denominated in counted requests, and a tracked phone tap is not
one — it measures intent, not a conversation. Switching contact on
without repricing means billing against a number that no longer means
what it did. The offer appears in four places: the homepage claim panel,
the county claim panel, terms, and the request dialog's own copy.

**The exclusivity promise stops being the product.** "Every request goes
to you and nobody else. We never send one homeowner to several
inspectors, and we never charge per lead" is true of form requests and
says nothing about a published phone number. It stays honest, but it
stops being the reason to pay, so the pitch has to rest on placement and
traffic instead. Same for the privacy page's version of it.

**Churn is a real signal but a slow one.** "They keep paying or they do
not" is the honest fallback and it is genuinely sufficient for deciding
whether the site works. It is not sufficient for noticing a single
inspector whose leads dried up two months ago. That is precisely why the
click metric is still worth having: not to bill against, but to see a
problem before a cancellation does.

### What would bring it forward

An inspector saying the form cost them a job — a homeowner who wanted to
call and did not fill anything in. One such report is worth more than the
volume trigger, because it is the failure the form was always risking.

---

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
no prominent way to say so. That button is not theoretical — a visitor
fired `featured_inquiry` from it on 2026-09-10, the site's second day.

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
