/**
 * Licenses removed from the site by hand.
 *
 * The DBPR extract is the source of truth for who is listed, which is the
 * site's whole promise — so a removal cannot be a row edit, because the
 * monthly import would put the row straight back. Instead the license is
 * named here, scripts/remove-listing.mjs deletes the row, and the importer
 * refuses to re-insert anything on this list. The build filters on it too,
 * so a removed license never renders even if a row somehow returns.
 *
 * Add a license, run `node --env-file=.env scripts/remove-listing.mjs`,
 * commit. Taking someone off the list restores them at the next DBPR import.
 * A claim on a removed license fails at the database (no row to claim).
 */
export const REMOVED_LICENSES: Record<string, { on: string; reason: string }> = {
  // Empty. The first candidate (HI14513, 2026-09-12) turned out to be an
  // employee inspector at Waypoint Property Inspection, reachable on the
  // firm's line; the "no phone anywhere" was a lookup that stopped one site
  // too early. Check the employer before a name goes here.
};

export function isRemoved(license: string): boolean {
  return Object.hasOwn(REMOVED_LICENSES, license.trim().toUpperCase());
}
