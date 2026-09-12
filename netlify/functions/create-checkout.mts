// POST /.netlify/functions/create-checkout
// Body: { cities: string[] }   Header: Authorization: Bearer <supabase token>
//
// Starts a Stripe Checkout session for a featured spot: a $50/month
// subscription with a free first week, so the card is live before anything is
// charged — which is what "nothing is charged until it is live and you have
// seen it" has promised since the first county page. Everything that decides
// whether the sale is allowed (claimed listing, cities with open spots, no
// more than three) is checked here, before Stripe, so a full city is refused
// before anyone types a card number. Fulfilment is the webhook's job.
import type { Context } from '@netlify/functions';
import {
  admin, stripe, siteUrl, json, errorResponse, callerListing, assertCitiesAvailable, HttpError, TRIAL_DAYS,
} from '../lib/featured.mts';

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);
  try {
    const db = admin();
    const { userId, email, listing } = await callerListing(req, db);
    if (listing.tier === 'featured') {
      throw new HttpError(400, 'This listing is already featured. Use Manage billing to change it.');
    }
    if (listing.delisted_at) {
      throw new HttpError(400, 'This license no longer appears in the DBPR extract, so it cannot be featured.');
    }
    const body = (await req.json().catch(() => ({}))) as { cities?: string[] };
    const cities = await assertCitiesAvailable(db, listing, body.cities ?? []);

    const priceId = process.env.STRIPE_PRICE_FEATURED;
    if (!priceId) throw new HttpError(500, 'Server is missing STRIPE_PRICE_FEATURED.');

    const s = stripe();
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        // Copied onto the subscription so a cancellation event, which carries
        // the subscription and not the checkout session, still names the row.
        metadata: { listing_id: listing.id, license: listing.license_number, county: listing.county },
      },
      // Reused on a second purchase (e.g. after a cancellation) so one
      // inspector is one customer in Stripe, not one per attempt.
      ...(listing.stripe_customer_id ? { customer: listing.stripe_customer_id } : { customer_email: email }),
      client_reference_id: listing.id,
      metadata: {
        listing_id: listing.id,
        license: listing.license_number,
        county: listing.county,
        cities: JSON.stringify(cities),
        user_id: userId,
      },
      allow_promotion_codes: true,
      success_url: `${siteUrl()}/dashboard/?featured=success`,
      cancel_url: `${siteUrl()}/dashboard/`,
    });
    if (!session.url) throw new HttpError(500, 'Stripe did not return a checkout URL.');
    return json({ url: session.url });
  } catch (err) {
    return errorResponse(err, 'Something went wrong starting checkout.');
  }
};
