// Scheduled daily. Handles what happens to a paid featured spot when the
// inspector's license stops being current.
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
import {
  admin, stripe, notifyOps, releaseFeaturedSpot, rebuild,
  GRACE_DAYS, GRACE_WARN_DAYS, PAUSE_MARKER, graceAction, type GraceInput, type PauseOwner,
} from '../lib/featured.mts';

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
function inspectorEmail(action: 'pause' | 'resume' | 'cancel' | 'warn', name: string): { subject: string; text: string } {
  if (action === 'pause') {
    return {
      subject: 'Your featured spot is paused — license not showing as current',
      text:
        `Hi ${name},\n\n` +
        'Your license stopped appearing in the Florida DBPR list of current home ' +
        'inspectors, so your listing is hidden from the site for now. That is the ' +
        'one promise this site makes, that every inspector on it is current, and I ' +
        'hold to it even when it costs me.\n\n' +
        'Two things, both in your favor:\n\n' +
        '1. I have stopped your billing. You will not be charged again while your card is hidden.\n' +
        `2. Your featured spot is held for ${GRACE_DAYS} days. Nobody else can buy it.\n\n` +
        'If this is a renewal still working its way through DBPR, it usually sorts ' +
        'itself out. The moment your license is back in their list, your card comes ' +
        'back exactly where it was and billing restarts. You need do nothing here.\n\n' +
        `If it is still not back after ${GRACE_DAYS} days I will release the spot and ` +
        'cancel the subscription, and you keep your free claimed listing.\n\n' +
        'Reply to this email if something looks wrong, or if you were charged for a ' +
        'period you should not have been, and I will sort it out.\n\n' +
        `Karen at Verified Home Inspector\n\n${FOOTER}`,
    };
  }
  if (action === 'warn') {
    return {
      subject: `Your featured spot will be released in ${GRACE_DAYS - GRACE_WARN_DAYS} days`,
      text:
        `Hi ${name},\n\n` +
        `Your license still is not showing as current with the Florida DBPR, ${GRACE_WARN_DAYS} ` +
        'days on. You have not been charged for any of that time.\n\n' +
        `In ${GRACE_DAYS - GRACE_WARN_DAYS} days I will release your featured spot and cancel the ` +
        'subscription. Your claimed listing stays, free, whatever happens.\n\n' +
        'If your renewal has actually gone through and this is wrong, reply to this ' +
        'email and I will hold the spot for you.\n\n' +
        `Karen at Verified Home Inspector\n\n${FOOTER}`,
    };
  }
  if (action === 'resume') {
    return {
      subject: 'Your featured spot is back',
      text:
        `Hi ${name},\n\n` +
        'Your license is showing as current with DBPR again, so your featured card ' +
        'is back on the site in the same position it held before, and billing has ' +
        'restarted.\n\n' +
        'Your billing date has not moved, and you were not charged while it was ' +
        'paused.\n\n' +
        `Karen at Verified Home Inspector\n\n${FOOTER}`,
    };
  }
  return {
    subject: 'Your featured spot has been released',
    text:
      `Hi ${name},\n\n` +
      'Your license has not appeared in the DBPR list of current inspectors for ' +
      `${GRACE_DAYS} days, so I have released your featured spot and canceled the ` +
      'subscription. You were not charged for any of that time.\n\n' +
      'Your claimed listing stays, free, and comes back on the site as soon as your ' +
      'license is current again. If you want a featured spot after that, you can buy ' +
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
    console.error('license-grace: listing read failed', error);
    return new Response('read failed', { status: 500 });
  }

  const rows = (data ?? []) as (GraceInput & { id: string; tier: string })[];
  const done: string[] = [];
  const s = stripe();
  // A scheduled function gets 30 seconds, and each row can cost two Stripe
  // calls, a user lookup and a mail. Six lapsing at once would run past it
  // mid-loop, after the Stripe side had happened and before anyone was told.
  // Whatever is left over is picked up by tomorrow's run; the summary says so.
  const BUDGET = 6;
  let released = false;
  let examined = 0;

  for (const l of rows) {
    if (examined >= BUDGET) {
      done.push(`stopped after ${BUDGET} rows; ${rows.length - examined} left for tomorrow`);
      break;
    }
    examined += 1;

    let pause: PauseOwner = 'none';
    try {
      const sub = await s.subscriptions.retrieve(l.stripe_subscription_id!);
      if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
        // The row says featured and Stripe says the subscription is gone. That
        // is what a missed customer.subscription.deleted leaves behind: a county
        // position held by nobody, which nothing else would ever notice.
        await releaseFeaturedSpot(db, l.id);
        released = true;
        done.push(`released ${l.license_number} (${l.county}) — subscription ${sub.status}, position freed`);
        continue;
      }
      // Only ever lift a pause this job applied. A pause set by hand in the
      // Stripe dashboard is somebody's deliberate decision about a customer.
      pause = sub.pause_collection
        ? (sub.metadata?.paused_by === PAUSE_MARKER ? 'ours' : 'theirs')
        : 'none';
    } catch (err) {
      console.error(`license-grace: could not read subscription for ${l.license_number}`, err);
      continue;
    }

    const action = graceAction(l, pause, new Date());
    if (action === 'none') continue;

    try {
      if (action === 'pause') {
        await s.subscriptions.update(l.stripe_subscription_id!, {
          pause_collection: { behavior: 'void' },
          metadata: { paused_by: PAUSE_MARKER },
        });
      } else if (action === 'resume') {
        await s.subscriptions.update(l.stripe_subscription_id!, {
          pause_collection: null,
          metadata: { paused_by: '' },
        });
      } else if (action === 'cancel') {
        // The subscription.deleted webhook does the rest: tier back to claimed,
        // position freed, cities cleared, site rebuilt. One path, and the write
        // itself is releaseFeaturedSpot, shared with reconcile.
        await s.subscriptions.cancel(l.stripe_subscription_id!);
      }
      // 'warn' touches Stripe not at all; it is only an email.
    } catch (err) {
      console.error(`license-grace: ${action} failed for ${l.license_number}`, err);
      await notifyOps(`License grace: ${action} FAILED for ${l.license_number}`,
        `${l.license_number} (${l.county}) needed ${action} on ${l.stripe_subscription_id} and Stripe refused. ` +
        'Do it by hand in Stripe.');
      continue;
    }

    let mailed: string;
    if (!l.claimed_by) {
      mailed = 'no claimant on file, nobody to tell';
    } else {
      const { data: user, error: userError } = await db.auth.admin.getUserById(l.claimed_by);
      const to = user?.user?.email;
      if (userError) {
        mailed = `COULD NOT LOOK UP the claimant (${userError.message}) — tell them by hand`;
      } else if (!to) {
        mailed = 'claimant account has no email address on it';
      } else {
        const { subject, text } = inspectorEmail(action, l.licensee_name.split(' ')[0] || 'there');
        try {
          await mail(to, subject, text);
          mailed = `emailed ${to}`;
        } catch (err) {
          console.error(`license-grace: could not mail ${l.license_number}`, err);
          mailed = `COULD NOT EMAIL ${to} — tell them by hand`;
        }
      }
    }

    done.push(`${action} ${l.license_number} (${l.county}) — ${mailed}`);
    console.info(`license-grace: ${action} ${l.license_number} — ${mailed}`);
  }

  // A release here did not go through the webhook, so nothing else rebuilds it.
  if (released) await rebuild();

  if (done.length > 0) {
    await notifyOps(`License grace: ${done.length} change(s)`,
      `${done.join('\n')}\n\n` +
      'pause = dropped out of the DBPR extract, billing stopped, spot held.\n' +
      `warn = ${GRACE_WARN_DAYS} days gone, ${GRACE_DAYS - GRACE_WARN_DAYS} days left before the spot is released.\n` +
      `cancel = ${GRACE_DAYS} days gone, spot now free to sell.\n` +
      'released = Stripe says the subscription was already gone and the row still said featured.');
  }
  return new Response(`checked ${examined} of ${rows.length}, changed ${done.length}`, { status: 200 });
};

// 15:00 UTC, deliberately after the monthly DBPR import at 13:00 on the 1st.
// At 00:00 the job ran before the one thing that could clear delisted_at, so a
// cancel and its rescue could land on the same morning in the wrong order.
export const config: Config = { schedule: '0 15 * * *' };
