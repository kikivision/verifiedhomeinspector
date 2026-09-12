// Google Analytics 4 loading and event helpers.
//
// Two guards, both deliberate:
//
// 1. No measurement ID, no GA. The ID comes from PUBLIC_GA_MEASUREMENT_ID, so
//    a checkout without it simply runs without analytics rather than breaking.
// 2. Live hostnames only. The dev server and every Netlify deploy preview read
//    the same environment, so without this each local click would land in the
//    same GA property as real traffic. That already happened once today with
//    listing_events, and GA is worse: those rows cannot be deleted afterwards.

const MEASUREMENT_ID = import.meta.env.PUBLIC_GA_MEASUREMENT_ID as string | undefined;

const PRODUCTION_HOSTS = new Set([
  'verifiedhomeinspector.com',
  'www.verifiedhomeinspector.com',
]);

declare global {
  interface Window {
    dataLayer: unknown[];
    // Optional, because it is: nothing defines it until initAnalytics runs,
    // and the guard on the first line of initAnalytics reads it to find out.
    gtag?: (...args: unknown[]) => void;
  }
}

export function isAnalyticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (!MEASUREMENT_ID) return false;
  return PRODUCTION_HOSTS.has(window.location.hostname);
}

/** Injects gtag.js. Safe to call more than once; later calls are ignored. */
export function initAnalytics(): void {
  if (!isAnalyticsEnabled() || window.gtag) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag requires the raw `arguments` object, not a rest array — it reads
    // the arguments by position and a spread copy is not equivalent here.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID);

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

/**
 * Sends a GA4 event. Mirrors logListingEvent's contract: analytics must never
 * break the action being measured, so a failure here is swallowed and the
 * click proceeds.
 */
export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  if (!isAnalyticsEnabled()) {
    console.info(`[ga4] skipped ${name} — analytics not enabled on ${location.hostname}`);
    return;
  }

  // Astro bundles each page's script separately from the layout's, and does not
  // guarantee which runs first. A page that fires an event on load could
  // therefore run before the layout had initialized gtag, and the event was
  // lost to the catch below. initAnalytics returns immediately if it has
  // already run, so calling it here makes trackEvent work whatever the order.
  initAnalytics();

  try {
    window.gtag?.('event', name, params);
  } catch (err) {
    console.error('Failed to send GA4 event:', err);
  }
}
