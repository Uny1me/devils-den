// Layered player character: legs, shirt + arms, head (skin), hair. No facial features on purpose.
// Same drawing as the blueprint, so the look stays consistent.
import { HAIR_COLORS, SKINS } from './settings.js';

const CROP = 'M-15.5 -51 C-16 -66 -7 -71 0 -71 C7 -71 16 -66 15.5 -51 C11 -57 5 -60 -1 -59 C-7 -58 -12 -55 -15.5 -51 Z';
const HAIR = {
  crop: { front: CROP },
  bob: { front: 'M-17.5 -41 C-19 -62 -10 -71 0 -71 C10 -71 19 -62 17.5 -41 C14.5 -41 12 -43 12 -47 L12 -55 C6 -59 -6 -59 -12 -55 L-12 -47 C-12 -43 -14.5 -41 -17.5 -41 Z' },
  bun: { back: '<circle cx="0" cy="-73" r="7"/>', front: CROP },
  spiky: { front: 'M-15.5 -50 L-17 -62 L-10.5 -60.5 L-9 -72 L-3 -66 L2 -76 L6 -66.5 L12.5 -71 L12 -62 L17.5 -61 L15.5 -50 C10 -57 -9 -58 -15.5 -50 Z' },
  long: { back: '<rect x="-18.5" y="-69" width="37" height="44" rx="16"/>', front: 'M-15.5 -49 C-16 -66 -7 -71 0 -71 C7 -71 16 -66 15.5 -49 C12 -55 6 -59.5 0 -62 C-6 -59.5 -12 -55 -15.5 -49 Z' },
  afro: { back: '<circle cx="0" cy="-58" r="21.5"/>', front: 'M-14.5 -54 C-13 -62 -7 -64 -3.5 -60 C-1 -65 6 -65 8 -60 C11 -63 16 -60 14.5 -54 C8 -58.5 -8 -58.5 -14.5 -54 Z' },
};

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round(r + (t - r) * p); g = Math.round(g + (t - g) * p); b = Math.round(b + (t - b) * p);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Returns the character's SVG shapes with the feet at (0, 0). Roughly 34 wide and 80 tall at scale 1.
export function characterShapes(look, shirt, { state = 'idle' } = {}) {
  const hs = HAIR[look.hair] || HAIR.crop;
  const hc = HAIR_COLORS[look.hairColor] || HAIR_COLORS[0];
  const sk = SKINS[look.skin] || SKINS[0];
  const legs = `<rect class="l1" x="-12" y="-13" width="9.5" height="13" rx="4" fill="${shade(shirt, -0.38)}"/>
    <rect class="l2" x="2.5" y="-13" width="9.5" height="13" rx="4" fill="${shade(shirt, -0.38)}"/>`;
  const body = `<rect x="-21" y="-37" width="8.5" height="19" rx="4.2" fill="${shade(shirt, -0.14)}"/>
    <rect x="12.5" y="-37" width="8.5" height="19" rx="4.2" fill="${shade(shirt, -0.14)}"/>
    <rect x="-16" y="-41" width="32" height="31" rx="12" fill="${shirt}"/>`;
  const inner = `${hs.back ? `<g fill="${hc}">${hs.back}</g>` : ''}${legs}${body}
    <circle cx="0" cy="-54" r="15" fill="${sk}"/><path d="${hs.front}" fill="${hc}"/>`;
  return `<g class="chr"><ellipse class="shadow" cx="0" cy="0" rx="20" ry="6"/><g class="${state === 'walk' ? 'walk' : ''}">${inner}</g></g>`;
}

// A complete <svg> sized in CSS pixels.
export function characterSVG(look, shirt, { height = 80, state, label = 'Player character' } = {}) {
  const w = Math.round(height * 0.62);
  return `<svg class="char" width="${w}" height="${height}" viewBox="-26 -82 52 86" role="img" aria-label="${label}">${characterShapes(look, shirt, { state })}</svg>`;
}
