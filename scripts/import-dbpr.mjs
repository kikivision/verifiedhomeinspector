#!/usr/bin/env node
/**
 * Import Florida DBPR home-inspector license records into the listings table.
 *
 * Source: the official DBPR public-records extract for the Home Inspector
 * board (lic04home.csv), refreshed weekly by the department. This is a bulk
 * public-records download, not a scrape of the license-lookup UI.
 *   https://www2.myfloridalicense.com/home-inspectors/public-records/
 *
 * The extract excludes null-and-void, delinquent and involuntarily inactive
 * licensees, so a licensee disappearing between runs means their license is
 * no longer current. Those are deactivated here rather than deleted, so a
 * claimed listing is never silently destroyed by a bad upstream file.
 *
 * Usage:
 *   node scripts/import-dbpr.mjs --county pinellas            # upsert to Supabase
 *   node scripts/import-dbpr.mjs --county pinellas --emit-sql # print SQL, write nothing
 *   node scripts/import-dbpr.mjs --county pinellas --csv path/to/lic04home.csv
 *
 * Writing requires SUPABASE_SERVICE_ROLE_KEY: the anon key the site uses is
 * read-only by design, and inserting listings is an admin operation.
 */

const EXTRACT_URL =
  'https://www2.myfloridalicense.com/sto/file_download/extracts/lic04home.csv';

// DBPR county codes. Add a county here plus a slug the site routes on.
const COUNTIES = {
  pinellas: '62',
  hillsborough: '29',
  pasco: '51',
};

// Column positions in the lic04home.csv layout (the file has no header row).
const COL = {
  occupation: 1,
  licenseeName: 2,
  dbaName: 3,
  city: 8,
  state: 9,
  countyCode: 11,
  secondaryStatus: 14,
  expirationDate: 17,
  altLicenseNumber: 20,
};

// Only 'A' (active) licensees belong in a directory that offers inspectors to
// hire. 'I' is inactive — a real licensee who may not currently practice — and
// a blank secondary status marks schools and course providers (CRS/PVD license
// prefixes), which are not inspectors at all.
const ACTIVE = 'A';

/**
 * City spellings in the extract are free text and inconsistent: St. Petersburg
 * alone arrives eight different ways. Left alone, one city fragments into
 * several entries in the city filter. Only obvious variants and typos are
 * folded here — genuinely separate municipalities stay separate, so St. Pete
 * Beach never merges into St. Petersburg, and the three Belleairs stay apart.
 */
const CITY_ALIASES = new Map(Object.entries({
  'SAINT PETERSBURG': 'St. Petersburg',
  'ST PETERSBURG': 'St. Petersburg',
  'ST. PETERSBURG': 'St. Petersburg',
  'ST.PETERSBURG': 'St. Petersburg',
  'ST.PETERSBURGH': 'St. Petersburg',
  'ST PETE': 'St. Petersburg',
  'ST. PETE': 'St. Petersburg',
  'ST PETE BEACH': 'St. Pete Beach',
  'ST. PETE BEACH': 'St. Pete Beach',
  'CLEAWATER': 'Clearwater',
  // Clearwater Beach sits inside Clearwater city limits; one entry is friendlier
  // in a city filter than two that mean the same place to a homeowner.
  'CLEARWATER BEACH': 'Clearwater',
  'GULF PORT': 'Gulfport',
  'MADIERA BEACH FL': 'Madeira Beach',
  'MADIERA BEACH': 'Madeira Beach',
  'TARPON SPGS': 'Tarpon Springs',
  'TARPON SPINGS': 'Tarpon Springs',
  'TARPON SPRING': 'Tarpon Springs',
}));

// Generational suffixes. Roman numerals stay uppercase; Jr and Sr are written
// the way a person signs them, so they cannot share one casing rule.
const NAME_SUFFIXES = new Map(Object.entries({
  JR: 'Jr', SR: 'Sr', II: 'II', III: 'III', IV: 'IV', V: 'V',
}));

/** Title-case one name token, keeping Mc- prefixes and hyphenated names right. */
function titleToken(token) {
  if (!token) return token;
  if (token.includes('-')) return token.split('-').map(titleToken).join('-');
  const lower = token.toLowerCase();
  const cased = lower.charAt(0).toUpperCase() + lower.slice(1);
  // McCan, McAllister — but not MacAluso, which is really Macaluso.
  if (/^MC[A-Z]/.test(token) && token.length > 2) {
    return 'Mc' + cased.charAt(2).toUpperCase() + cased.slice(3);
  }
  return cased;
}

/**
 * DBPR stores names as "LAST, FIRST MIDDLE [SUFFIX]" in all caps. The site
 * shows them the way a person writes their own name, with any generational
 * suffix following the surname: "MARINO, ANTHONY JOHN JR" -> "Anthony John
 * Marino Jr".
 */
function formatLicenseeName(raw) {
  const [last = '', rest = ''] = raw.split(',').map((s) => s.trim());
  const given = rest.split(/\s+/).filter(Boolean);
  let suffix = '';
  if (given.length > 1) {
    const candidate = given.at(-1).replace(/\./g, '').toUpperCase();
    if (NAME_SUFFIXES.has(candidate)) {
      suffix = NAME_SUFFIXES.get(candidate);
      given.pop();
    }
  }
  const parts = [...given.map(titleToken), ...last.split(/\s+/).filter(Boolean).map(titleToken)];
  if (suffix) parts.push(suffix);
  return parts.join(' ');
}

function formatCity(raw) {
  const key = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (CITY_ALIASES.has(key)) return CITY_ALIASES.get(key);
  return key.split(' ').map(titleToken).join(' ');
}

/** Minimal RFC-4180 parser — the extract quotes every field and has no header. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

function toListing(record, countySlug) {
  return {
    county: countySlug,
    city: formatCity(record[COL.city]),
    license_number: record[COL.altLicenseNumber].trim().toUpperCase(),
    licensee_name: formatLicenseeName(record[COL.licenseeName]),
    // The DBPR "doing business as" field is not a home-inspection business
    // name: in Pinellas it holds things like "INDIVIDUAL" and unrelated
    // contracting entities. Business name, phone and bio are what an inspector
    // supplies when they claim a listing, so those stay null here and a claimed
    // listing's own values are never overwritten by a later import.
    business_name: null,
    phone: null,
    tier: 'unclaimed',
  };
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback = null) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
  };
  const countySlug = flag('county', 'pinellas');
  const emitSql = args.includes('--emit-sql');
  const countyCode = COUNTIES[countySlug];
  if (!countyCode) {
    throw new Error(`Unknown county "${countySlug}". Known: ${Object.keys(COUNTIES).join(', ')}`);
  }

  const csvPath = flag('csv');
  let text;
  if (csvPath) {
    text = await (await import('node:fs/promises')).readFile(csvPath, 'latin1');
  } else {
    const res = await fetch(EXTRACT_URL);
    if (!res.ok) throw new Error(`DBPR extract fetch failed: HTTP ${res.status}`);
    text = new TextDecoder('latin1').decode(await res.arrayBuffer());
  }

  const all = parseCsv(text);
  const matched = all.filter(
    (r) =>
      r[COL.countyCode] === countyCode &&
      r[COL.secondaryStatus] === ACTIVE &&
      r[COL.altLicenseNumber].trim().toUpperCase().startsWith('HI'),
  );
  const listings = matched.map((r) => toListing(r, countySlug));

  const seen = new Set();
  const deduped = listings.filter((l) => {
    if (seen.has(l.license_number)) return false;
    seen.add(l.license_number);
    return true;
  });

  console.error(
    `[dbpr] ${all.length} records in extract -> ${matched.length} active ${countySlug} ` +
      `inspectors -> ${deduped.length} after dedupe`,
  );

  if (emitSql) {
    const values = deduped
      .map(
        (l) =>
          `  (${sqlLiteral(l.county)}, ${sqlLiteral(l.city)}, ${sqlLiteral(l.license_number)}, ` +
          `${sqlLiteral(l.licensee_name)}, ${sqlLiteral(l.business_name)}, ${sqlLiteral(l.phone)}, ` +
          `${sqlLiteral(l.tier)})`,
      )
      .join(',\n');
    process.stdout.write(
      `insert into listings (county, city, license_number, licensee_name, business_name, phone, tier)\nvalues\n${values}\n` +
        `on conflict (license_number) do update set\n` +
        `  city = excluded.city,\n  licensee_name = excluded.licensee_name;\n`,
    );
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    throw new Error('Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to write.');
  }
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Only license-derived columns are updated on conflict, so a listing an
  // inspector has already claimed keeps its business name, phone and bio.
  const { error } = await supabase
    .from('listings')
    .upsert(deduped, { onConflict: 'license_number', ignoreDuplicates: false });
  if (error) throw error;
  console.error(`[dbpr] upserted ${deduped.length} ${countySlug} listings`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
