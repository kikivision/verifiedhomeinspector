// Branded chrome for the emails that go to Karen when something happens on
// the site: a claim, a Featured purchase. Same shape as the SuperReports
// operator alerts (superreports-app/supabase/functions/_shared/email.ts), so
// the two products' notices read as siblings in the same inbox: a status pill
// that says whether anything is needed, a key/value table that can be scanned
// on a phone, one button to the thing itself.
//
// Table-based with inline styles on purpose: Outlook ignores <style> blocks,
// flexbox and grid. Palette is the site's (src/styles/global.css): navy
// #1D2B3A, mustard #E8A93A, paper #F5F3EC. The wordmark is live text next to
// a small image, so the header still reads as Verified Home Inspector with
// images off, which is how Gmail on a phone often shows a first email from a
// new sender.
//
// NOT used for the outreach sequence or the claim welcome, deliberately. Those
// go to inspectors as plain text from a person; polish there reads as a
// campaign. This is for mail whose only reader is us.
import { siteUrl } from './featured.mts';

export const NAVY = '#1D2B3A';
export const MUSTARD = '#E8A93A';
export const MUSTARD_DEEP = '#C6871E';
export const GREEN = '#4C6E4F';
export const PAPER = '#F5F3EC';
export const INK = '#24272B';
export const SLATE = '#5B6B75';
export const LINE = '#DAD5C6';

export const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const SERIF = "Georgia, 'Times New Roman', serif";
export const P = `margin: 0 0 16px 0; font-family: ${FONT}; font-size: 16px; line-height: 1.6; color: ${INK};`;

export const FOOTER_OPS =
  'Automated notice from Verified Home Inspector. Reply to reach the inspector named above.';

/** Where the alerts go. Env-overridable so a second reader can be added
 *  without a deploy of code. */
export const OWNER_ALERT_TO = process.env.OWNER_ALERT_TO ?? 'kikidailey@gmail.com';

/** Resend sends from the verified mail. subdomain; the real hello@ mailbox is
 *  untouched. Same sender notifyOps uses. */
const FROM = 'Verified Home Inspector <hello@mail.verifiedhomeinspector.com>';

/**
 * Every interpolation of a name, email, city or anything else typed by an
 * inspector MUST go through this. Business names and "about" text are
 * user-supplied and land in an HTML context.
 */
export function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A time the way Karen reads it, not UTC. */
export function whenEastern(d: Date = new Date()): string {
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function link(href: string, label?: string): string {
  return `<a href="${esc(href)}" style="color: ${MUSTARD_DEEP}; text-decoration: underline;">${esc(label ?? href)}</a>`;
}

/** The first thing that matters on a phone: does this need anything from me. */
export function statusPill(text: string, color: string): string {
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 18px 0;">
        <tr><td bgcolor="${color}" style="border-radius: 4px; padding: 7px 13px; font-family: ${FONT}; font-size: 12px; font-weight: 700; color: #FFFFFF; letter-spacing: 0.6px; text-transform: uppercase;">${esc(text)}</td></tr>
      </table>`;
}

/** Rows are [label, html]. The value is HTML so a cell can hold a link;
 *  callers escape anything user-supplied with esc() before it gets here. */
export function dataTable(rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([k, v]) => `
        <tr>
          <td style="padding: 9px 14px 9px 0; border-bottom: 1px solid ${LINE}; font-family: ${FONT}; font-size: 14px; line-height: 1.4; color: ${SLATE}; vertical-align: top; white-space: nowrap;">${esc(k)}</td>
          <td style="padding: 9px 0; border-bottom: 1px solid ${LINE}; font-family: ${FONT}; font-size: 14px; line-height: 1.4; color: ${INK}; vertical-align: top;">${v}</td>
        </tr>`,
    )
    .join('');
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin: 0 0 20px 0;">${body}
      </table>`;
}

export function button(href: string, label: string): string {
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 4px 0 20px 0;">
        <tr><td align="center" bgcolor="${MUSTARD}" style="border-radius: 4px;">
          <a href="${esc(href)}" style="display: inline-block; padding: 14px 28px; font-family: ${FONT}; font-size: 16px; font-weight: 600; color: ${NAVY}; text-decoration: none;">${esc(label)}</a>
        </td></tr>
      </table>`;
}

/**
 * The card. A mustard rule on top, the wordmark, the content, a quiet footer.
 * The image is the site's square avatar served from the site origin; if it is
 * blocked the live-text wordmark beside it still names the sender.
 */
export function shell(inner: string, footer = FOOTER_OPS): string {
  const site = siteUrl();
  return `<!doctype html>
<html><body style="margin: 0; padding: 0; background-color: ${PAPER};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${PAPER}; padding: 24px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width: 100%; max-width: 560px; background-color: #FFFFFF; border-radius: 10px;">
        <tr><td style="height: 4px; line-height: 4px; font-size: 0; background-color: ${MUSTARD}; border-radius: 10px 10px 0 0;">&nbsp;</td></tr>
        <tr><td style="padding: 28px 32px 4px 32px;">
          <a href="${site}/" style="text-decoration: none;">
            <img src="${site}/brand/avatar-1024.png" width="32" height="32" alt="" style="border: 0; border-radius: 6px; vertical-align: middle;">
            <span style="font-family: ${SERIF}; font-size: 21px; font-weight: 600; color: ${NAVY}; vertical-align: middle; padding-left: 10px;">Verified</span><span style="font-family: ${SERIF}; font-size: 21px; font-weight: 600; font-style: italic; color: ${MUSTARD}; vertical-align: middle;">&nbsp;Home Inspector</span>
          </a>
        </td></tr>
        <tr><td style="padding: 16px 32px 28px 32px;">${inner}
        </td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width: 100%; max-width: 560px;">
        <tr><td style="padding: 16px 32px; text-align: center; font-family: ${FONT}; font-size: 13px; line-height: 1.5; color: ${SLATE};">
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Mail Karen. Never throws and never takes long: both callers are inside a
 * webhook or a database-triggered function, where a hung or failed alert must
 * not fail the thing it is reporting (the claim is already saved; Stripe would
 * redeliver and repeat the alert). Returns whether Resend accepted it.
 */
export async function sendOwnerAlert(mail: {
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY is not set; owner alert not sent:', mail.subject);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [OWNER_ALERT_TO],
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });
    if (!res.ok) {
      console.error('owner alert failed', res.status, await res.text(), mail.subject);
      return false;
    }
    return true;
  } catch (err) {
    console.error('owner alert threw', err, mail.subject);
    return false;
  }
}
