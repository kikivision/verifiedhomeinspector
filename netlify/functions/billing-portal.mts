// POST /.netlify/functions/billing-portal
// Header: Authorization: Bearer <supabase token>
//
// Sends a featured inspector to Stripe's customer portal to update a card or
// cancel. Cancelling there ends the subscription; the webhook takes the card
// down. Nothing about billing is handled on this site's own pages.
import type { Context } from '@netlify/functions';
import { admin, stripe, siteUrl, json, callerListing, HttpError } from '../lib/featured.mts';

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);
  try {
    const { listing } = await callerListing(req, admin());
    if (!listing.stripe_customer_id) {
      throw new HttpError(400, 'This listing has no billing on file. If you are featured, it was set up by hand; contact us to change it.');
    }
    const session = await stripe().billingPortal.sessions.create({
      customer: listing.stripe_customer_id,
      return_url: `${siteUrl()}/dashboard/`,
    });
    return json({ url: session.url });
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Something went wrong opening billing.' }, 500);
  }
};
