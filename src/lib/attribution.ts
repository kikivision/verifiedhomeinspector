// Where a visit came from, captured once and kept for the session.
//
// listing_events already records which listing was called and from which
// page. It did not record which channel paid for the visit, and with money
// going into Google Ads for St. Petersburg the useful sentence is not
// "Jason got 14 calls" but "11 of them came from the ads" — the first
// number tells an inspector his listing works, the second tells us whether
// the spend did.
//
// Captured at landing rather than read at click time. A visitor arrives on
// the ad's URL carrying gclid, clicks through to a city page and then to an
// inspector, and by the time they tap the phone number the campaign
// parameters left the address bar two navigations ago.
//
// sessionStorage, not localStorage: a visit is the unit being attributed. A
// homeowner who comes back from a bookmark next week is not another ad
// click, and should not be counted as one.

const KEY = 'vhi.source';
/** Long enough for "utm:some-partner/newsletter", short enough to stay a label. */
const MAX = 60;

/** Search engines whose referral is organic, not a channel we paid for. */
const SEARCH_HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)google\./, 'organic_google'],
  [/(^|\.)bing\./, 'organic_bing'],
  [/(^|\.)duckduckgo\./, 'organic_duckduckgo'],
  [/(^|\.)search\.yahoo\./, 'organic_yahoo'],
  [/(^|\.)ecosia\./, 'organic_ecosia'],
  [/(^|\.)brave\./, 'organic_brave'],
  [/(^|\.)perplexity\./, 'ai_perplexity'],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\./, 'ai_chatgpt'],
  [/(^|\.)copilot\.microsoft\./, 'ai_copilot'],
];

function clean(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.:/-]/g, '').slice(0, MAX);
}

/**
 * The label for this visit, worked out from the URL and the referrer.
 *
 * gclid first: Google Ads adds it by auto-tagging even when the destination
 * URL carries no utm_ parameters, so it is the one marker that cannot be
 * lost to a mistyped campaign template.
 *
 * Exported for the sake of scripts/attribution-labels.test.mjs. This is the
 * function that decides whether a phone call is credited to the ad budget,
 * which makes it the one piece here worth being able to test directly.
 */
export function labelFor(search: string, referrer: string, host: string): string {
  const params = new URLSearchParams(search);
  if (params.get('gclid') || params.get('gbraid') || params.get('wbraid')) return 'google_ads';

  const medium = clean(params.get('utm_medium') ?? '');
  const source = clean(params.get('utm_source') ?? '');
  if (source || medium) {
    const paid = ['cpc', 'ppc', 'paid', 'paidsearch', 'paid_search'].includes(medium);
    if (paid && (source === 'google' || source === '')) return 'google_ads';
    if (paid) return clean(`paid_${source}`);
    return clean(`utm:${source || 'unknown'}/${medium || 'unknown'}`);
  }

  if (!referrer) return 'direct';
  let refHost: string;
  try {
    refHost = new URL(referrer).hostname.toLowerCase();
  } catch {
    return 'direct';
  }
  // Our own pages are not a source; the landing page that started the visit is.
  if (refHost === host || refHost === `www.${host}` || `www.${refHost}` === host) return 'internal';
  for (const [pattern, label] of SEARCH_HOSTS) if (pattern.test(refHost)) return label;
  return clean(`referral:${refHost}`);
}

/**
 * Records the source of this visit if it has not been recorded already.
 * Called from the layout, so it runs on whatever page the visitor lands on
 * — the homepage and the two form success pages included, not only the
 * pages that render listings.
 *
 * First write wins: the landing page is what the ad paid for, and a later
 * page in the same visit would otherwise overwrite it with 'internal'.
 */
export function captureSource(): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = window.sessionStorage.getItem(KEY);
    const label = labelFor(window.location.search, document.referrer, window.location.hostname);
    // An ad click that lands mid-session still counts: someone who arrived
    // organically, left, and came back through the ad was brought back by it.
    if (existing && label !== 'google_ads' && !label.startsWith('paid_')) return;
    if (label === 'internal' && existing) return;
    window.sessionStorage.setItem(KEY, label);
  } catch {
    // Private browsing, or storage disabled. The click still logs, with no
    // source — better than losing the click to an exception.
  }
}

/** The stored label, or 'unknown' when nothing was captured. */
export function visitSource(): string {
  if (typeof window === 'undefined') return 'unknown';
  try {
    return window.sessionStorage.getItem(KEY) || 'unknown';
  } catch {
    return 'unknown';
  }
}
