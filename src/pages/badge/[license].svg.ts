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

export const getStaticPaths: GetStaticPaths = async () => {
  const live = counties.filter((c) => c.status === 'live').map((c) => c.slug);
  const listings = await getAllListings(live);
  return listings
    .filter(isClaimed)
    .map((l) => ({ params: { license: l.license_number }, props: { license: l.license_number } }));
};

// Escaped by hand: the license is HI followed by digits, so nothing here can
// carry markup, but the number is still the one value that came from data.
function esc(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const GET: APIRoute = ({ props }) => {
  const license = esc(String(props.license));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="230" height="64" viewBox="0 0 230 64" role="img" aria-label="Verified on Verified Home Inspector, FL license ${license}">
  <rect x="0.5" y="0.5" width="229" height="63" rx="5" fill="#1D2B3A" stroke="#2C4054"/>
  <g transform="translate(12 12) scale(0.625)">
    <path d="M32,14 L51,31 L51,50 L13,50 L13,31 Z" fill="#E8A93A"/>
  </g>
  <text x="58" y="21" font-family="Georgia, 'Times New Roman', serif" font-size="9" letter-spacing="1.2" fill="#B9C4CC">VERIFIED ON</text>
  <text x="58" y="38" font-family="Georgia, 'Times New Roman', serif" font-size="15" fill="#FCFBF6">Verified<tspan fill="#E8A93A" font-style="italic">Home Inspector</tspan></text>
  <text x="58" y="53" font-family="Arial, Helvetica, sans-serif" font-size="9.5" fill="#B9C4CC">FL Lic #${license} · Active</text>
</svg>
`;
  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
  });
};
