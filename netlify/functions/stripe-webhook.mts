// POST /.netlify/functions/stripe-webhook
//
// Stripe calls this. Register the URL in Stripe → Developers → Webhooks with
// these events, and put the signing secret in STRIPE_WEBHOOK_SECRET:
//   checkout.session.completed      a featured spot was bought
//   customer.subscription.updated   status changes (unpaid, canceled…)
//   customer.subscription.deleted   the subscription ended
//
// This is the only path that moves a listing to 'featured' on its own. It
// re-checks the city spots at fulfillment: two people could check out for the
// last spot in Clearwater in the same minute, and the second one's card is
// then featured on the county page and the cities that were still open, with
// the refused city logged for a person to sort out with a refund or a swap.
// Refusing the whole purchase after Stripe has taken a card is worse.
import type { Context } from '@netlify/functions';
import type Stripe from 'stripe';
import { admin, stripe, json, cityAvailability, nextPosition, notifyOps, rebuild, releaseFeaturedSpot } from '../lib/featured.mts';

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get('stripe-signature');
  if (!secret || !signature) return json({ error: 'Webhook is not configured.' }, 500);

  let event: Stripe.Event;
  try {
    // constructEvent needs the raw body, byte for byte; parsing it first
    // would break the signature.
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch (err) {
    console.error('Webhook signature failed:', err);
    return json({ error: 'Bad signature.' }, 400);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await fulfill(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await reconcile(event.data.object as Stripe.Subscription);
        break;
      default:
        // Not subscribed to anything else; Stripe still expects a 200.
        break;
    }
    return json({ received: true });
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want for a transient
    // database error and harmless for anything else: every write below is
    // idempotent.
    console.error(`Webhook ${event.type} failed:`, err);
    // A checkout that cannot be fulfilled is a customer who has paid and
    // received nothing, so it does not get to be only a log line. Stripe
    // retries for three days; this mails on each, and stops when one succeeds.
    if (event.type === 'checkout.session.completed') {
      await notifyOps(`Checkout could not be fulfilled: ${event.id}`,
        `${event.type} ${event.id} failed with: ${err instanceof Error ? err.message : String(err)}\n\n` +
        'Stripe will retry for up to three days. If this keeps arriving, the customer has paid ' +
        'and has no card on the site.');
    }
    return json({ error: 'Handler failed.' }, 500);
  }
};

async function fulfill(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== 'subscription') return;
  const listingId = session.metadata?.listing_id;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!listingId || !subscriptionId) {
    console.error('checkout.session.completed without listing_id or subscription', session.id);
    return;
  }
  const db = admin();
  const { data: listing, error } = await db
    .from('listings')
    .select('id, county, city, license_number, tier, featured_position, featured_cities, stripe_subscription_id')
    .eq('id', listingId)
    .maybeSingle();
  if (error) throw error;
  if (!listing) {
    console.error('checkout for a listing that does not exist', listingId);
    return;
  }
  // Stripe delivers at least once; the second delivery finds this and stops.
  if (listing.stripe_subscription_id === subscriptionId && listing.tier === 'featured') return;

  // A DIFFERENT subscription for a listing that is already featured is not a
  // redelivery, it is a second sale. A checkout session lives 24 hours, and
  // create-checkout only refuses an already-featured listing at the moment the
  // session is made: open checkout, go back, open it again, complete both, and
  // this row would keep one position while silently being billed twice.
  //
  // Everything here decides from LIVE Stripe state rather than from ids alone.
  // An earlier version compared ids and canceled, which broke two ways: after
  // Karen canceled the duplicate by hand every redelivery for the next three
  // days mailed "TWO live subscriptions" that was no longer true, and if she
  // had instead kept the newer one and canceled the original, a redelivery
  // would have canceled the one she kept and left the customer with no card.
  if (listing.tier === 'featured' && listing.stripe_subscription_id && listing.stripe_subscription_id !== subscriptionId) {
    const who = `${listing.license_number} (${listing.county})`;
    const s = stripe();
    // Only a genuine "no such subscription" counts as missing. Swallowing every
    // error here meant a Stripe blip read as "it does not exist": a failed read
    // of the incoming one returned 200 and left the customer billed twice with
    // no retry, and a failed read of the recorded one adopted over a live
    // subscription that then billed forever with nothing pointing at it.
    const statusOf = async (id: string): Promise<string> => {
      try {
        return (await s.subscriptions.retrieve(id)).status;
      } catch (err) {
        const e = err as { type?: string; code?: string };
        if (e?.type === 'StripeInvalidRequestError' && e?.code === 'resource_missing') return 'missing';
        throw err;
      }
    };
    const DEAD = ['canceled', 'incomplete_expired', 'missing'];
    const [recorded, incoming] = await Promise.all([
      statusOf(listing.stripe_subscription_id),
      statusOf(subscriptionId),
    ]);

    // Already dealt with: by an earlier delivery of this same event, or by
    // hand. Nothing to do, and answering 200 stops the retries.
    if (DEAD.includes(incoming)) {
      console.info(`${who}: duplicate ${subscriptionId} is already ${incoming}; nothing to do.`);
      return;
    }

    // The subscription on file is gone and this one is live, so this is the
    // only subscription the customer has. Canceling it would leave them
    // paying nothing and showing nowhere. Adopt it and keep their placement.
    if (DEAD.includes(recorded)) {
      // Scoped to tier='featured': reconcile may have processed the recorded
      // subscription's deleted event since the read above, and adopting onto a
      // released row would leave a claimed listing carrying a live subscription.
      const { data: adopted, error: adoptError } = await db
        .from('listings')
        .update({ stripe_subscription_id: subscriptionId, stripe_customer_id: customerId ?? null })
        .eq('id', listing.id)
        .eq('tier', 'featured')
        .select('id');
      if (adoptError) throw adoptError;
      if (!adopted || adopted.length === 0) {
        // The row was released underneath us, so this is an ordinary purchase
        // after a cancellation. Throwing lets Stripe redeliver into the normal
        // fulfillment path, which will read the row fresh.
        throw new Error(`Listing ${listing.license_number} was released while adopting ${subscriptionId}; retrying as a fresh purchase.`);
      }
      await notifyOps(`Featured subscription replaced: ${listing.license_number}`,
        `${who} was featured on ${listing.stripe_subscription_id}, which is now ${recorded}. ` +
        `Their live subscription ${subscriptionId} has been attached to the listing instead, and ` +
        'their position and cities are unchanged. Nothing to do unless this looks wrong.');
      return;
    }

    // Both live: a genuine double sale. Keep the one already running.
    try {
      await s.subscriptions.cancel(subscriptionId);
    } catch (err) {
      console.error('Could not cancel the duplicate subscription', subscriptionId, err);
      await notifyOps(`COULD NOT cancel duplicate subscription: ${listing.license_number}`,
        `${who} completed a second checkout while already featured on ` +
        `${listing.stripe_subscription_id}. The duplicate ${subscriptionId} is live and the ` +
        'cancel call FAILED, so they will be billed twice. Cancel it in Stripe by hand; this ' +
        'retries on its own until then and goes quiet once the duplicate is canceled.');
      // Thrown on purpose: a 500 makes Stripe redeliver and the retry tries the
      // cancel again. Once the duplicate is canceled, by us or by hand, the
      // check above returns 200 and the retries and the emails stop.
      throw new Error(`Could not cancel duplicate subscription ${subscriptionId} for ${listing.license_number}`);
    }
    console.info(`${who}: canceled duplicate ${subscriptionId}; ${listing.stripe_subscription_id} untouched.`);
    await notifyOps(`Duplicate featured subscription canceled: ${listing.license_number}`,
      `${who} completed a second checkout while already featured on ` +
      `${listing.stripe_subscription_id}. The duplicate ${subscriptionId} was canceled and the ` +
      'original left running. Check Stripe for any charge that already landed.');
    return;
  }

  let wanted: string[] = [];
  try {
    wanted = JSON.parse(session.metadata?.cities ?? '[]');
  } catch {
    wanted = [];
  }
  const open = await cityAvailability(db, listing.county, listing.license_number);
  const granted = wanted.filter((c) => (open.get(c) ?? 0) > 0);
  const refused = wanted.filter((c) => !granted.includes(c));
  // Alerts are collected here and sent after the write below: the row is what
  // matters, and a notification ahead of it is one a Stripe redelivery repeats.
  const alerts: { subject: string; text: string }[] = [];
  if (refused.length > 0) {
    const detail =
      `${listing.license_number} (${listing.county}) paid for ${wanted.join(', ')} but ` +
      `${refused.join(', ')} filled before fulfillment. Featured on ` +
      `${granted.join(', ') || 'the county page only'}. Subscription ${subscriptionId}.\n\n` +
      'Free a city spot with set-tier.mjs, or refund. The free trial is 7 days, so there is ' +
      'that long before the first charge.';
    console.error(detail);
    alerts.push({ subject: `Featured city unavailable at fulfillment: ${listing.license_number}`, text: detail });
  }

  const position = listing.tier === 'featured' ? listing.featured_position : await nextPosition(db, listing.county);
  if (position === null) {
    // create-checkout refuses a full county, so reaching here means the last
    // position went between that check and this write, or the row was set by
    // hand. They paid and they are not getting the county card they bought,
    // so this reaches a person rather than a log line that expires.
    const detail =
      `${listing.license_number} (${listing.county}) paid but every county position was taken at ` +
      `fulfillment. Featured on ${granted.join(', ') || 'no city pages'} with NO county placement. ` +
      `Subscription ${subscriptionId}.\n\n` +
      'Free a position with set-tier.mjs or refund. The free trial is 7 days, so there is that ' +
      'long before the first charge.';
    console.error(detail);
    alerts.push({ subject: `County full at fulfillment, card not delivered: ${listing.license_number}`, text: detail });
  }
  const { error: writeError } = await db
    .from('listings')
    .update({
      tier: 'featured',
      featured_position: position,
      featured_cities: granted,
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: subscriptionId,
      featured_since: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
    })
    .eq('id', listing.id);
  if (writeError) throw writeError;
  for (const a of alerts) await notifyOps(a.subject, a.text);
  await rebuild();
}

/**
 * A subscription that is no longer paying takes the card down. 'past_due'
 * is left alone: Stripe is still retrying the card and the inspector has
 * been emailed; 'unpaid' and 'canceled' are the end of that road.
 */
async function reconcile(subscription: Stripe.Subscription): Promise<void> {
  const ended = ['canceled', 'unpaid', 'incomplete_expired'].includes(subscription.status);
  if (!ended) return;
  const db = admin();
  const { data: listing, error } = await db
    .from('listings')
    .select('id, license_number, tier, stripe_subscription_id')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle();
  if (error) throw error;
  if (!listing || listing.tier !== 'featured') return;

  // 'unpaid' is not 'gone'. Stripe keeps an unpaid subscription alive and
  // generating invoices, so releasing the spot without canceling leaves a
  // claimed row whose owner can still pay the open invoice and reasonably think
  // they are featured — while the daily job, which reads tier='featured', never
  // looks at them again. Cancel it, so recovery is a fresh purchase through the
  // county gate.
  if (subscription.status === 'unpaid') {
    try {
      await stripe().subscriptions.cancel(subscription.id);
    } catch (err) {
      console.error(`Could not cancel unpaid subscription ${subscription.id}`, err);
      await notifyOps(`Unpaid subscription could not be canceled: ${listing.license_number}`,
        `${listing.license_number} went unpaid and the cancel failed, so it is still live and still ` +
        `invoicing while their spot is released. Cancel ${subscription.id} in Stripe by hand.`);
    }
  }

  // Back to a plain claimed listing: their details stay, the placement goes.
  // Shared with license-grace, which needs the identical write when it finds a
  // dead subscription on a row this event never reached.
  await releaseFeaturedSpot(db, listing.id);
  console.info(`Subscription ${subscription.id} ${subscription.status}; ${listing.license_number} back to claimed.`);
  await rebuild();
}
