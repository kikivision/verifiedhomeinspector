// The "Verified on Verified Home Inspector" badge, one SVG per claimed
// listing, built as a static file at /badge/HI7816.svg.
//
// An inspector pastes a snippet on their own website that shows this image
// and links to their page here. That link is the point: it is a backlink
// from a relevant Florida local-business site to a page on this one, and a
// few hundred of them is how a directory earns the authority to rank.
//
// Only claimed and featured listings get one. An unclaimed inspector has no
// page worth linking to and nobody to paste the snippet, and building 1,274
// SVGs for the 1,270 that would never be used is waste.
//
// Static and per license rather than one shared image with a query string,
// so the license number on the badge is the one on the page it links to and
// the file is cached like any other asset.
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
  <path d="M27 12l11 4.7v9.4c0 7.8-5.5 13.3-11 15.6-5.5-2.3-11-7.8-11-15.6v-9.4z" fill="none" stroke="#E8A93A" stroke-width="2" stroke-linejoin="round"/>
  <path d="M22 27l3.5 3.5L33 23" fill="none" stroke="#E8A93A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="50" y="21" font-family="Georgia, 'Times New Roman', serif" font-size="9" letter-spacing="1.2" fill="#B9C4CC">VERIFIED ON</text>
  <text x="50" y="38" font-family="Georgia, 'Times New Roman', serif" font-size="15" fill="#FCFBF6">Verified<tspan fill="#E8A93A" font-style="italic">Home Inspector</tspan></text>
  <text x="50" y="53" font-family="Arial, Helvetica, sans-serif" font-size="9.5" fill="#B9C4CC">FL Lic #${license} · Active</text>
</svg>
`;
  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
  });
};
