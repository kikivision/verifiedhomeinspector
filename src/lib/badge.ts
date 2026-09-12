/**
 * The "Verified on Verified Home Inspector" badge as SVG markup.
 *
 * One function, used twice: the build writes it to /badge/HI####.svg for each
 * claimed listing, and the dashboard draws it inline the moment a listing is
 * claimed — before the rebuild that creates the file — so the inspector sees
 * their badge rather than a broken image with the alt text showing.
 *
 * The mark is the site's own mustard house, tile-less because the badge
 * ground is already navy. See public/brand/.
 */
export function badgeSvg(license: string): string {
  // The license is HI followed by digits, so nothing here can carry markup,
  // but it is still the one value that came from data.
  const safe = license.replace(/[<>&"']/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="230" height="64" viewBox="0 0 230 64" role="img" aria-label="Verified on Verified Home Inspector, FL license ${safe}">
  <rect x="0.5" y="0.5" width="229" height="63" rx="5" fill="#1D2B3A" stroke="#2C4054"/>
  <g transform="translate(12 12) scale(0.625)">
    <path d="M32,14 L51,31 L51,50 L13,50 L13,31 Z" fill="#E8A93A"/>
  </g>
  <text x="58" y="21" font-family="Georgia, 'Times New Roman', serif" font-size="9" letter-spacing="1.2" fill="#B9C4CC">VERIFIED ON</text>
  <text x="58" y="38" font-family="Georgia, 'Times New Roman', serif" font-size="15" fill="#FCFBF6">Verified<tspan fill="#E8A93A" font-style="italic">Home Inspector</tspan></text>
  <text x="58" y="53" font-family="Arial, Helvetica, sans-serif" font-size="9.5" fill="#B9C4CC">FL Lic #${safe} · Active</text>
</svg>
`;
}
