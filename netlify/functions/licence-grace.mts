// Scheduled daily. Handles what happens to a paid featured spot when the
// inspector's licence stops being current.
//
// The site's whole promise is that every listing is verified against the DBPR
// record, so a delisted row renders on no page the moment it is marked. That
// left a paying inspector invisible and still billed, holding a county
// position nobody could buy. Decided 2026-09-14: pause the billing, hold the
// spot for GRACE_DAYS, then release it. See DECISIONS.md.
//
//   lapsed            -> pause Stripe collection, mail the inspector and hello@
//   back in time      -> resume collection, mail both, position never moved
//   still gone at 30d -> cancel the subscription; the customer.subscription
//                        .deleted webhook drops the row to claimed, frees the
//                        position and rebuilds, which is the one path that
//                        already existed and is already tested
//
// Every branch is idempotent: it reads the live pause state from Stripe rather
// than tracking it here, so running twice in a day does nothing twice.
//
// Env (Netlify → Environment variables): STRIPE_SECRET_KEY, RESEND_API_KEY,
// PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import type { Config } from '@netlify/functions';
import { admin, stripe, notifyOps, GRACE_DAYS, graceAction, type GraceInput } from '../lib/featured.mts';

const FROM = 'Karen at Verified Home Inspector <hello@mail.verifiedhomeinspector.com>';
const REPLY_TO = 'hello@verifiedhomeinspector.com';
const FOOTER =
  'Verified Home Inspector · Sunstate Bay Ventures LLC\n' +
  'PO Box 66, Zelienople, PA 16063';

async function mail(to: string, subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Server is missing RESEND_API_KEY.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** What the inspector reads. Plain text, and it never says they did anything wrong. */
function inspectorEmail(action: 'pause' | 'resume' | 'cancel', name: string): { subject: string; text: string } {
  if (action === 'pause') {
    return {
      subject: 'Your featured spot is paused — licence not showing as current',
      text:
        `Hi ${name},\n\n` +
        'Your licence stopped appearing in the Florida DBPR list of current home ' +
        'inspectors, so your listing is hidden from the site for now. That is the ' +
        'one promise this site makes, that every inspector on it is current, and I ' +
        'hold to it even when it costs me.\n\n' +
        'Two things, both in your favour:\n\n' +
        `1. I have paused your billing. You will not be charged while your card is hidden.\n` +
        `2. Your featured spot is held for ${GRACE_DAYS} days. Nobody else can buy it.\n\n` +
        'If this is a renewal still working its way through DBPR, it usually sorts ' +
        'itself out. The moment your licence is back in their list, your card comes ' +
        'back exactly where it was and billing resumes. You need do nothing here.\n\n' +
        `If it is still not back after ${GRACE_DAYS} days I will release the spot and ` +
        'cancel the subscription, and you keep your free claimed listing.\n\n' +
        'Reply to this email if something looks wrong and I will sort it out.\n\n' +
        `Karen at Verified Home Inspector\n\n${FOOTER}`,
    };
  }
  if (action === 'resume') {
    return {
      subject: 'Your featured spot is back',
      text:
        `Hi ${name},\n\n` +
        'Your licence is showing as current with DBPR again, so your featured card ' +
        'is back on the site in the same position it held before, and billing has ' +
        'resumed from today.\n\n' +
        'Nothing was lost and you were not charged while it was paused.\n\n' +
        `Karen at Verified Home Inspector\n\n${FOOTER}`,
    };
  }
  return {
    subject: 'Your featured spot has been released',
    text:
      `Hi ${name},\n\n` +
      `Your licence has not appeared in the DBPR list of current inspectors for ` +
      `${GRACE_DAYS} days, so I have released your featured spot and cancelled the ` +
      'subscription. You were not charged for any of that time.\n\n' +
      'Your claimed listing stays, free, and comes back on the site as soon as your ' +
      'licence is current again. If you want a featured spot after that, you can buy ' +
      'one from your dashboard whenever one is open.\n\n' +
      'Reply to this email if this is wrong and I will fix it the same day.\n\n' +
      `Karen at Verified Home Inspector\n\n${FOOTER}`,
  };
}

export default async (): Promise<Response> => {
  const db = admin();
  const { data, error } = await db
    .from('listings')
    .select('id, license_number, licensee_name, business_name, county, tier, delisted_at, claimed_by, stripe_subscription_id')
    .eq('tier', 'featured')
    .not('stripe_subscription_id', 'is', null);
  if (error) {
    console.error('licence-grace: listing read failed', error);
    return new Response('read failed', { status: 500 });
  }

  const rows = (data ?? []) as GraceInput[];
  const done: string[] = [];
  const s = stripe();

  for (const l of rows) {
    let paused = false;
    try {
      const sub = await s.subscriptions.retrieve(l.stripe_subscription_id!);
      if (sub.status === 'canceled' || sub.status === 'incomplete_expired') continue;
      paused = sub.pause_collection !== null && sub.pause_collection !== undefined;
    } catch (err) {
      console.error(`licence-grace: could not read subscription for ${l.license_number}`, err);
      continue;
    }

    const action = graceAction(l, paused, new Date());
    if (action === 'none') continue;

    try {
      if (action === 'pause') {
        await s.subscriptions.update(l.stripe_subscription_id!, { pause_collection: { behavior: 'void' } });
      } else if (action === 'resume') {
        await s.subscriptions.update(l.stripe_subscription_id!, { pause_collection: null });
      } else {
        // The subscription.deleted webhook does the rest: tier back to claimed,
        // position freed, cities cleared, site rebuilt. One path, already tested.
        await s.subscriptions.cancel(l.stripe_subscription_id!);
      }
    } catch (err) {
      console.error(`licence-grace: ${action} failed for ${l.license_number}`, err);
      await notifyOps(`Licence grace: ${action} FAILED for ${l.license_number}`,
        `${l.license_number} (${l.county}) needed ${action} on ${l.stripe_subscription_id} and Stripe refused. ` +
        'Do it by hand in Stripe.');
      continue;
    }

    let mailed = 'no claimant on file';
    if (l.claimed_by) {
      const { data: user } = await db.auth.admin.getUserById(l.claimed_by);
      const to = user?.user?.email;
      if (to) {
        const { subject, text } = inspectorEmail(action, l.licensee_name.split(' ')[0] || 'there');
        try {
          await mail(to, subject, text);
          mailed = `emailed ${to}`;
        } catch (err) {
          console.error(`licence-grace: could not mail ${l.license_number}`, err);
          mailed = `COULD NOT EMAIL ${to} — tell them by hand`;
        }
      }
    }

    done.push(`${action} ${l.license_number} (${l.county}) — ${mailed}`);
    console.info(`licence-grace: ${action} ${l.license_number} — ${mailed}`);
  }

  if (done.length > 0) {
    await notifyOps(`Licence grace: ${done.length} change(s)`,
      `${done.join('\n')}\n\nA pause means the inspector dropped out of the DBPR extract and is no longer ` +
      `billed. A cancel means ${GRACE_DAYS} days passed and the spot is now free to sell.`);
  }
  return new Response(`checked ${rows.length}, changed ${done.length}`, { status: 200 });
};

export const config: Config = { schedule: '@daily' };
