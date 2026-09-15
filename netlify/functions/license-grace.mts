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
//   still gone at 35d -> cancel the subscription; the customer.subscription
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
  GRACE_DAYS, GRACE_WARN_DAYS, PAUSE_MARKER, LIFTED_MARKER, WARN_MARKER, graceAction, pauseOwnerOf, type GraceInput, type PauseOwner,
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
function inspectorEmail(
  action: 'pause' | 'resume' | 'cancel' | 'warn',
  name: string,
  /** False when every pause attempt failed and they were billed throughout. */
  wasPaused: boolean,
): { subject: string; text: string } {
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
        '1. I have stopped your billing, so nothing new is charged while your card is hidden.\n' +
        '   If an invoice was already open before today it may still be collected; reply and\n' +
        '   I will refund it.\n' +
        `2. Your featured spot is held for ${GRACE_DAYS} days. Nobody else can buy it.\n\n` +
        'If this is a renewal still working its way through DBPR, it usually sorts ' +
        'itself out. I check their list once a month, and when your license is back ' +
        'in it your card returns exactly where it was and billing restarts. You need ' +
        'do nothing here, though a reply telling me it is sorted lets me look sooner.\n\n' +
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
      'subscription.\n\n' +
      (wasPaused
        ? 'You were not charged for any of that time.\n\n'
        : 'Your billing should have been paused for that period and was not, so if you ' +
          'were charged, reply and I will refund it.\n\n') +
      'Your claimed listing stays, free, and returns to the site after the next ' +
      'monthly DBPR check once your license is current again. If you want a featured ' +
      'spot after that, you can buy one from your dashboard whenever one is open.\n\n' +
      'Reply to this email if this is wrong and I will fix it the same day.\n\n' +
      `Karen at Verified Home Inspector\n\n${FOOTER}`,
  };
}

export default async (req: Request): Promise<Response> => {
  // OFF UNLESS EXPLICITLY ENABLED. Removing the `schedule` to stop this running
  // did the opposite: a scheduled function has no public URL, but a function
  // WITHOUT a schedule is an ordinary HTTP endpoint, so dropping the schedule
  // published a URL that anybody could call to pause, cancel and email
  // customers. This guard is what actually makes it inert, and it stays after
  // the schedule is restored, because a scheduled function is still reachable
  // by anything inside Netlify.
  //
  // To enable: set LICENSE_GRACE_ENABLED=true in Netlify, AND restore the
  // schedule line at the foot of this file. Both, deliberately.
  if (process.env.LICENSE_GRACE_ENABLED !== 'true') {
    return new Response('license-grace is disabled; set LICENSE_GRACE_ENABLED=true to turn it on', { status: 403 });
  }
  // A scheduled invocation carries no secret, so once enabled the only defence
  // against a stranger triggering a run is that it is idempotent and reports
  // everything it does. It is both, but a POST-only door costs nothing.
  if (req.method !== 'POST' && req.headers.get('x-nf-event') !== 'schedule') {
    return new Response('POST only', { status: 405 });
  }

  const db = admin();
  const { data, error } = await db
    .from('listings')
    .select('id, license_number, licensee_name, business_name, county, tier, delisted_at, claimed_by, stripe_subscription_id')
    .eq('tier', 'featured')
    .not('stripe_subscription_id', 'is', null)
    // Lapsed rows first, oldest lapse first. Without an ORDER BY, PostgREST
    // returns heap order, which is stable for rows this job never writes — so
    // a budget would examine the same few every day and a later subscriber
    // would never be looked at at all.
    .order('delisted_at', { ascending: true, nullsFirst: false });
  if (error) {
    console.error('license-grace: listing read failed', error);
    return new Response('read failed', { status: 500 });
  }

  const rows = (data ?? []) as (GraceInput & { id: string; tier: string })[];
  const done: string[] = [];
  const failed: string[] = [];
  const s = stripe();
  // A wall clock, not a row count. Netlify gives a scheduled function 30
  // seconds; a row needing work costs two Stripe calls, a user lookup and a
  // mail, while a row needing nothing costs one retrieve. Counting work meant
  // a long tail of no-op rows could still run past the ceiling and kill the
  // run before the summary was sent — silently, mid-loop, after the Stripe
  // side had already happened.
  const DEADLINE = Date.now() + 20_000;
  let released = false;
  let notReached = 0;

  for (const l of rows) {
    if (Date.now() > DEADLINE) { notReached += 1; continue; }

    let pause: PauseOwner = 'none';
    let warned = false;
    try {
      const sub = await s.subscriptions.retrieve(l.stripe_subscription_id!);
      if (sub.status === 'canceled' || sub.status === 'incomplete_expired' || sub.status === 'unpaid') {
        // The row says featured and Stripe says the subscription is over. A
        // canceled one is simply gone — this is what a missed
        // customer.subscription.deleted leaves behind, a county position held
        // by nobody. 'unpaid' is different and worth the extra call: Stripe
        // keeps it alive and generating invoices, so releasing without
        // canceling leaves a claimed row whose owner can still pay and think
        // they are featured. Recovery should be a fresh purchase through the
        // county gate, not a silent resurrection.
        if (sub.status === 'unpaid') {
          try {
            await s.subscriptions.cancel(l.stripe_subscription_id!);
            // Canceling stops collection but leaves the open invoice payable
            // through the link in Stripe's dunning email, so an inspector could
            // still pay $50 for a spot that no longer exists.
            const open = typeof sub.latest_invoice === 'string' ? sub.latest_invoice : sub.latest_invoice?.id;
            if (open) {
              try { await s.invoices.voidInvoice(open); } catch (err) {
                console.error(`license-grace: could not void ${open} for ${l.license_number}`, err);
                failed.push(`${l.license_number}: invoice ${open} is still payable for a released spot; void it in Stripe`);
              }
            }
          } catch (err) {
            console.error(`license-grace: could not cancel unpaid ${l.license_number}`, err);
            failed.push(`${l.license_number} (${l.county}) is unpaid and the cancel failed; cancel it in Stripe by hand`);
            continue;
          }
        }
        await releaseFeaturedSpot(db, l.id);
        released = true;
        const lapsed = l.delisted_at !== null;
        done.push(`released ${l.license_number} (${l.county}) — subscription ${sub.status}, position freed` +
          (lapsed ? ', license was lapsed' : ', LICENSE WAS CURRENT so this was an ordinary cancellation'));
        // Only mail when the license actually lapsed. This branch also catches
        // an ordinary voluntary cancellation whose webhook was late or missed,
        // and the release letter says "your license has not appeared for 35
        // days" — which would have been sent to a paying customer who simply
        // canceled, on a current license. Stripe sends its own cancellation
        // receipt for that case; a second, false letter from us is worse than
        // silence. wasPaused comes from the subscription we just read rather
        // than being hard-coded false, which claimed a refund was owed.
        if (lapsed) {
          await tellInspector(db, l, 'cancel', sub.metadata?.paused_by === PAUSE_MARKER, done);
        }
        continue;
      }
      // 'lifted' is stamped with its OWN marker the first time it is seen, so
      // a later pause set by hand reads as 'theirs' rather than as ours. Two
      // hand actions in sequence used to end in the job canceling a pause a
      // person had deliberately set. Derivation is pure and tested.
      pause = pauseOwnerOf(Boolean(sub.pause_collection), sub.metadata?.paused_by);
      warned = Boolean(sub.metadata?.[WARN_MARKER]);
      // Stamped HERE, the moment 'lifted' is first seen, because graceAction
      // returns 'none' for a lifted pause and the loop short-circuits on that:
      // a marker written after the action block was unreachable, and a person
      // who lifted our pause and later re-paused it by hand would still have
      // been read as us and canceled at day 35.
      if (pause === 'lifted' && sub.metadata?.paused_by === PAUSE_MARKER) {
        try {
          await s.subscriptions.update(l.stripe_subscription_id!, { metadata: { paused_by: LIFTED_MARKER } });
        } catch (err) {
          console.error(`license-grace: could not stamp the lifted marker on ${l.license_number}`, err);
        }
      }
    } catch (err) {
      // Never silent: a row that cannot be read is a county position held by
      // something nobody can see, and a log line expires in seven days.
      console.error(`license-grace: could not read subscription for ${l.license_number}`, err);
      failed.push(`could not read ${l.stripe_subscription_id} for ${l.license_number} (${l.county}) — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const action = graceAction(l, pause, warned, new Date());
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
          // Empty string deletes the key; a metadata update merges, so the ids
          // create-checkout wrote are untouched.
          metadata: { paused_by: '', [WARN_MARKER]: '' },
        });
      } else if (action === 'clear') {
        await s.subscriptions.update(l.stripe_subscription_id!, {
          metadata: { paused_by: '', [WARN_MARKER]: '' },
        });
      } else if (action === 'warn') {
        await s.subscriptions.update(l.stripe_subscription_id!, {
          metadata: { [WARN_MARKER]: new Date().toISOString() },
        });
      } else if (action === 'cancel') {
        // The subscription.deleted webhook does the rest: tier back to claimed,
        // position freed, cities cleared, site rebuilt. The write it performs is
        // releaseFeaturedSpot, shared with this function.
        await s.subscriptions.cancel(l.stripe_subscription_id!);
      }
    } catch (err) {
      console.error(`license-grace: ${action} failed for ${l.license_number}`, err);
      failed.push(`${action} failed for ${l.license_number} (${l.county}) on ${l.stripe_subscription_id} — do it by hand`);
      continue;
    }

    if (action === 'clear') {
      done.push(`cleared a stale pause marker on ${l.license_number} (${l.county})`);
      continue;
    }

    done.push(`${action} ${l.license_number} (${l.county})`);
    await tellInspector(db, l, action, pause === 'ours', done);
  }

  // A release here did not go through the webhook, so nothing else rebuilds it.
  if (released) await rebuild();

  if (done.length > 0 || failed.length > 0 || notReached > 0) {
    const parts: string[] = [];
    if (done.length > 0) parts.push(done.join('\n'));
    if (failed.length > 0) parts.push(`NEEDS A PERSON:\n${failed.join('\n')}`);
    if (notReached > 0) parts.push(`${notReached} row(s) were not reached before the time limit and are first in line tomorrow.`);
    parts.push(
      'pause = dropped out of the DBPR extract, billing stopped, spot held.\n' +
      `warn = ${GRACE_WARN_DAYS} days gone, ${GRACE_DAYS - GRACE_WARN_DAYS} days left before the spot is released.\n` +
      `cancel = ${GRACE_DAYS} days gone, spot now free to sell.\n` +
      'released = Stripe says the subscription is over and the row still said featured.');
    await notifyOps(`License grace: ${done.length} change(s)${failed.length > 0 ? `, ${failed.length} needing a person` : ''}`,
      parts.join('\n\n'));
  }
  return new Response(`read ${rows.length}, changed ${done.length}, failed ${failed.length}, not reached ${notReached}`, { status: 200 });
};

/** Mails the inspector and records what happened, or why it could not. */
async function tellInspector(
  db: ReturnType<typeof admin>,
  l: GraceInput,
  action: 'pause' | 'resume' | 'cancel' | 'warn',
  wasPaused: boolean,
  done: string[],
): Promise<void> {
  if (!l.claimed_by) { done.push(`  (${l.license_number}: no claimant on file, nobody to tell)`); return; }
  const { data: user, error: userError } = await db.auth.admin.getUserById(l.claimed_by);
  if (userError) { done.push(`  (${l.license_number}: COULD NOT LOOK UP the claimant — ${userError.message} — tell them by hand)`); return; }
  const to = user?.user?.email;
  if (!to) { done.push(`  (${l.license_number}: claimant account has no email address)`); return; }
  const { subject, text } = inspectorEmail(action, l.licensee_name.split(' ')[0] || 'there', wasPaused);
  try {
    await mail(to, subject, text);
    done.push(`  (${l.license_number}: emailed ${to})`);
  } catch (err) {
    console.error(`license-grace: could not mail ${l.license_number}`, err);
    done.push(`  (${l.license_number}: COULD NOT EMAIL ${to} — tell them by hand)`);
  }
}

// DELIBERATELY NOT SCHEDULED, 2026-09-14. Everything below is written, typed,
// tested and deployed, and it cannot run: without a `schedule` Netlify never
// invokes it, and a scheduled function has no public URL, so nothing else can
// either. This is a pause on the automation, not on the code.
//
// Why: six review rounds found real defects here and the last two found them in
// the *fixes*, not the original — which says this is too much machinery for a
// feature currently governing one subscription. It stops billing, restarts
// billing and cancels subscriptions with nobody watching, so it does not get to
// run on trust. The county gate, the webhook fixes and the page work shipped
// with it and are live; only this is held.
//
// To turn it on, restore the line below and nothing else. 15:00 UTC is
// deliberate: at 00:00 the job ran before the monthly DBPR import at 13:00 on
// the 1st, which is the only thing that can clear delisted_at, so a cancel and
// the import that would have rescued that inspector landed on the same morning
// in the wrong order.
//
//   export const config: Config = { schedule: '0 15 * * *' };
export const config: Config = {};
