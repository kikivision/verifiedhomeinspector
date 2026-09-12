/**
 * URL pieces for per-inspector and per-city pages.
 *
 * One function, shared by the build (page paths, links on the county page)
 * and the dashboard (the badge snippet an inspector copies), so the URL a
 * page is built at and the URL the snippet points to can never disagree.
 */

/** "St. Petersburg" -> "st-petersburg"; "Land O Lakes" -> "land-o-lakes". */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The last path segment of an inspector's page: "hi7816-robert-w-martin".
 *
 * Built from the LICENSEE name, never the business name. The licensee name
 * comes from the state record and does not change; a business name is added
 * or edited when the inspector claims, and a URL that changed with it would
 * turn every link to the page — the badge on their own site included — into a
 * dead one. The license number in front keeps two inspectors with the same
 * name apart and makes the segment unique on its own.
 */
export function inspectorSlug(license: string, licenseeName: string): string {
  return `${license.toLowerCase()}-${slugify(licenseeName)}`;
}

/** Site-relative path to an inspector's page. */
export function inspectorPath(county: string, city: string, license: string, licenseeName: string): string {
  return `/fl/${county}/${slugify(city)}/${inspectorSlug(license, licenseeName)}/`;
}
