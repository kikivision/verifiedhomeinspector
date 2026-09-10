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
import { join, relative } from 'node:path';

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
check(pages.length > 0, 'No HTML was built at all.');

for (const path of pages) {
  const html = await readFile(path, 'utf8');
  const page = '/' + relative(DIST, path).replace(/index\.html$/, '');
  const { size } = await stat(path);

  // A redirect stub has no head worth checking.
  const isRedirectStub = /<meta http-equiv="refresh"/i.test(html) && html.length < 2000;
  if (isRedirectStub) {
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

// Both forms are the site's only conversion paths, and Netlify only registers a
// form it can find in the built HTML. A missing hidden field means the
// submission arrives with no idea who it was for.
const forms = {
  'claim-listing': ['form-name', 'county', 'license-number', 'licensee-name', 'email', 'plan'],
  'inspector-request': [
    'form-name', 'county', 'inspector-license', 'inspector-name',
    'homeowner-name', 'homeowner-email',
  ],
};
for (const [name, fields] of Object.entries(forms)) {
  const present = new RegExp(`<form[^>]*name=['"]${name}['"]`).test(county);
  check(present, `Form "${name}" is missing from the built page.`,
    'Netlify reads forms out of the HTML at deploy time; if it is not here it does not exist.');
  if (!present) continue;
  for (const field of fields) {
    check(
      new RegExp(`name=['"]${field}['"]`).test(county),
      `Form "${name}" is missing the field "${field}".`,
    );
  }
}

// The FAQ answers questions people type into search engines, and the schema is
// what answer engines read. The two render from one array and must not drift.
const schemaJson = county.match(
  /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
)?.[1];
check(schemaJson !== undefined, 'No FAQPage JSON-LD on the county page.');
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
    const rendered = (county.match(/class="faq-item"/g) ?? []).length;
    check(rendered === schemaCount,
      `FAQ accordion renders ${rendered} items but the schema has ${schemaCount}.`);
  }
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

for (const note of notes) console.log(`  note: ${note}`);

if (failures.length > 0) {
  console.error(`\nSmoke test failed with ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(`\nSmoke test passed: ${pages.length} pages checked.\n`);
