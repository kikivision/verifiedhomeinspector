#!/usr/bin/env node
/**
 * Checks the built site for the mistakes that have actually been shipped here,
 * rather than for style. Every assertion below exists because the thing it
 * checks was broken at some point and reached production unnoticed.
 *
 * The common shape of those bugs: the source looked correct and the output was
 * wrong. A prop passed to a component that never read it, a script that ran
 * before the thing it depended on, a comment inside a loop. None of them are
 * visible by reading the diff, and all of them are obvious in the built HTML.
 * So this reads the built HTML.
 *
 * Usage:
 *   npm run build && node scripts/smoke-test.mjs
 *
 * Exits non-zero on failure, so CI fails the pull request rather than letting
 * the regression reach the site.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

// dist paths as the site would serve them: forward slashes on every platform.
// path.relative returns backslashes on Windows, and every check that compared
// a built path to a URL failed there while passing in CI.
function pagePath(file) {
  return '/' + relative(DIST, file).split(sep).join('/').replace(/index\.html$/, '');
}

const DIST = 'dist';

// Page weight is a proxy for a whole class of accident. A duplicated comment
// inside a 317-row loop once made half the page repeated text; nothing failed,
// it just quietly doubled what every visitor downloaded.
const MAX_PAGE_KB = 400;
const MAX_META_DESCRIPTION = 160;

const failures = [];
const notes = [];

function check(condition, message, detail) {
  if (!condition) failures.push(detail ? `${message}\n      ${detail}` : message);
}

async function htmlFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await htmlFiles(path)));
    else if (entry.name.endsWith('.html')) found.push(path);
  }
  return found;
}

const pages = await htmlFiles(DIST);
// Several later checks need every page's HTML, so it is read once here rather
// than re-read per assertion.
const faqHtml = new Map();
for (const p of pages) faqHtml.set(p, await readFile(p, 'utf8'));
check(pages.length > 0, 'No HTML was built at all.');

for (const path of pages) {
  const html = await readFile(path, 'utf8');
  const page = pagePath(path);
  const { size } = await stat(path);

  // A redirect stub has no head worth checking.
  const isRedirectStub = /<meta http-equiv="refresh"/i.test(html) && html.length < 2000;
  if (isRedirectStub) {
    // The root was a stub for exactly as long as nobody noticed, because this
    // check skipped it: Astro's `redirects` emits a meta-refresh page carrying
    // <meta name="robots" content="noindex">, so the domain itself could not be
    // indexed and no assertion below ever ran against it. Every other page may
    // legitimately be a stub; the homepage may not.
    check(page !== '/', 'The homepage is a redirect stub.',
      'Astro emits these with noindex, so the domain cannot rank at all.');
    notes.push(`${page} is a redirect stub, skipped`);
    continue;
  }

  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  check(description !== undefined, `${page}: no meta description.`,
    'Layout takes a `description` prop; a page that omits it ships without the tag.');
  if (description !== undefined) {
    check(description.trim().length > 0, `${page}: meta description is empty.`);
    check(
      description.length <= MAX_META_DESCRIPTION,
      `${page}: meta description is ${description.length} characters.`,
      `Google truncates around ${MAX_META_DESCRIPTION}.`,
    );
  }

  // The share preview is invisible from the page itself: nothing looks wrong
  // in a browser when these are missing, and the first time you find out is
  // when a link you sent someone renders as a bare URL. og:image must be
  // absolute — a crawler has no page to resolve a relative path against — and
  // must point at a file that actually shipped, which is the half a tag check
  // alone would miss.
  for (const [tag, pattern] of [
    ['og:title', /<meta property="og:title" content="([^"]*)"/],
    ['og:image', /<meta property="og:image" content="([^"]*)"/],
    ['og:url', /<meta property="og:url" content="([^"]*)"/],
    ['twitter:card', /<meta name="twitter:card" content="([^"]*)"/],
  ]) {
    const value = html.match(pattern)?.[1];
    check(value !== undefined && value.trim().length > 0, `${page}: no ${tag}.`,
      'A shared link previews as a bare URL without it.');
    if (value && (tag === 'og:image' || tag === 'og:url')) {
      check(value.startsWith('https://'), `${page}: ${tag} is not absolute ("${value}").`,
        'Crawlers cannot resolve a relative URL.');
    }
  }

  const ogImage = html.match(/<meta property="og:image" content="([^"]*)"/)?.[1];
  if (ogImage) {
    const file = join(DIST, new URL(ogImage).pathname);
    let bytes = 0;
    try {
      bytes = (await stat(file)).size;
    } catch {
      failures.push(`${page}: og:image points at ${ogImage}, which was not built.`);
    }
    // Both limits are real: iMessage and WhatsApp give up on a slow fetch and
    // fall back to a bare link, and an empty file would still pass a tag check.
    if (bytes) {
      check(bytes > 1024, `og:image is only ${bytes} bytes.`, 'Almost certainly not a real image.');
      check(bytes <= 5 * 1024 * 1024, `og:image is ${Math.round(bytes / 1024)}KB.`,
        'Some scrapers skip images over about 5MB.');
    }
  }

  const h1s = html.match(/<h1[\s>]/g) ?? [];
  check(h1s.length === 1, `${page}: found ${h1s.length} <h1> elements, expected exactly 1.`);

  const kb = Math.round(size / 1024);
  check(kb <= MAX_PAGE_KB, `${page}: ${kb}KB exceeds the ${MAX_PAGE_KB}KB budget.`,
    'Check for content repeated inside a loop before raising this.');

  // A comment written inside a .map() is emitted once per item. That is how a
  // single paragraph became 123KB of a 253KB page.
  const comments = html.match(/<!--[\s\S]*?-->/g) ?? [];
  const seen = new Map();
  for (const comment of comments) seen.set(comment, (seen.get(comment) ?? 0) + 1);
  for (const [comment, count] of seen) {
    if (count > 1) {
      failures.push(
        `${page}: an HTML comment is repeated ${count} times.\n` +
          `      Almost certainly written inside a loop: ${comment.slice(0, 60).replace(/\s+/g, ' ')}…`,
      );
    }
  }
}

// The county page carries everything that earns money, so it gets checked in
// detail rather than as one of a set.
const countyPath = join(DIST, 'fl', 'pinellas', 'index.html');
const county = await readFile(countyPath, 'utf8');

const listingRows = (county.match(/class="list-row"/g) ?? []).length;
check(listingRows > 0, 'Pinellas page renders no listings.',
  'A failed Supabase read returns an empty array and still builds a valid page.');

const featuredSlots = (county.match(/card ad-slot/g) ?? []).length;
const claimedFeatured = (county.match(/class="card featured"/g) ?? []).length;
const capMatch = (await readFile('src/pages/fl/[county]/index.astro', 'utf8'))
  .match(/const FEATURED_CAP = (\d+)/);
const cap = capMatch ? Number(capMatch[1]) : null;
check(cap !== null, 'Could not read FEATURED_CAP from the county page.');
if (cap !== null) {
  check(
    featuredSlots + claimedFeatured === cap,
    `Pinellas page shows ${featuredSlots + claimedFeatured} featured positions, but FEATURED_CAP is ${cap}.`,
  );
}

// The forms are the site's conversion paths, and Netlify only registers a
// form it can find in the built HTML. A missing hidden field means the
// submission arrives with no idea who it was for.
//
// Each form is checked on the page that carries it. claim-listing moved from
// the county page to the dashboard when claims became self-serve: the
// dashboard posts to it from script after claim_listing succeeds, and if the
// form is not in the built HTML that post is silently dropped by Netlify.
const dashboard = await readFile(join(DIST, 'dashboard', 'index.html'), 'utf8').catch(() => null);
const forInspectors = await readFile(join(DIST, 'for-inspectors', 'index.html'), 'utf8').catch(() => null);
check(dashboard !== null, 'The dashboard page was not built.');
check(forInspectors !== null, 'The for-inspectors page was not built.');
const forms = [
  ['/fl/pinellas/', county, 'featured-inquiry',
    ['form-name', 'county', 'plan', 'license-number', 'licensee-name', 'email']],
  ['/fl/pinellas/', county, 'inspector-request',
    ['form-name', 'county', 'inspector-license', 'inspector-name', 'homeowner-name', 'homeowner-email']],
  ['/dashboard/', dashboard, 'claim-listing',
    ['form-name', 'county', 'license-number', 'licensee-name', 'email', 'plan']],
  ['/dashboard/', dashboard, 'featured-inquiry',
    ['form-name', 'county', 'plan', 'license-number', 'licensee-name', 'email']],
  ['/for-inspectors/', forInspectors, 'inspector-question',
    ['form-name', 'name', 'email', 'message']],
];
for (const [page, html, name, fields] of forms) {
  if (html === null) continue;
  const present = new RegExp(`<form[^>]*name=['"]${name}['"]`).test(html);
  check(present, `Form "${name}" is missing from ${page}.`,
    'Netlify reads forms out of the HTML at deploy time; if it is not here it does not exist.');
  if (!present) continue;
  for (const field of fields) {
    check(
      new RegExp(`name=['"]${field}['"]`).test(html),
      `Form "${name}" on ${page} is missing the field "${field}".`,
    );
  }
}

// The dashboard is one person's private form. It carries noindex and is kept
// out of the sitemap; both are checked because they are set in different files
// and the first time they disagreed nobody would have noticed.
if (dashboard !== null) {
  check(/<meta name="robots" content="noindex"/.test(dashboard),
    '/dashboard/ has no noindex tag.');
  const sitemap = await readFile(join(DIST, 'sitemap-0.xml'), 'utf8').catch(() => '');
  check(!sitemap.includes('/dashboard/'), '/dashboard/ is in the sitemap.');
}

// The "free until five requests, then $10 a month" offer was retired on
// 2026-09-12 and every page that carried it was rewritten. It appeared in six
// places, so a stale copy is likely to survive somewhere it should not.
for (const [path, html] of faqHtml) {
  const page = pagePath(path);
  check(!/\$10/.test(html), `${page} still quotes $10.`,
    'A claimed listing is free; the $10/month tier no longer exists.');
  check(!/five (homeowner )?requests/i.test(html), `${page} still mentions the five-requests offer.`);
}

// A claimed listing exists to show contact details. The Pinellas page has at
// least one claimed row or card (RMC), so if no tel: link is anywhere on it,
// contact rendering is broken rather than merely empty.
check(/href="tel:/.test(county), 'No tel: link on the Pinellas page.',
  'Claimed and featured listings render their phone number as a tel: link.');

// The FAQ answers questions people type into search engines, and the schema is
// what answer engines read. The two render from one array and must not drift.
//
// It lives on exactly one URL. Building it per county put five copies of the
// same eight questions in the build — four counties plus the homepage — and
// identical FAQPage schema on five URLs makes them compete with each other for
// the same query instead of one of them winning it.
const faqPages = pages.filter((p) => {
  const html = faqHtml.get(p);
  return html && html.includes('"@type":"FAQPage"');
});
check(faqPages.length === 1,
  `${faqPages.length} pages carry FAQPage schema; exactly one should.`,
  faqPages.map((p) => pagePath(p)).join(', '));

const insurance = await readFile(join(DIST, 'insurance-inspections/index.html'), 'utf8')
  .catch(() => null);
check(insurance !== null, 'The insurance page was not built.');

if (insurance) {
  const schemaJson = insurance.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )?.[1];
  check(schemaJson !== undefined, 'No FAQPage JSON-LD on the insurance page.');
  if (schemaJson) {
    let schema = null;
    try {
      schema = JSON.parse(schemaJson);
    } catch (err) {
      failures.push(`FAQPage JSON-LD does not parse: ${err.message}`);
    }
    if (schema) {
      const sourceCount = ((await readFile('src/lib/faq.ts', 'utf8')).match(/^\s{2}\{$/gm) ?? []).length;
      const schemaCount = schema.mainEntity?.length ?? 0;
      check(schemaCount === sourceCount,
        `FAQ schema has ${schemaCount} entries but faq.ts defines ${sourceCount}.`);
      const rendered = (insurance.match(/class="faq-item"/g) ?? []).length;
      check(rendered === schemaCount,
        `FAQ accordion renders ${rendered} items but the schema has ${schemaCount}.`);

      // The schema carries answers as plain text for answer engines. A citation
      // rendered into the answer string rather than beside it would put markup
      // in the structured data, where it is meaningless.
      const withMarkup = schema.mainEntity.filter((q) => /<[a-z/]/i.test(q.acceptedAnswer?.text ?? ''));
      check(withMarkup.length === 0,
        `${withMarkup.length} FAQ schema answer(s) contain HTML.`);

      // Every source link must reach a statute, a regulator, or the licensing
      // authority. The whole point of the pass that added them was to stop
      // citing insurance blogs, and nothing enforces that but this.
      const allowed = ['flsenate.gov', 'floir.gov', 'www.myfloridalicense.com'];
      const faqLinks = [...insurance.matchAll(/class="faq-sources"[\s\S]*?<\/p>/g)]
        .flatMap((m) => [...m[0].matchAll(/href="(https?:\/\/[^"]+)"/g)].map((h) => h[1]));
      check(faqLinks.length > 0, 'No FAQ answer carries a source link.');

      // A citation that replaces the page the reader was on costs a lead to
      // prove a point. They open in a new tab, and nothing else enforces it.
      const citations = [...insurance.matchAll(/<a [^>]*href="https:\/\/(?:flsenate|floir|www\.myfloridalicense)[^"]*"[^>]*>/g)];
      const sameTab = citations.filter((m) => !m[0].includes('target="_blank"'));
      check(sameTab.length === 0,
        `${sameTab.length} citation link(s) would navigate away from the page.`);
      for (const url of faqLinks) {
        const host = new URL(url).host;
        check(allowed.includes(host),
          `FAQ cites ${host}, which is not a statute, a regulator, or DBPR.`);
      }
    }
  }

  // An article that does not lead back to an inspector is a dead end on a
  // directory, and a statewide page cannot guess the reader's county, so it
  // has to offer every live one.
  const liveSlugs = [...(await readFile('src/lib/counties.ts', 'utf8'))
    .matchAll(/slug: '([^']+)'[^}]*status: 'live'/g)].map((m) => m[1]);
  check(liveSlugs.length > 0, 'No live counties found in counties.ts.');
  const picker = insurance.match(/<select id="inspectorCountySelect">([\s\S]*?)<\/select>/)?.[1];
  check(picker !== undefined, 'The insurance page has no county picker.');
  if (picker) {
    for (const slug of liveSlugs) {
      check(picker.includes(`value="${slug}"`),
        `The county picker has no option for ${slug}.`);
    }
    // A picker that navigates nowhere looks identical to one that works.
    //
    // Astro inlines a small script into the HTML and emits a larger one as a
    // module in _astro, and which it does depends on the size of the script
    // rather than on anything in this repo. Looking in only one of the two
    // places is a test that passes or fails for reasons unrelated to the code,
    // so this reads the page and everything the page loads.
    let behavior = insurance;
    for (const [, src] of insurance.matchAll(/<script[^>]+src="(\/_astro\/[^"]+)"/g)) {
      behavior += await readFile(join(DIST, src.slice(1)), 'utf8').catch(() => '');
    }
    check(behavior.includes('inspectorCountySelect'),
      'Nothing the insurance page loads references the county picker.');
    check(behavior.includes('#all-inspectors'),
      'The county picker does not navigate to #all-inspectors.');
  }
}

// Every page that dropped the FAQ has to offer the page that now holds it, or
// the only route to it is the header nav.
for (const path of pages) {
  const html = faqHtml.get(path);
  if (!html) continue;
  const page = pagePath(path);
  if (page === '/insurance-inspections/' || !/^\/(fl\/[a-z-]+\/)?$/.test(page)) continue;
  check(html.includes('href="/insurance-inspections/"'),
    `${page} does not link to /insurance-inspections/.`);
}

// A page that calls trackEvent without gtag loaded throws into a catch and the
// event is lost silently, which is how the completion events never fired.
const gtagChunk = (await readdir(join(DIST, '_astro')))
  .find((f) => f.startsWith('gtag.') && f.endsWith('.js'));
check(gtagChunk !== undefined, 'No gtag chunk was built.');
if (gtagChunk) {
  const chunk = await readFile(join(DIST, '_astro', gtagChunk), 'utf8');
  const initFn = chunk.match(/function (\w+)\(\)\{if\(!\w+\(\)\|\|window\.gtag\)return/)?.[1];
  const trackBody = chunk.match(/function \w+\([^)]*\)\{if\(!\w+\(\)\)\{console\.info\(`\[ga4\][\s\S]*?\}\}/)?.[0];
  check(initFn !== undefined && trackBody !== undefined,
    'Could not find the gtag init and track functions to check their relationship.');
  if (initFn && trackBody) {
    check(trackBody.includes(`${initFn}()`),
      'trackEvent does not call the init function before sending.',
      'Astro does not guarantee script order, so an event fired on page load can run first and be lost.');
  }
}

// A favicon fails silently in exactly two ways, and the site had both: the
// files were Astro's default logo, and no <link rel="icon"> existed, so the
// browser was finding /favicon.ico by convention alone. Neither shows up
// anywhere except in the tab, which nobody looks at while building a page.
const icons = ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'];
for (const icon of icons) {
  const buf = await readFile(join(DIST, icon)).catch(() => null);
  check(buf !== null, `${icon} was not built.`);
  if (buf) check(buf.length > 200, `${icon} is only ${buf.length} bytes, which is not an icon.`);
}

// An SVG that is not well-formed XML renders as nothing at all, and Astro
// copies public/ verbatim without parsing it, so the build cannot fail on it.
// This happened: a comment in favicon.svg contained the token name "--navy",
// and a double hyphen is illegal inside an XML comment. The file was the
// right size and completely blank in a browser.
const svgIcon = await readFile(join(DIST, 'favicon.svg'), 'utf8').catch(() => null);
if (svgIcon) {
  for (const [, body] of svgIcon.matchAll(/<!--([\s\S]*?)-->/g)) {
    check(!body.includes('--'),
      'favicon.svg has a double hyphen inside an XML comment, which makes it unparseable.',
      `In: ${body.trim().slice(0, 60)}...`);
  }
  check(/^\s*<svg[\s>]/.test(svgIcon) && /<\/svg>\s*$/.test(svgIcon.trim()),
    'favicon.svg is not a well-formed SVG document.');
  check(svgIcon.includes('<path') && svgIcon.includes('<rect'),
    'favicon.svg no longer contains the tile and the house.');
}

// The .ico is assembled by hand, so a malformed header would go unnoticed
// until a browser quietly fell back to a blank page icon.
const ico = await readFile(join(DIST, 'favicon.ico')).catch(() => null);
if (ico) {
  check(ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1,
    'favicon.ico does not start with a valid ICO header.');
  const count = ico.readUInt16LE(4);
  check(count >= 3, `favicon.ico contains ${count} image(s); 16, 32 and 48 are expected.`);
}

for (const path of pages) {
  const html = await readFile(path, 'utf8');
  if (/<meta http-equiv="refresh"/i.test(html) && html.length < 2000) continue;
  const page = pagePath(path);
  check(/<link[^>]+rel="icon"[^>]+href="\/favicon\.svg"/.test(html),
    `${page} has no <link rel="icon"> for the SVG.`,
    'Without a link tag the browser only finds /favicon.ico, and only by convention.');
  check(/<link[^>]+rel="apple-touch-icon"/.test(html),
    `${page} has no apple-touch-icon link.`);
}

// A bare fragment in the shared header resolves against whatever page it is
// rendered on, so the nav silently stopped working the moment the layout was
// used by a page that is not a county listing. Five pages shipped that way.
// Every header link must be absolute, and its target id must actually exist.
const idsFor = new Map();
for (const [p, html] of faqHtml) {
  const page = pagePath(p);
  idsFor.set(page, new Set([...html.matchAll(/\sid="([a-z-]+)"/g)].map((m) => m[1])));
}
for (const path of pages) {
  const html = await readFile(path, 'utf8');
  if (/<meta http-equiv="refresh"/i.test(html) && html.length < 2000) continue;
  const page = pagePath(path);
  const nav = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
  const hrefs = [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  check(hrefs.length > 0, `${page} has no nav links.`);
  for (const href of hrefs) {
    check(href.startsWith('/'),
      `${page} nav links to "${href}", a bare fragment.`,
      'It resolves against the current URL, so it only works on a county page.');
    const [target, id] = href.split('#');
    if (id) {
      // Resolved against the page the link points at. Checking every fragment
      // against the county page would pass /#browse, which is a different
      // section on a different page.
      const ids = idsFor.get(target || '/');
      check(ids !== undefined, `${page} nav links to ${target}, which was not built.`);
      if (ids) {
        check(ids.has(id), `${page} nav links to ${href}, but #${id} is not on ${target || '/'}.`);
      }
    }
  }
}

// A privacy policy and terms nobody can reach are the same as not having
// them. The link is the deliverable, not the page.
for (const path of pages) {
  const html = await readFile(path, 'utf8');
  if (/<meta http-equiv="refresh"/i.test(html) && html.length < 2000) continue;
  const page = pagePath(path);
  for (const legal of ['/privacy/', '/terms/']) {
    check(html.includes(`href="${legal}"`),
      `${page} does not link to ${legal} in its footer.`);
  }
}

// An unclaimed listing must offer no way to contact the inspector. Not a
// request button, not a phone number, not a link out. There is nothing on file
// for one — the DBPR extract carries no phone or email — so any contact path
// on an unclaimed row would be invented, and a request button would promise to
// pass a request to someone the site has no way to reach. Claiming is what
// puts contact on a listing, and every unclaimed row has to offer the claim.
//
// Until 2026-09-12 this check also forbade a tel: link anywhere on the page.
// Claimed listings show their phone number now, so the rule is per row.
for (const path of pages) {
  const html = faqHtml.get(path);
  if (!html) continue;
  const page = pagePath(path);
  if (!/^\/fl\/[a-z-]+\/$/.test(page)) continue;

  // Each chunk runs from one row's class attribute to the next row's, which is
  // the whole row. An earlier version truncated at the first </div></div>,
  // which cut every row off before the button it was meant to look for — so it
  // passed while 316 rows carried one.
  const rows = html.split('class="list-row').slice(1);
  const unclaimed = rows
    .filter((r) => !r.startsWith(' is-claimed') && !r.startsWith(' head'))
    .map((r) => r.split('</section>')[0]);
  check(unclaimed.length > 0, `${page} has no unclaimed rows to check.`);
  const contactable = unclaimed.filter((r) =>
    /request-btn-row|href="tel:|\b\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b|target="_blank"/.test(r));
  check(contactable.length === 0,
    `${page} shows a contact path on ${contactable.length} unclaimed listing(s).`);
  const claimable = unclaimed.filter((r) => /href="\/claim\/\?license=HI\d+"/.test(r));
  check(claimable.length === unclaimed.length,
    `${page}: ${unclaimed.length - claimable.length} unclaimed row(s) do not link to /claim/ with their license.`);
}

// The sitemap is the one file nobody looks at after it is generated. Its
// failure mode is silent and slow: Google crawls what it lists, so a wrong
// host, a missing trailing slash, or a URL that 404s costs crawl budget on a
// site that has almost no pages to spend it on.
const SITE_ORIGIN = 'https://verifiedhomeinspector.com';

const sitemapIndex = await readFile(join(DIST, 'sitemap-index.xml'), 'utf8').catch(() => null);
check(sitemapIndex !== null, 'No sitemap-index.xml was built.');

const robots = await readFile(join(DIST, 'robots.txt'), 'utf8').catch(() => null);
check(robots !== null, 'No robots.txt was built.');

if (sitemapIndex && robots) {
  // robots.txt is hand-written and the sitemap filename comes from the
  // integration, so nothing but this connects the two. If they drift, the
  // only symptom is a "couldn't fetch" line in Search Console weeks later.
  const declared = robots.match(/^Sitemap:\s*(\S+)/m)?.[1];
  check(declared === `${SITE_ORIGIN}/sitemap-index.xml`,
    `robots.txt points at ${declared ?? 'no sitemap'}, which is not the file the build wrote.`);

  const parts = [...sitemapIndex.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const built = new Set(pages.map((p) => pagePath(p)));
  const listed = [];

  for (const part of parts) {
    const name = part.replace(`${SITE_ORIGIN}/`, '');
    const xml = await readFile(join(DIST, name), 'utf8').catch(() => null);
    check(xml !== null, `sitemap-index.xml lists ${name}, which was not built.`);
    if (xml) listed.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  }

  check(listed.length > 0, 'The sitemap lists no pages at all.');

  // These are real pages and belong in search results. The confirmation-page
  // pattern is deliberately narrow so it cannot swallow them.
  for (const path of ['/privacy/', '/terms/']) {
    check(listed.includes(`${SITE_ORIGIN}${path}`),
      `Sitemap does not list ${path}, which should be indexed.`);
  }

  for (const url of listed) {
    // www 301s to the apex. Listing the redirecting host makes every entry a
    // wasted round trip, and Netlify serves the un-slashed path as a 301 too.
    check(url.startsWith(`${SITE_ORIGIN}/`),
      `Sitemap lists ${url}, which is not on the canonical host ${SITE_ORIGIN}.`);
    check(url.endsWith('/'),
      `Sitemap lists ${url} without a trailing slash; the host 301s that form.`);
    const path = url.replace(SITE_ORIGIN, '');
    check(built.has(path), `Sitemap lists ${path}, which is not a page in dist.`);
  }

  // Confirmation pages and counties with no data are built but must not be
  // offered to a crawler. Excluding them is a filter in astro.config.mjs that
  // is easy to drop while refactoring, and nothing else would notice.
  // Discovered from the build rather than listed, because the list went stale
  // the moment a third confirmation page was added: it named two, and the new
  // one would have been offered to Google with nothing to stop it.
  // Two since 2026-09-12: the claim confirmation page went with the claim form,
  // which the dashboard now posts from script with nowhere to redirect to.
  const confirmationPages = [...built].filter((p) => /^\/[a-z-]+-received\/$/.test(p));
  check(confirmationPages.length >= 2,
    `Found ${confirmationPages.length} confirmation page(s); request and featured are expected.`);
  for (const path of confirmationPages) {
    check(!listed.includes(`${SITE_ORIGIN}${path}`),
      `Sitemap lists ${path}, a form confirmation page.`);
    check(robots.includes(`Disallow: ${path}`),
      `robots.txt no longer disallows ${path}.`);
  }
  const countiesSrc = await readFile('src/lib/counties.ts', 'utf8');
  for (const [, slug] of countiesSrc.matchAll(/slug: '([^']+)'[^}]*status: 'coming_soon'/g)) {
    check(!listed.includes(`${SITE_ORIGIN}/fl/${slug}/`),
      `Sitemap lists /fl/${slug}/, a county whose page is a "coming soon" stub.`);
  }
}

for (const note of notes) console.log(`  note: ${note}`);

if (failures.length > 0) {
  console.error(`\nSmoke test failed with ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(`\nSmoke test passed: ${pages.length} pages checked.\n`);
