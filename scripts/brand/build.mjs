#!/usr/bin/env node
// Builds the Verified Home Inspector logo set and every branded asset the
// site serves, from one definition of the mark.
//
//   npm run brand
//
// Writes:
//   public/brand/*            the logo set (SVG + PNG), served at /brand/
//   public/favicon.svg        the mark, 64px box (the source of the tile color)
//   public/favicon.ico        16 / 32 / 48, PNG-in-ICO
//   public/apple-touch-icon.png  180px, full-bleed tile (iOS paints its own corners)
//   public/og-image.png       1200x630 share image
//
// The mark is a mustard house on a tile of TILE blue. The wordmark is
// Fraunces Medium ("Verified") + Fraunces Medium Italic ("Home Inspector"),
// outlined to paths with opentype.js so every SVG is self-contained and opens
// the same in Illustrator, Canva, a browser or a print shop with no font
// installed. PNGs are rasterized from those SVGs with sharp (already a
// dependency through Astro), so vector and raster never drift.
//
// The fonts in ./fonts are the static instances Google Fonts serves; all four
// are OFL. scripts/og-image.html is the layout the share image reproduces,
// kept as a reference.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const opentype = require('opentype.js');
const sharp = require('sharp');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PUBLIC = join(ROOT, 'public');
const OUT = join(PUBLIC, 'brand');
mkdirSync(OUT, { recursive: true });

// ---- tokens ------------------------------------------------------------------
// From src/styles/global.css, plus the tile blue, which is the mark's own.
const NAVY = '#1D2B3A';
// The house is mustard on every ground; on navy the tile is dropped and the
// house stands alone. TILE itself lives in tokens.mjs so /brand/ can read it.
import { TILE } from './tokens.mjs';
const MUSTARD = '#E8A93A';
const MUSTARD_DEEP = '#C6871E';
const PAPER_RAISED = '#FCFBF6';
const WHITE = '#FFFFFF';
const MUTED = '#B9C4CC';

const fraunces = opentype.loadSync(join(HERE, 'fonts', 'Fraunces-Medium.ttf'));
const frauncesItalic = opentype.loadSync(join(HERE, 'fonts', 'Fraunces-MediumItalic.ttf'));
const plex = opentype.loadSync(join(HERE, 'fonts', 'IBMPlexSans-Regular.ttf'));
const plexSemi = opentype.loadSync(join(HERE, 'fonts', 'IBMPlexSans-SemiBold.ttf'));

// ---- the mark, in a 64-unit box --------------------------------------------
const HOUSE = 'M32,14 L51,31 L51,50 L13,50 L13,31 Z';
function markInner({ tile, house }) {
  return (
    (tile ? `<rect x="1" y="1" width="62" height="62" rx="13" fill="${tile}"/>` : '') +
    `<path d="${HOUSE}" fill="${house}"/>`
  );
}
function markSvg(opts, size = 64) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="Verified Home Inspector">\n  ${markInner(opts)}\n</svg>\n`;
}

// ---- text as paths ---------------------------------------------------------------
function textPath(font, text, size, x, y, letterSpacing = 0) {
  const scale = size / font.unitsPerEm;
  let cursor = x;
  const parts = [];
  const glyphs = font.stringToGlyphs(text);
  for (let i = 0; i < glyphs.length; i += 1) {
    const g = glyphs[i];
    const d = g.getPath(cursor, y, size).toPathData(3);
    if (d) parts.push(d);
    let adv = g.advanceWidth * scale;
    if (i < glyphs.length - 1) adv += font.getKerningValue(g, glyphs[i + 1]) * scale;
    cursor += adv + letterSpacing;
  }
  return { d: parts.join(' '), width: cursor - x };
}

/** Lays a paragraph out on lines no wider than maxWidth; returns path + line count. */
function paragraphPath(font, text, size, x, y, maxWidth, lineHeight, letterSpacing = 0) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (textPath(font, trial, size, 0, 0, letterSpacing).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  const d = lines.map((l, i) => textPath(font, l, size, x, y + i * lineHeight, letterSpacing).d).join(' ');
  return { d, lines: lines.length };
}

/** "Verified" upright + "Home Inspector" italic, set as one word with a color change. */
function wordmark({ size, mainColor, accentColor, x = 0, baseline }) {
  const a = textPath(fraunces, 'Verified', size, x, baseline, -size * 0.01);
  const b = textPath(frauncesItalic, 'Home Inspector', size, x + a.width, baseline, -size * 0.01);
  return {
    svg: `<path d="${a.d}" fill="${mainColor}"/>\n  <path d="${b.d}" fill="${accentColor}"/>`,
    width: a.width + b.width,
  };
}

// ---- lockups --------------------------------------------------------------------
function horizontal({ bg, mainColor, accentColor, tile, house, name }) {
  const size = 56, markSize = 72, gap = 18, pad = 24;
  const baseline = pad + markSize / 2 + size * 0.34;
  const wm = wordmark({ size, mainColor, accentColor, x: pad + markSize + gap, baseline });
  const w = Math.ceil(pad + markSize + gap + wm.width + pad);
  const h = pad * 2 + markSize;
  const bgRect = bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>\n  ` : '';
  return { name, w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Verified Home Inspector">\n  ${bgRect}<g transform="translate(${pad} ${pad}) scale(${markSize / 64})">${markInner({ tile, house })}</g>\n  ${wm.svg}\n</svg>\n` };
}

function stacked({ bg, mainColor, accentColor, tile, house, name }) {
  const size = 40, markSize = 120, pad = 32, gap = 22;
  const wm0 = wordmark({ size, mainColor, accentColor, x: 0, baseline: 0 });
  const w = Math.ceil(Math.max(wm0.width, markSize) + pad * 2);
  const h = Math.ceil(pad + markSize + gap + size * 1.1 + pad * 0.6);
  const wm = wordmark({ size, mainColor, accentColor, x: (w - wm0.width) / 2, baseline: pad + markSize + gap + size * 0.78 });
  const bgRect = bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>\n  ` : '';
  return { name, w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Verified Home Inspector">\n  ${bgRect}<g transform="translate(${(w - markSize) / 2} ${pad}) scale(${markSize / 64})">${markInner({ tile, house })}</g>\n  ${wm.svg}\n</svg>\n` };
}

function wordmarkOnly({ bg, mainColor, accentColor, name }) {
  const size = 64, pad = 20;
  const wm = wordmark({ size, mainColor, accentColor, x: pad, baseline: pad + size * 0.78 });
  const w = Math.ceil(wm.width + pad * 2);
  const h = Math.ceil(size * 1.05 + pad * 2);
  const bgRect = bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>\n  ` : '';
  return { name, w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Verified Home Inspector">\n  ${bgRect}${wm.svg}\n</svg>\n` };
}

// ---- the set --------------------------------------------------------------------
const written = [];
function write(dir, name, data) {
  writeFileSync(join(dir, name), data);
  written.push(name);
}

write(OUT, 'mark.svg', markSvg({ tile: TILE, house: MUSTARD }));
write(OUT, 'mark-no-tile.svg', markSvg({ tile: null, house: MUSTARD }));
write(OUT, 'mark-mono-navy.svg', markSvg({ tile: null, house: NAVY }));
write(OUT, 'mark-mono-white.svg', markSvg({ tile: null, house: WHITE }));

const lockups = [
  horizontal({ bg: null, mainColor: NAVY, accentColor: MUSTARD_DEEP, tile: TILE, house: MUSTARD, name: 'logo-horizontal.svg' }),
  horizontal({ bg: NAVY, mainColor: PAPER_RAISED, accentColor: MUSTARD, tile: null, house: MUSTARD, name: 'logo-horizontal-reverse.svg' }),
  horizontal({ bg: null, mainColor: NAVY, accentColor: NAVY, tile: null, house: NAVY, name: 'logo-horizontal-mono-navy.svg' }),
  horizontal({ bg: null, mainColor: WHITE, accentColor: WHITE, tile: null, house: WHITE, name: 'logo-horizontal-mono-white.svg' }),
  stacked({ bg: null, mainColor: NAVY, accentColor: MUSTARD_DEEP, tile: TILE, house: MUSTARD, name: 'logo-stacked.svg' }),
  stacked({ bg: NAVY, mainColor: PAPER_RAISED, accentColor: MUSTARD, tile: null, house: MUSTARD, name: 'logo-stacked-reverse.svg' }),
  wordmarkOnly({ bg: null, mainColor: NAVY, accentColor: MUSTARD_DEEP, name: 'wordmark.svg' }),
  wordmarkOnly({ bg: NAVY, mainColor: PAPER_RAISED, accentColor: MUSTARD, name: 'wordmark-reverse.svg' }),
];
for (const l of lockups) write(OUT, l.name, l.svg);

async function png(svg, outDir, name, width, bg) {
  let img = sharp(Buffer.from(svg), { density: 384 }).resize({ width });
  if (bg) img = img.flatten({ background: bg });
  await img.png().toFile(join(outDir, name));
  written.push(name);
}
const read = (name) => readFileSync(join(OUT, name), 'utf8');

await png(read('mark.svg'), OUT, 'mark-512.png', 512);
await png(read('mark.svg'), OUT, 'mark-1024.png', 1024);
await png(read('mark-mono-white.svg'), OUT, 'mark-mono-white-512.png', 512);
await png(read('logo-horizontal.svg'), OUT, 'logo-horizontal-1200.png', 1200);
await png(read('logo-horizontal.svg'), OUT, 'logo-horizontal-2400.png', 2400);
await png(read('logo-horizontal-reverse.svg'), OUT, 'logo-horizontal-reverse-1200.png', 1200);
await png(read('logo-stacked.svg'), OUT, 'logo-stacked-800.png', 800);
await png(read('logo-stacked-reverse.svg'), OUT, 'logo-stacked-reverse-800.png', 800);
await png(read('wordmark.svg'), OUT, 'wordmark-1200.png', 1200);

// Square avatar for social profiles and Stripe: full-bleed tile, house centred
// with room around it, because platforms crop to circles.
const avatarSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="1024" height="1024"><rect width="64" height="64" fill="${TILE}"/><g transform="translate(8 8) scale(0.75)"><path d="${HOUSE}" fill="${MUSTARD}"/></g></svg>\n`;
write(OUT, 'avatar-square.svg', avatarSvg);
await png(avatarSvg, OUT, 'avatar-1024.png', 1024);

// ---- the site's own icons --------------------------------------------------------
// favicon.svg keeps its hand-written comment; only the tile color is asserted.
{
  const p = join(PUBLIC, 'favicon.svg');
  const current = readFileSync(p, 'utf8');
  if (!current.includes(`fill="${TILE}"`)) {
    throw new Error(`public/favicon.svg tile is not ${TILE}; edit it (and its comment) by hand so the two never disagree.`);
  }
}

// apple-touch-icon: iOS rounds the corners itself, so a full-bleed tile.
await png(avatarSvg, PUBLIC, 'apple-touch-icon.png', 180);

// favicon.ico: 16, 32 and 48, each a PNG inside the ICO container, which every
// browser since IE9 reads. The 16px one is the mark as drawn — the smoke
// test's reason for the tile color.
{
  const sizes = [16, 32, 48];
  const pngs = [];
  for (const s of sizes) {
    pngs.push(await sharp(Buffer.from(read('mark.svg')), { density: 384 }).resize({ width: s, height: s }).png().toBuffer());
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);
  const dirs = [];
  let offset = 6 + 16 * sizes.length;
  sizes.forEach((s, i) => {
    const d = Buffer.alloc(16);
    d.writeUInt8(s === 256 ? 0 : s, 0); // width
    d.writeUInt8(s === 256 ? 0 : s, 1); // height
    d.writeUInt8(0, 2); // palette
    d.writeUInt8(0, 3); // reserved
    d.writeUInt16LE(1, 4); // planes
    d.writeUInt16LE(32, 6); // bpp
    d.writeUInt32LE(pngs[i].length, 8);
    d.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    dirs.push(d);
  });
  write(PUBLIC, 'favicon.ico', Buffer.concat([header, ...dirs, ...pngs]));
}

// ---- share image ------------------------------------------------------------------
// The layout of scripts/og-image.html, with the text outlined. 1200x630.
{
  const W = 1200, H = 630, X = 86;
  const hex = (pts) => `<polygon points="${pts}" fill="none" stroke="${PAPER_RAISED}" stroke-opacity="0.10" stroke-width="2"/>`;
  const wm = wordmark({ size: 40, mainColor: PAPER_RAISED, accentColor: MUSTARD, x: X + 60 + 22, baseline: 0 });
  // Vertical rhythm from the HTML: the block is centred; these are its measured offsets.
  const markTop = 92;
  const wmBaseline = markTop + 30 + 40 * 0.34;
  const h1 = paragraphPath(fraunces, 'Find a licensed home inspector in Florida', 66, X, markTop + 60 + 40 + 66 * 0.78, 17 * 66 * 0.5, 66 * 1.1, -66 * 0.015);
  const pTop = markTop + 60 + 40 + h1.lines * 66 * 1.1 + 26;
  const p = paragraphPath(plex, 'Every active inspector, listed from state DBPR license records — with the license number, city, and how to reach them.', 25, X, pTop + 25 * 0.78, 44 * 25 * 0.5, 25 * 1.45);
  const ruleY = pTop + p.lines * 25 * 1.45 + 44 + 10;
  const url = textPath(plexSemi, 'verifiedhomeinspector.com', 21, X + 64 + 18, ruleY + 21 * 0.36, 21 * 0.04);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  <g transform="translate(${W - 430 + 70 - 70} -40) scale(${430 / 260})">
    ${hex('74,20 126,50 126,110 74,140 22,110 22,50')}
    ${hex('186,20 238,50 238,110 186,140 134,110 134,50')}
    ${hex('130,116 182,146 182,206 130,236 78,206 78,146')}
  </g>
  <g transform="translate(${X} ${markTop}) scale(${60 / 64})">${markInner({ tile: TILE, house: MUSTARD })}</g>
  <g transform="translate(0 ${wmBaseline})">${wm.svg}</g>
  <path d="${h1.d}" fill="${PAPER_RAISED}"/>
  <path d="${p.d}" fill="${MUTED}"/>
  <rect x="${X}" y="${ruleY}" width="64" height="1" fill="${MUSTARD}"/>
  <path d="${url.d}" fill="${MUSTARD}"/>
</svg>
`;
  write(OUT, 'share-image.svg', svg);
  await png(svg, PUBLIC, 'og-image.png', W);
}

console.log(`${written.length} files written; tile ${TILE}`);
