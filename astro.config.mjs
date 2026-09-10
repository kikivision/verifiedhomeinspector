// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { counties } from './src/lib/counties';

// www 301s to the apex, so the apex is the canonical host. A sitemap that
// listed www URLs would hand Google a list of redirects.
const SITE = 'https://verifiedhomeinspector.com';

const comingSoon = new Set(
  counties.filter((c) => c.status !== 'live').map((c) => `/fl/${c.slug}/`)
);

// Pages that exist but should not be in search results:
//   - the two form confirmation pages, which only make sense after a submit
//   - counties with no data yet, whose page is one "coming soon" paragraph
// Adding a county to counties.ts as 'live' puts it in the sitemap; nothing
// here needs to change.
function shouldIndex(url) {
  const path = new URL(url).pathname;
  if (path === '/claim-received/' || path === '/request-received/') return false;
  if (comingSoon.has(path)) return false;
  return true;
}

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // Netlify serves /fl/pinellas as a 301 to /fl/pinellas/. Astro's default
  // ('ignore') would emit the un-slashed form, so every URL in the sitemap
  // would be a redirect, and so would the site's own internal links.
  trailingSlash: 'always',
  redirects: {
    '/': '/fl/pinellas/',
  },
  integrations: [sitemap({ filter: shouldIndex })],
});
