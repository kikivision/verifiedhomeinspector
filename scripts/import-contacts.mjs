#!/usr/bin/env node
/**
 * Pre-fill phone, website and business name on UNCLAIMED listings from a CSV
 * researched by hand, so a homeowner landing on a city page has someone to
 * call before anyone has claimed.
 *
 * Usage:
 *   node --env-file=.env scripts/import-contacts.mjs outreach/st-petersburg.csv --dry-run
 *   node --env-file=.env scripts/import-contacts.mjs outreach/st-petersburg.csv
 *
 * CSV columns (header row required; extra columns are ignored):
 *   license        HI7816
 *   phone          (727) 555-0100        optional
 *   website        rmcinspections.com    optional; scheme added if missing
 *   business_name  RMC Inspections       optional
 *   source         where it was found     optional, for the audit trail only
 *
 * Rules, in order of importance:
 *   - A claimed or featured row is never touched. The inspector owns it.
 *   - Only rows whose contact_source is null or 'public' are written. A row
 *     the DBPR importer delisted is skipped.
 *   - Every written row is marked contact_source = 'public', which is what the
 *     site renders as "from a public listing · not yet claimed".
 *   - Data must come from the inspector's own website or a public listing.
 *     Google Places data may be used to FIND a business; it may not be
 *     republished here. The source column is where you say which it was.
 *
 * Writing needs SUPABASE_SERVICE_ROLE_KEY, like the other admin scripts.
 */
import { readFileSync } from 'node:fs';
import { isRemoved } from '../src/lib/removed.ts';

const [, , csvPath, ...rest] = process.argv;
const dryRun = rest.includes('--dry-run');
if (!csvPath) {
  console.error('Usage: node --env-file=.env scripts/import-contacts.mjs <file.csv> [--dry-run]');
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const [header, ...lines] = parseCsv(readFileSync(csvPath, 'utf8'));
const col = Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase(), i]));
for (const required of ['license']) {
  if (col[required] === undefined) throw new Error(`CSV needs a "${required}" column.`);
}
const cell = (r, name) => (col[name] === undefined ? '' : (r[col[name]] ?? '').trim());

function cleanPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  throw new Error(`Phone "${raw}" is not a 10-digit US number.`);
}
function cleanWebsite(raw) {
  if (!raw) return null;
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (!/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(url) || url.length > 200) {
    throw new Error(`Website "${raw}" does not look like an address.`);
  }
  return url.replace(/\/$/, '');
}

const entries = lines.map((r, i) => {
  const license = cell(r, 'license').toUpperCase().replace(/\s/g, '');
  if (!/^HI\d{1,6}$/.test(license)) throw new Error(`Row ${i + 2}: license "${license}" is not an HI number.`);
  return {
    license,
    phone: cleanPhone(cell(r, 'phone')),
    website: cleanWebsite(cell(r, 'website')),
    business_name: cell(r, 'business_name') || null,
    source: cell(r, 'source') || null,
  };
}).filter((e) => e.phone || e.website || e.business_name);

const url = process.env.PUBLIC_SUPABASE_URL;
const key = dryRun ? (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY) : process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: rows, error } = await supabase
  .from('listings')
  .select('license_number, licensee_name, city, tier, claimed_by, contact_source, phone, website, business_name, delisted_at')
  .in('license_number', entries.map((e) => e.license));
if (error) throw error;
const byLicense = new Map(rows.map((r) => [r.license_number, r]));

let written = 0, skipped = 0;
for (const e of entries) {
  const row = byLicense.get(e.license);
  if (isRemoved(e.license)) { console.error(`  ${e.license}: removed from the site (src/lib/removed.ts) — skipped`); skipped += 1; continue; }
  if (!row) { console.error(`  ${e.license}: not on the site — skipped`); skipped += 1; continue; }
  if (row.delisted_at) { console.error(`  ${e.license} ${row.licensee_name}: delisted — skipped`); skipped += 1; continue; }
  if (row.tier !== 'unclaimed' || row.claimed_by || row.contact_source === 'inspector') {
    console.error(`  ${e.license} ${row.licensee_name}: claimed — never touched`); skipped += 1; continue;
  }
  const update = { contact_source: 'public' };
  if (e.phone) update.phone = e.phone;
  if (e.website) update.website = e.website;
  if (e.business_name) update.business_name = e.business_name;
  const changes = Object.entries(update).filter(([k, v]) => row[k] !== v);
  if (changes.length === 0) { skipped += 1; continue; }
  console.error(`  ${e.license} ${row.licensee_name} (${row.city}): ` + changes.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ') + (e.source ? `  [${e.source}]` : ''));
  if (!dryRun) {
    const { error: writeError } = await supabase.from('listings').update(update).eq('license_number', e.license);
    if (writeError) throw writeError;
  }
  written += 1;
}
console.error(`\n${dryRun ? 'DRY RUN — ' : ''}${written} listing(s) ${dryRun ? 'would be ' : ''}updated, ${skipped} skipped.`);
if (!dryRun && written > 0) {
  console.error('The rebuild trigger fires on phone/website/business_name changes; the pages update within a minute or two.');
}
