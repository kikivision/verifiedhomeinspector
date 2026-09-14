import type { Listing } from './supabase';
import { slugify } from './slug';

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
 * How many "featured spots open" cards an empty city page draws. Below the
 * cap on purpose, same as the county page: the copy states the ceiling, the
 * page does not draw six dashed boxes to prove it.
 */
export const CITY_FEATURED_TARGET = 4;

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
