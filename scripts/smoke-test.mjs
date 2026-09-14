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
    // Measured as a reader sees it, not as the attribute is escaped: "R&R
    // Inspections" is 15 characters on the page and 19 in the HTML, and the
    // source trims on the former.
    const shown = description.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    check(
      shown.length <= MAX_META_DESCRIPTION,
      `${page}: meta description is ${shown.length} characters.`,
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
  // A listing row weighs about 0.7KB, so a county page's size is its row
  // count: Miami-Dade's 888 rows are 594KB at the same per-row weight as
  // Pinellas's 316 at 205KB. The budget grows with the rows on the page and
  // still catches the thing it exists for, content repeated per row, because
  // that doubles the per-row weight rather than the row count.
  const rowsOnPage = (html.match(/class="list-row/g) ?? []).length;
  const budget = Math.max(MAX_PAGE_KB, Math.round(rowsOnPage * 1.0));
  check(kb <= budget, `${page}: ${kb}KB exceeds the ${budget}KB budget for ${rowsOnPage} rows.`,
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
// Every featured-inventory number lives in lib/cities.ts. These checks exist
// so the constants, the eight places that render them and the English prose
// that spells them out can never drift apart: the numbers moved from four to
// six on 2026-09-14 across six files, and a missed one is a promise broken in
// public with nothing failing.
const citiesSrc = await readFile('src/lib/cities.ts', 'utf8');
const constant = (name) => Number(citiesSrc.match(new RegExp(`${name} = (\\d+)`))?.[1] ?? NaN);
const cap = constant('COUNTY_FEATURED_CAP');
const target = constant('COUNTY_FEATURED_TARGET');
check(Number.isInteger(cap) && Number.isInteger(target),
  'Could not read COUNTY_FEATURED_CAP / COUNTY_FEATURED_TARGET from lib/cities.ts.');
const countySource = await readFile('src/pages/fl/[county]/index.astro', 'utf8');
check(!/const FEATURED_(CAP|TARGET) = \d/.test(countySource),
  'The county page declares its own FEATURED_CAP or FEATURED_TARGET; these live in lib/cities.ts.');
if (Number.isInteger(cap) && Number.isInteger(target)) {
  // The row draws open-slot cards up to the target, and paid cards past the
  // target still render, so it is never smaller than the target. The copy
  // says "never more than" the cap, so it is never larger than that either.
  const shown = featuredSlots + claimedFeatured;
  check(shown >= target, `Pinellas page shows ${shown} featured positions, but FEATURED_TARGET is ${target}.`);
  check(shown <= cap, `Pinellas page shows ${shown} featured positions, but the copy promises never more than ${cap}.`);
  check(
    county.includes(`is one of ${cap} spots above all of them`),
    `The county page's open-slot copy does not state the cap of ${cap}.`,
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
  ['/dashboard/', dashboard, 'claim-listing',
    ['form-name', 'county', 'license-number', 'licensee-name', 'email', 'plan']],
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
  // County pages and city pages; inspector pages have a third segment.
  if (!/^\/fl\/[a-z-]+(\/[a-z0-9-]+)?\/$/.test(page)) continue;

  // Each chunk runs from one row's class attribute to the next row's, which is
  // the whole row. An earlier version truncated at the first </div></div>,
  // which cut every row off before the button it was meant to look for — so it
  // passed while 316 rows carried one.
  const rows = html.split('class="list-row').slice(1);
  const unclaimed = rows
    .filter((r) => !r.startsWith(' is-claimed') && !r.startsWith(' head'))
    .map((r) => r.split('</section>')[0]);
  check(unclaimed.length > 0, `${page} has no unclaimed rows to check.`);
  // A pre-filled public contact is the one allowed exception, and it has to
  // say so: the row carries data-contact="public" and its own note. A phone
  // number on an unclaimed row without that marker is a leak.
  const contactable = unclaimed.filter((r) =>
    !r.includes('data-contact="public"') &&
    /request-btn-row|href="tel:|\b\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b|target="_blank"/.test(r));
  const publicRows = unclaimed.filter((r) => r.includes('data-contact="public"'));
  const publicWithoutNote = publicRows.filter((r) => !r.includes('From a public listing'));
  check(publicWithoutNote.length === 0,
    `${page}: ${publicWithoutNote.length} pre-filled row(s) do not say the contact is from a public listing.`);
  const publicWithRequest = publicRows.filter((r) => /request-btn-row/.test(r));
  check(publicWithRequest.length === 0,
    `${page}: ${publicWithRequest.length} pre-filled row(s) offer a request button; only a claimed listing takes requests.`);
  check(contactable.length === 0,
    `${page} shows a contact path on ${contactable.length} unclaimed listing(s).`);
  // Pre-filled rows sort above bare ones (2026-09-12): the last row with a
  // number must come before the first row without one.
  const lastPublic = unclaimed.map((r) => r.includes('data-contact="public"')).lastIndexOf(true);
  const firstBare = unclaimed.findIndex((r) => !r.includes('data-contact="public"'));
  check(lastPublic === -1 || firstBare === -1 || lastPublic < firstBare,
    `${page}: an unclaimed row with no contact sorts above a row with a public number.`);
  const claimable = unclaimed.filter((r) => /href="\/claim\/\?license=HI\d+"/.test(r));
  check(claimable.length === unclaimed.length,
    `${page}: ${unclaimed.length - claimable.length} unclaimed row(s) do not link to /claim/ with their license.`);
}

// Per-inspector pages: one for every live listing, at
// /fl/<county>/<city>/<hi####-licensee-name>/. The build reads listings per
// county because PostgREST caps a query at 1,000 rows, so a page count near
// that number is the sign the cap was hit and a county's tail went unbuilt.
const inspectorPages = pages.filter((p) => /^\/fl\/[a-z-]+\/[a-z0-9-]+\/hi\d+-[a-z0-9-]+\/$/.test(pagePath(p)));
check(inspectorPages.length > 1000,
  `Only ${inspectorPages.length} inspector pages were built; four counties hold more than 1,000 listings.`,
  'A per-county read that silently returned fewer rows builds fewer pages with no error.');
let claimedPages = 0;
for (const path of inspectorPages) {
  const html = faqHtml.get(path);
  const page = pagePath(path);
  const license = page.match(/\/hi(\d+)-/)[1];
  check(html.includes(`FL Lic #HI${license}`), `${page} does not show its own license number.`);
  // Three states, not two. A pre-filled public contact renders the same
  // card as a claimed page, marked data-contact="public"; it is still an
  // unclaimed listing, so it gets the note, the claim link, no badge and no
  // business schema. Reading the card alone counted those as claimed and
  // failed 27 pages the day the first numbers went in.
  const isPublic = /class="card profile-card" data-contact="public"/.test(html);
  const isClaimed = !isPublic && html.includes('class="card profile-card');
  if (isPublic) {
    check(/href="tel:/.test(html) || /class="row-web"/.test(html),
      `${page} carries a public-contact card with nothing in it.`);
    check(html.includes('From a public listing'),
      `${page} shows a pre-filled contact without saying where it came from.`);
    check(html.includes(`/claim/?license=HI${license}`), `${page} is pre-filled but has no claim link.`);
    check(!html.includes(`/badge/HI${license}.svg`), `${page} is pre-filled but carries a badge.`);
    check(!html.includes('"@type":"HomeAndConstructionBusiness"'),
      `${page} is pre-filled but carries business schema.`, 'Only a claim confirms a business.');
  } else if (isClaimed) {
    claimedPages += 1;
    check(/href="tel:/.test(html) || /class="row-web"/.test(html) || /No contact listed yet/.test(html),
      `${page} is claimed but shows no contact and no fallback.`);
    check(html.includes(`/badge/HI${license}.svg`), `${page} is claimed but has no badge.`);
    check(html.includes('"@type":"HomeAndConstructionBusiness"'), `${page} is claimed but has no LocalBusiness schema.`);
  } else {
    // The same rule the county rows follow: nothing on file, so no contact
    // path, and the claim is the only action.
    check(!/href="tel:/.test(html) && !/request-btn/.test(html),
      `${page} is unclaimed but offers a contact path.`);
    check(html.includes(`/claim/?license=HI${license}`), `${page} is unclaimed but has no claim link.`);
    check(!html.includes('"@type":"HomeAndConstructionBusiness"'),
      `${page} is unclaimed but carries business schema.`, 'That would be inventing a business on someone\'s behalf.');
  }
}
check(claimedPages >= 1, 'No inspector page rendered as claimed; RMC (HI7816) should.');

// One badge per claimed listing, and it has to be a real SVG: an endpoint that
// returned an empty body or an HTML error page would still produce a file.
const badges = (await readdir(join(DIST, 'badge')).catch(() => [])).filter((f) => f.endsWith('.svg'));
check(badges.length === claimedPages,
  `${badges.length} badge SVG(s) built for ${claimedPages} claimed page(s).`);
for (const file of badges) {
  const svg = await readFile(join(DIST, 'badge', file), 'utf8');
  check(/^\s*<svg[\s>]/.test(svg) && /<\/svg>\s*$/.test(svg.trim()), `badge/${file} is not a well-formed SVG.`);
  check(svg.includes(file.replace('.svg', '')), `badge/${file} does not carry its own license number.`);
}

// City pages: one per city with MIN_CITY_LISTINGS or more inspectors, at
// /fl/<county>/<city>/. Each carries four featured positions of its own, the
// rows for that city, and a link to every other city page in the county.
const cityPages = pages.filter((p) => /^\/fl\/[a-z-]+\/[a-z0-9-]+\/$/.test(pagePath(p)));
check(cityPages.length >= 40,
  `Only ${cityPages.length} city pages were built; the four counties hold more than 40 cities with three or more listings.`);
const cityCap = constant('CITY_FEATURED_CAP');
// The target varies by page size (cityFeaturedTarget), so the row is bounded
// by the smallest target below and the cap above rather than one number.
const cityTarget = constant('CITY_FEATURED_TARGET_SMALL');
check(Number.isInteger(cityCap) && Number.isInteger(cityTarget),
  'Could not read CITY_FEATURED_CAP / CITY_FEATURED_TARGET_SMALL from lib/cities.ts.');

// The schema checks `featured_position between 1 and 6`. A cap above that
// writes a position the database rejects, at fulfillment, after the card is
// charged.
const positionLimit = constant('COUNTY_POSITION_LIMIT');
check(cap <= positionLimit,
  `COUNTY_FEATURED_CAP is ${cap}, above the ${positionLimit} the featured_position check allows.`,
  'Migrate the check constraint in verified-home-inspector-schema.sql first.');

// Both grids are two columns, so an odd count leaves a visible hole.
for (const [name, n] of [['COUNTY_FEATURED_TARGET', target], ['CITY_FEATURED_TARGET', constant('CITY_FEATURED_TARGET')], ['CITY_FEATURED_TARGET_SMALL', cityTarget]]) {
  check(n % 2 === 0, `${name} is ${n}; the featured grid is two columns, so it must be even.`);
}

// set-tier.mjs cannot import lib/cities.ts without pulling in the Supabase
// client, so it keeps its own copies. They have to agree.
const setTier = await readFile('scripts/set-tier.mjs', 'utf8');
for (const [name, expected] of [['FEATURED_CAP', cap], ['CITY_FEATURED_CAP', cityCap]]) {
  const found = Number(setTier.match(new RegExp(`^const ${name} = (\\d+)`, 'm'))?.[1] ?? NaN);
  check(found === expected,
    `set-tier.mjs has ${name} = ${found}, but lib/cities.ts says ${expected}.`);
}

// The prose spells the numbers out, so a changed constant silently leaves the
// old word behind. WORDS covers every value these caps can sensibly take.
const WORDS = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight' };
const say = (n) => WORDS[n] ?? String(n);
const capWord = say(cityCap);
const copyClaims = [
  ['for-inspectors', forInspectors, `${capWord} spots per city, never more`],
  ['dashboard', dashboard, `${capWord} spots per city, never`],
  ['the featured dialog on the Pinellas page', county, `${capWord} spots per city, never more`],
  ['terms', await readFile(join(DIST, 'terms', 'index.html'), 'utf8').catch(() => null),
    `at most ${say(cap)} featured cards`],
];
for (const [where, html, claim] of copyClaims) {
  if (html === null) { check(false, `Could not read the built ${where} page to check its featured copy.`); continue; }
  check(html.toLowerCase().includes(claim.toLowerCase()),
    `${where} does not say "${claim}", so its copy disagrees with lib/cities.ts.`);
}
check(cap === cityCap || !(await readFile(join(DIST, 'terms', 'index.html'), 'utf8').catch(() => '')).includes('each county page holds at most'),
  'The terms page states one number for city and county pages, but the two caps now differ.');
for (const path of cityPages) {
  const html = faqHtml.get(path);
  const page = pagePath(path);
  const rowCount = (html.match(/class="list-row"/g) ?? []).length + (html.match(/class="list-row is-claimed"/g) ?? []).length;
  check(rowCount >= 2, `${page} renders ${rowCount} listing rows; a city page needs at least three listings less its featured cards.`);
  const cards = (html.match(/class="card featured"/g) ?? []).length;
  const slots = (html.match(/card ad-slot/g) ?? []).length;
  if (Number.isInteger(cityCap) && Number.isInteger(cityTarget)) {
    // Open-slot cards are drawn up to the target and paid cards past it still
    // render, so the row is never smaller than the target and never larger
    // than the cap the copy promises.
    const shown = cards + slots;
    check(shown >= Math.min(cityTarget, cityCap),
      `${page} shows ${shown} featured positions, fewer than the smallest target of ${cityTarget}.`);
    check(shown <= cityCap,
      `${page} shows ${shown} featured positions, but the copy promises never more than ${cityCap}.`);
    check(html.includes(`${cityCap} spots per city, never more`),
      `${page} does not state the cap of ${cityCap} spots per city.`);
  }
  check(/<form[^>]*name=['"]featured-inquiry['"]/.test(html) && /name="city"/.test(html),
    `${page} has no featured-inquiry form carrying the city.`);
  check(/class="city-links"/.test(html), `${page} does not link to the county's other cities.`);
}
// The county page is the crawler's way to every city page.
check(/class="city-links"/.test(county) && (county.match(/class="city-links">[\s\S]*?<\/div>/)?.[0].match(/<a /g) ?? []).length >= 10,
  'The Pinellas page does not link to its city pages.');

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
  // One since 2026-09-12: the claim confirmation went with the claim form, and
  // the request confirmation went with the request form.
  const confirmationPages = [...built].filter((p) => /^\/[a-z-]+-received\/$/.test(p));
  check(confirmationPages.length >= 1,
    `Found ${confirmationPages.length} confirmation page(s); featured is expected.`);
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

// A removed license (src/lib/removed.ts) must not have a page or appear in
// any other page's HTML. The row is deleted and the build filters on the
// list; this is what proves both actually happened.
{
  const removedSrc = await readFile('src/lib/removed.ts', 'utf8');
  for (const [, license] of removedSrc.matchAll(/^\s{2}(HI\d+):/gm)) {
    const slug = license.toLowerCase() + '-';
    const ownPage = pages.filter((p) => pagePath(p).includes('/' + slug));
    check(ownPage.length === 0, `${license} is on the removed list but still has a page: ${ownPage.map(pagePath).join(', ')}`);
    const mentions = pages.filter((p) => faqHtml.get(p).includes(license));
    check(mentions.length === 0,
      `${license} is on the removed list but still appears on ${mentions.length} page(s).`,
      mentions.slice(0, 3).map(pagePath).join(', '));
  }
}

// The request form is gone (2026-09-12, evening): the ads say "call the
// inspector directly, no lead forms," and the site has to do what the ad says.
// Checked on every page, by the visible text and the form name, so a stray
// component cannot bring it back.
for (const p of pages) {
  const html = faqHtml.get(p);
  check(!/name=['"]inspector-request['"]/.test(html), `${pagePath(p)} still carries the inspector-request form.`);
  check(!/Request (this inspector|an inspection)/.test(html), `${pagePath(p)} still offers a request button.`);
}

for (const note of notes) console.log(`  note: ${note}`);

if (failures.length > 0) {
  console.error(`\nSmoke test failed with ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(`\nSmoke test passed: ${pages.length} pages checked.\n`);
