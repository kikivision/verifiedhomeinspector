#!/usr/bin/env node
/**
 * The channel labels, checked case by case.
 *
 * labelFor decides whether a phone call is credited to the ad budget, so a
 * mistake here does not show up as a bug — it shows up as a wrong number in
 * a decision about whether to keep spending. Cheap to pin down; expensive to
 * discover later.
 *
 * Usage:  node scripts/attribution-labels.test.mjs
 */
import { labelFor } from '../src/lib/attribution.ts';

const HOST = 'verifiedhomeinspector.com';
const cases = [
  // Paid. gclid is what Google adds by itself, so it has to win on its own.
  ['?gclid=Cj0ABC', '', 'google_ads'],
  ['?gbraid=ABC', '', 'google_ads'],
  ['?utm_source=google&utm_medium=cpc&utm_campaign=stpete', '', 'google_ads'],
  ['?utm_medium=cpc', '', 'google_ads'],
  ['?utm_source=facebook&utm_medium=paid', '', 'paid_facebook'],
  // Tagged but not paid.
  ['?utm_source=newsletter&utm_medium=email', '', 'utm:newsletter/email'],
  // Earned.
  ['', 'https://www.google.com/', 'organic_google'],
  ['', 'https://www.bing.com/search?q=x', 'organic_bing'],
  ['', 'https://chatgpt.com/', 'ai_chatgpt'],
  ['', 'https://example.com/blog', 'referral:example.com'],
  ['', '', 'direct'],
  // Our own pages are not a source, and a broken referrer is not a crash.
  ['', `https://${HOST}/fl/pinellas/`, 'internal'],
  ['', 'not a url', 'direct'],
  // A campaign name with punctuation must not smuggle characters into a label.
  ['?utm_source=Part%20ner%21&utm_medium=Social', '', 'utm:partner/social'],
];

let failed = 0;
for (const [search, referrer, want] of cases) {
  const got = labelFor(search, referrer, HOST);
  const ok = got === want;
  if (!ok) failed += 1;
  const shown = (search || referrer || '(direct)').slice(0, 52);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${shown.padEnd(54)} -> ${got}${ok ? '' : `   want ${want}`}`);
}
console.log(failed === 0 ? `\n${cases.length} label cases pass` : `\n${failed} of ${cases.length} FAILED`);
process.exit(failed === 0 ? 0 : 1);
