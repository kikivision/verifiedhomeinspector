// The "Verified on Verified Home Inspector" badge, one SVG per claimed
// listing, built as a static file at /badge/HI7816.svg.
//
// An inspector pastes a snippet on their own website that shows this image
// and links to their page here. That link is the point: it is a backlink
// from a relevant Florida local-business site to a page on this one, and a
// few hundred of them is how a directory earns the authority to rank.
//
// Only claimed and featured listings get one. An unclaimed inspector has no
// page worth linking to and nobody to paste the snippet, and building 7,000
// SVGs for the ones that would never be used is waste.
//
// Static and per license rather than one shared image with a query string,
// so the license number on the badge is the one on the page it links to and
// the file is cached like any other asset.
//
// The mark is the site's own — the mustard house, tile-less because the
// badge ground is already navy — not a shield with a check. The first version
// drew a shield; it looked like every security company's badge and nothing
// like the site. See public/brand/.
import type { APIRoute, GetStaticPaths } from 'astro';
import { counties } from '../../lib/counties';
import { getAllListings, isClaimed } from '../../lib/supabase';
import { badgeSvg } from '../../lib/badge';

export const getStaticPaths: GetStaticPaths = async () => {
  const live = counties.filter((c) => c.status === 'live').map((c) => c.slug);
  const listings = await getAllListings(live);
  return listings
    .filter(isClaimed)
    .map((l) => ({ params: { license: l.license_number }, props: { license: l.license_number } }));
};

export const GET: APIRoute = ({ props }) => {
  return new Response(badgeSvg(String(props.license)), {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
  });
};
