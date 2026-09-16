import type { Listing } from './supabase';
import { slugify } from './slug.ts';

/**
 * A city gets its own page only with this many listings. The DBPR extract
 * files a license under a county but the mailing city can be anywhere: the
 * Pinellas import carries one inspector each in Bradenton, Sarasota and
 * St. Augustine. A "Home inspectors in Sarasota" page holding one unclaimed
 * name, filed under the wrong county, is a page Google should not see and a
 * homeowner should not land on. Those inspectors keep their own pages; the
 * city crumb on them goes to the county page with the city filter set.
 */
export const MIN_CITY_LISTINGS = 3;

/**
 * How many featured cards a city page holds: six, and the copy says "never
 * more than six" on every page that sells one. An inspector buying a spot
 * has to know they will never be one of twenty; the value of the spot is
 * that number. Raising this is a promise taken back and needs a DECISIONS
 * entry, not an edit — see the 2026-09-14 entry, which raised it from four
 * alongside the county page so the fifth and sixth buyers in a county can
 * still get the cities they actually work in. (It was briefly two "while we
 * build out" on 2026-09-12; that was a misreading of the cap/target split.)
 *
 * Small cities need no smaller cap: a city page holds at most as many
 * featured cards as inspectors who chose it, and nobody chooses Gulfport
 * over Clearwater, so those pages stay small on their own.
 */
export const CITY_FEATURED_CAP = 6;
/**
 * How many open featured boxes a city page draws while nobody has bought
 * one: two, on every city page, from 2026-09-16. Four was decided against
 * (Karen: "4 is a lot to scroll through"; the page is being sent to
 * homeowners and the boxes sat above an all-unclaimed list). The sold cards
 * always show, and open boxes fill up to this number, so a city with one
 * sold spot shows one open box and a city with two or more shows none. The
 * cap is untouched and the copy still says "6 spots per city, never more"
 * on every page that sells one. Keep this EVEN: .featured-grid is two
 * columns and an odd count leaves a visible hole.
 */
export const CITY_FEATURED_TARGET = 2;
/**
 * Under this many listings a city page is "small". Ten splits Pinellas where
 * the data already splits it: Dunedin has 19 and Pinellas Park has 9, with
 * nothing between. About half the state's 315 city pages fall below it.
 * Small and large cities draw the same two boxes today; the split is kept
 * so the two can diverge again without re-deriving the threshold.
 */
export const SMALL_CITY_LISTINGS = 10;
export const CITY_FEATURED_TARGET_SMALL = CITY_FEATURED_TARGET;

/** Featured positions to show on a city page with this many listings. */
export function cityFeaturedTarget(listingCount: number): number {
  return listingCount < SMALL_CITY_LISTINGS ? CITY_FEATURED_TARGET_SMALL : CITY_FEATURED_TARGET;
}

/**
 * The county page's ceiling, and the range `featured_position` is assigned
 * from: positions are 1..this. Raised from four to six on 2026-09-14; see
 * DECISIONS.md. This file is the ONE place these numbers live — the county
 * page, the fulfillment library and the smoke test all read it, and
 * `set-tier.mjs` keeps a copy the smoke test compares against this one.
 *
 * The schema checks `featured_position between 1 and 6`, so raising this
 * above 6 needs a migration first. The smoke test fails if it is.
 */
export const COUNTY_FEATURED_CAP = 6;
/** Highest `featured_position` the database will currently accept. */
export const COUNTY_POSITION_LIMIT = 6;
/**
 * How many featured positions the county page shows while spots are open.
 * Below the cap on purpose, and even, for the same reasons as the city
 * targets above.
 */
export const COUNTY_FEATURED_TARGET = 4;

/**
 * How many city pages one featured listing may name. Decided 2026-09-12:
 * $50/month buys the county page plus up to three city pages the inspector
 * chooses, which is a home base and the two or three towns next to it. More
 * than three is a conversation, not a checkbox. set-tier.mjs enforces it.
 */
export const MAX_FEATURED_CITIES = 3;

export interface CityPage {
  county: string;
  city: string;
  slug: string;
  /** Listings whose mailing city this is, in the county page's order. */
  listings: Listing[];
}

/**
 * Every city in a county's listings that clears the page threshold, sorted by
 * name. Built from the same listings the county page renders, so the set of
 * city links and the set of city pages can never disagree.
 */
export function cityPagesFor(county: string, listings: Listing[]): CityPage[] {
  const byCity = new Map<string, Listing[]>();
  for (const l of listings) {
    if (l.county !== county) continue;
    byCity.set(l.city, [...(byCity.get(l.city) ?? []), l]);
  }
  return [...byCity]
    .filter(([, rows]) => rows.length >= MIN_CITY_LISTINGS)
    .map(([city, rows]) => ({ county, city, slug: slugify(city), listings: rows }))
    .sort((a, b) => a.city.localeCompare(b.city));
}

/** Site-relative path to a city page, whether or not one is built. */
export function cityPath(county: string, city: string): string {
  return `/fl/${county}/${slugify(city)}/`;
}

/**
 * The cities a featured listing is featured in. Set by set-tier.mjs --cities;
 * a featured listing with none set is featured in its own city, so a spot
 * bought before city pages existed still lands somewhere.
 */
export function featuredCities(l: Listing): string[] {
  const set = l.featured_cities ?? [];
  return set.length > 0 ? set : [l.city];
}
