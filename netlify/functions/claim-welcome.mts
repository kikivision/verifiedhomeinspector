// POST /.netlify/functions/claim-welcome
// Body: { listing_id }   Header: X-Claim-Welcome-Secret: <CLAIM_WELCOME_SECRET>
//
// Called by the send_claim_welcome_on_claim database trigger the moment an
// inspector claims their listing. Sends them one plain-text email that names
// what is still empty on their page and links to the dashboard, then stamps
// welcome_sent_at so a second delivery of the same trigger is a no-op.
//
// Not reachable from the dashboard: the only caller is the database, and it
// proves that with a shared secret. Nobody else needs to make an inspector's
// welcome email happen, and an open endpoint that emails people on request is
// a spam relay.
//
// Environment (Netlify → Site configuration → Environment variables):
//   CLAIM_WELCOME_SECRET       the same value pasted into the trigger function
//   RESEND_API_KEY             re_… for the verifiedhomeinspector.com domain
//   PUBLIC_SUPABASE_URL        already set for the build
//   SUPABASE_SERVICE_ROLE_KEY  reads auth.users for the claimant's address
import type { Context } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';
import { admin, json, siteUrl } from '../lib/featured.mts';
import {
  MUSTARD_DEEP, NAVY, P, SLATE, button, dataTable, esc, link, sendOwnerAlert, shell, statusPill, whenEastern,
} from '../lib/email.mts';
import { getCounty } from '../../src/lib/counties.ts';
import { inspectorPath } from '../../src/lib/slug.ts';

// Resend sends from the verified mail. subdomain; replies go to the real
// hello@ mailbox on Microsoft 365, whose MX and SPF this does not touch.
const FROM = 'Karen at Verified Home Inspector <hello@mail.verifiedhomeinspector.com>';
const REPLY_TO = 'hello@verifiedhomeinspector.com';
const FOOTER =
  'Verified Home Inspector · Sunstate Bay Ventures LLC\n' +
  'PO Box 66, Zelienople, PA 16063';

interface WelcomeListing {
  id: string;
  license_number: string;
  licensee_name: string;
  business_name: string | null;
  city: string;
  county: string;
  tier: string;
  claimed_by: string | null;
  welcome_sent_at: string | null;
  phone: string | null;
  website: string | null;
  specialties: string[] | null;
  years_experience: number | null;
  about: string | null;
  service_cities: string[] | null;
  logo_path: string | null;
}

function secretMatches(header: string | null): boolean {
  const expected = process.env.CLAIM_WELCOME_SECRET ?? '';
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "Damir Smajlovic" → "Damir". DBPR names are stored as typed on the license. */
function firstName(licenseeName: string): string {
  return licenseeName.trim().split(/\s+/)[0] || 'there';
}

/**
 * The five things a claimed page can carry beyond the phone number, in the
 * order a homeowner notices them missing. Mirrors the checklist on the
 * dashboard (src/pages/dashboard/index.astro) — keep the two in step.
 */
export function missingItems(l: WelcomeListing): string[] {
  const items: string[] = [];
  if (!(l.service_cities ?? []).length) {
    items.push(
      `Cities you serve — check every city you'll drive to. You'll show up on each of those city pages, not just ${l.city}.`,
    );
  }
  if (!(l.specialties ?? []).length) {
    items.push('Services — 4-point, wind mitigation, full inspections, whatever you offer. Insurance-driven searches look for these.');
  }
  if (l.years_experience === null) {
    items.push('Years in business — shows as "N+ years" on your card.');
  }
  if (!l.about) {
    items.push('About your business — a few sentences in your own words. This is what a homeowner reads before calling.');
  }
  if (!l.logo_path) {
    items.push(
      l.tier === 'featured'
        ? 'Logo — reply to this email with the file and I\'ll add it. On a featured card it\'s the first thing people see.'
        : 'Logo — reply to this email with the file and I\'ll add it to your card.',
    );
  }
  return items;
}

export function renderWelcome(l: WelcomeListing): { subject: string; text: string } {
  const name = firstName(l.licensee_name);
  const missing = missingItems(l);
  const contact = l.phone && l.website ? 'phone number and website' : l.phone ? 'phone number' : 'listing';
  const dashboard = `${siteUrl()}/dashboard/`;

  if (missing.length === 0) {
    return {
      subject: 'Your Verified Home Inspector page is claimed',
      text:
        `Hi ${name},\n\n` +
        `Your page is live, marked claimed, and filled in — thank you. Homeowners see your ${contact} and everything you added.\n\n` +
        `${dashboard}\n\n` +
        `Reply to this email if anything on it is wrong and I'll fix it the same day.\n\n` +
        `Karen at Verified Home Inspector\n\n${FOOTER}`,
    };
  }

  const count = missing.length === 1 ? 'one thing' : `${missing.length} things`;
  return {
    subject: `Your Verified Home Inspector page is claimed — ${count} to fill in`,
    text:
      `Hi ${name},\n\n` +
      `Your page is live and marked claimed. Homeowners already see your ${contact}. ` +
      `A few minutes on your dashboard makes it work a lot harder:\n\n` +
      missing.map((m) => `- ${m}`).join('\n') +
      `\n\n${dashboard}\n\n` +
      `Reply to this email if anything is wrong and I'll fix it the same day.\n\n` +
      `Karen at Verified Home Inspector\n\n${FOOTER}`,
  };
}

/** "Cities you serve — check every…" → "Cities you serve". The alert lists
 *  what is empty; the welcome is where the explanation belongs. */
function missingLabels(l: WelcomeListing): string[] {
  return missingItems(l).map((item) => item.split(' — ')[0]);
}

function notSet(): string {
  return `<span style="color: ${SLATE};">not set</span>`;
}

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * The notice to Karen: who claimed, how to reach them, what they left empty,
 * one button to their page. Reply-to is the claimant, so answering the
 * notice answers the inspector. Branded (netlify/lib/email.mts) where the
 * welcome is plain text on purpose; this one is read by us.
 */
export function renderClaimAlert(
  l: WelcomeListing,
  claimantEmail: string,
  welcomeOk: boolean,
): { subject: string; html: string; text: string } {
  const county = getCounty(l.county)?.name ?? l.county;
  const page = `${siteUrl()}${inspectorPath(l.county, l.city, l.license_number, l.licensee_name)}`;
  const missing = missingLabels(l);
  const when = whenEastern();
  const who = l.business_name ? `${l.licensee_name}, ${l.business_name}` : l.licensee_name;

  const html = shell(`
          ${welcomeOk ? statusPill('New claim', NAVY) : statusPill('Welcome email failed', MUSTARD_DEEP)}
          <p style="${P}"><strong>${esc(who)}</strong> just claimed their listing in ${esc(l.city)}.</p>
          ${dataTable([
            ['Inspector', esc(l.licensee_name)],
            ['Business', l.business_name ? esc(l.business_name) : notSet()],
            ['License', esc(l.license_number)],
            ['City', `${esc(l.city)}, ${esc(county)}`],
            ['Email', link(`mailto:${claimantEmail}`, claimantEmail)],
            ['Phone', l.phone ? esc(l.phone) : notSet()],
            ['Website', l.website ? link(withScheme(l.website), l.website) : notSet()],
            ['Still empty', missing.length ? esc(missing.join(', ')) : 'nothing, the page is complete'],
            ['Claimed', esc(when)],
          ])}
          ${button(page, 'View their page')}
          <p style="${P}">${
            welcomeOk
              ? 'The welcome email listing what is still empty went to them automatically. Nothing to do; reply to this email to reach them.'
              : 'The welcome email did NOT send. Send it by hand, or run the function again once Resend is back. Reply to this email to reach them.'
          }</p>`);

  const text =
    `${who} just claimed their listing in ${l.city}.\n\n` +
    `Inspector: ${l.licensee_name}\n` +
    `Business: ${l.business_name ?? 'not set'}\n` +
    `License: ${l.license_number}\n` +
    `City: ${l.city}, ${county}\n` +
    `Email: ${claimantEmail}\n` +
    `Phone: ${l.phone ?? 'not set'}\n` +
    `Website: ${l.website ?? 'not set'}\n` +
    `Still empty: ${missing.length ? missing.join(', ') : 'nothing, the page is complete'}\n` +
    `Claimed: ${when}\n\n` +
    `${page}\n\n` +
    (welcomeOk
      ? 'The welcome email went to them automatically. Nothing to do; reply to reach them.'
      : 'The welcome email did NOT send. Send it by hand.');

  return {
    subject: welcomeOk
      ? `New claim: ${l.licensee_name} (${l.city})`
      : `New claim, welcome FAILED: ${l.licensee_name} (${l.city})`,
    html,
    text,
  };
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Server is missing RESEND_API_KEY.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);
  if (!secretMatches(req.headers.get('x-claim-welcome-secret'))) {
    return json({ error: 'Not allowed.' }, 403);
  }

  const body = (await req.json().catch(() => ({}))) as { listing_id?: string };
  if (!body.listing_id) return json({ error: 'listing_id is required.' }, 400);

  const db = admin();
  const { data: listing, error } = await db
    .from('listings')
    .select(
      'id, license_number, licensee_name, business_name, city, county, tier, claimed_by, welcome_sent_at, ' +
        'phone, website, specialties, years_experience, about, service_cities, logo_path',
    )
    .eq('id', body.listing_id)
    .maybeSingle();
  if (error) {
    console.error('claim-welcome: listing lookup failed', error);
    return json({ error: 'Database error.' }, 500);
  }
  const l = listing as WelcomeListing | null;
  if (!l) return json({ error: 'No such listing.' }, 404);
  // pg_net delivers at least once; the stamp makes the second call harmless.
  if (l.welcome_sent_at) return json({ skipped: 'already sent' });
  if (!l.claimed_by) return json({ skipped: 'no claimant' });

  const { data: userData, error: userError } = await db.auth.admin.getUserById(l.claimed_by);
  const to = userData?.user?.email;
  if (userError || !to) {
    console.error(`claim-welcome: no email for claimant of ${l.license_number}`, userError);
    return json({ error: 'Claimant has no email.' }, 500);
  }

  const { subject, text } = renderWelcome(l);
  let welcomeOk = true;
  try {
    await sendEmail(to, subject, text);
  } catch (err) {
    // A 500 below is logged in Netlify; pg_net does not retry, so the alert
    // to Karen is the signal to send by hand. The claim itself is untouched.
    console.error(`claim-welcome: send failed for ${l.license_number}`, err);
    welcomeOk = false;
  }

  // Karen hears about every claim, whether or not the welcome went. Never
  // throws; a lost alert must not turn into a lost welcome or a 500.
  const alert = renderClaimAlert(l, to, welcomeOk);
  await sendOwnerAlert({ ...alert, replyTo: to });

  if (!welcomeOk) return json({ error: 'Send failed.' }, 500);

  const { error: stampError } = await db
    .from('listings')
    .update({ welcome_sent_at: new Date().toISOString() })
    .eq('id', l.id);
  if (stampError) console.error('claim-welcome: sent but could not stamp welcome_sent_at', stampError);

  console.info(`claim-welcome: sent to ${l.license_number} (${missingItems(l).length} items missing)`);
  return json({ sent: true });
};
