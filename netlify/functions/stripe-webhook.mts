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
import { admin, stripe, json, cityAvailability, nextPosition, rebuild } from '../lib/featured.mts';

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

  let wanted: string[] = [];
  try {
    wanted = JSON.parse(session.metadata?.cities ?? '[]');
  } catch {
    wanted = [];
  }
  const open = await cityAvailability(db, listing.county, listing.license_number);
  const granted = wanted.filter((c) => (open.get(c) ?? 0) > 0);
  const refused = wanted.filter((c) => !granted.includes(c));
  if (refused.length > 0) {
    console.error(
      `Listing ${listing.license_number} paid for ${wanted.join(', ')} but ${refused.join(', ')} filled ` +
        `before fulfillment. Featured on ${granted.join(', ') || 'the county page only'}; sort out the rest by hand.`,
    );
  }

  const position = listing.tier === 'featured' ? listing.featured_position : await nextPosition(db, listing.county);
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

  // Back to a plain claimed listing: their details stay, the placement goes.
  const { error: writeError } = await db
    .from('listings')
    .update({
      tier: 'claimed',
      featured_position: null,
      featured_cities: [],
      featured_since: null,
    })
    .eq('id', listing.id);
  if (writeError) throw writeError;
  console.info(`Subscription ${subscription.id} ${subscription.status}; ${listing.license_number} back to claimed.`);
  await rebuild();
}
