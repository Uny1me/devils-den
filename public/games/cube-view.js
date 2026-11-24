// Draws a Cube Count structure that players can turn: drag to spin (free mode) or use 90° buttons (both modes).
// Each frame: rotate the grid around its middle, project every cube, draw from far to near, only faces that touch air.
const GOLD = '#f2b630', EDGE = '#6b4510';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const camera = { theta: Math.PI / 4, elev: Math.PI / 6 };
export function resetCubeView() { camera.theta = Math.PI / 4; camera.elev = Math.PI / 6; }

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round(r + (t - r) * p); g = Math.round(g + (t - g) * p); b = Math.round(b + (t - b) * p);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Column heights from either the full heightmap (reveal) or the exposed cubes (look).
// Cubes never float, so a column is solid up to its highest cube.
function columnHeights(grid, { heights, cubes }) {
  if (heights) return heights;
  const h = Array.from({ length: grid }, () => Array(grid).fill(0));
  for (const [i, j, k] of cubes) h[j][i] = Math.max(h[j][i], k + 1);
  return h;
}

function draw(H, theta, elev, S, cx, cy) {
  const n = H.length, c = Math.cos(theta), s = Math.sin(theta), cE = Math.cos(elev), sE = Math.sin(elev), off = n / 2;
  const has = (i, j, k) => i >= 0 && j >= 0 && i < n && j < n && k >= 0 && k < H[j][i];
  const P = ([x, y, z]) => { const rx = x * c - y * s, ry = x * s + y * c; return [cx + rx * S, cy + (ry * sE - z * cE) * S]; };
  const depth = (x, y, z) => (x * s + y * c) * cE + z * sE;
  const cubes = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) for (let k = 0; k < H[j][i]; k++) cubes.push([i, j, k]);
  cubes.sort((A, B) => depth(A[0] + .5 - off, A[1] + .5 - off, A[2] + .5) - depth(B[0] + .5 - off, B[1] + .5 - off, B[2] + .5));
  const face = (pts, rx) => `<path d="M${pts.map(p => P(p).map(v => v.toFixed(1)).join(' ')).join(' L')} Z" fill="${rx === null ? shade(GOLD, 0.18) : shade(GOLD, -(0.05 + 0.2 * (rx + 1) / 2))}"/>`;
  let out = '';
  for (const [i, j, k] of cubes) {
    const x0 = i - off, x1 = x0 + 1, y0 = j - off, y1 = y0 + 1, z0 = k, z1 = k + 1;
    if (s > 0 && !has(i + 1, j, k)) out += face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], c);
    if (s < 0 && !has(i - 1, j, k)) out += face([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], -c);
    if (c > 0 && !has(i, j + 1, k)) out += face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], -s);
    if (c < 0 && !has(i, j - 1, k)) out += face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], s);
    if (!has(i, j, k + 1)) out += face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], null);
  }
  return out;
}

// Mounts into `el`. Returns { destroy }.
export function mountCubeView(el, { grid, turning = 'free', heights, cubes }) {
  const H = columnHeights(grid, { heights, cubes });
  const maxH = Math.max(1, ...H.flat());
  const S = Math.min(70, 210 / (grid * 0.72), 300 / (grid * 0.55 + maxH * 0.95));
  const cy = (maxH * 0.87 * S) / 2 - grid * 0.08 * S;
  const free = turning === 'free';
  el.innerHTML = `<div class="cubeview ${free ? 'free' : ''}">
      <svg viewBox="-250 -200 500 400" role="img" aria-label="Stack of cubes. ${free ? 'Drag to turn it, or use the buttons.' : 'Use the buttons to turn it.'}">
        <g style="stroke:${EDGE};stroke-width:1.6;stroke-linejoin:round" data-cubes></g>
      </svg>
      <div class="turnbar">
        <button class="btn small" data-turn="-1" aria-label="Turn a quarter turn left">⟲ 90°</button>
        <span class="muted">${free ? 'or drag to turn' : 'quarter turns only'}</span>
        <button class="btn small" data-turn="1" aria-label="Turn a quarter turn right">90° ⟳</button>
      </div>
    </div>`;
  const svg = el.querySelector('svg'), g = el.querySelector('[data-cubes]');
  const redraw = () => { g.innerHTML = draw(H, camera.theta, camera.elev, S, 0, cy); };
  redraw();

  let raf = 0, drag = null;
  const turn = dir => {
    cancelAnimationFrame(raf);
    const step = Math.PI / 2, from = camera.theta;
    const to = Math.round((from - Math.PI / 4) / step) * step + Math.PI / 4 + dir * step; // land on the diagonal views
    if (reduced) { camera.theta = to; return redraw(); }
    const t0 = performance.now();
    const tick = now => { const t = Math.min(1, (now - t0) / 380), e = 1 - (1 - t) ** 3; camera.theta = from + (to - from) * e; redraw(); if (t < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  };
  const onClick = e => { const b = e.target.closest('[data-turn]'); if (b) turn(+b.dataset.turn); };
  const down = e => { if (!free) return; drag = { x: e.clientX, y: e.clientY, t: camera.theta, el: camera.elev }; svg.setPointerCapture(e.pointerId); };
  const move = e => {
    if (!drag) return;
    const k = 500 / svg.getBoundingClientRect().width;
    camera.theta = drag.t - (e.clientX - drag.x) * k * 0.012;
    camera.elev = Math.max(0.35, Math.min(0.96, drag.el + (e.clientY - drag.y) * k * 0.005));
    redraw();
  };
  const up = () => { drag = null; };
  el.addEventListener('click', onClick);
  svg.addEventListener('pointerdown', down);
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  return {
    destroy() {
      cancelAnimationFrame(raf);
      el.removeEventListener('click', onClick);
      svg.removeEventListener('pointerdown', down);
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', up);
      svg.removeEventListener('pointercancel', up);
    },
  };
}

// "13 + 6 + 1 = 20" from a heightmap.
export function layerSummary(heights) {
  const maxH = Math.max(0, ...heights.flat());
  const layers = Array.from({ length: maxH }, (_, k) => heights.flat().filter(h => h > k).length);
  return layers.join(' + ') + ' = ' + layers.reduce((a, b) => a + b, 0);
}
