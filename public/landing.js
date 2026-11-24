// Landing page: theme switch, quick join, and a little room of players wandering around.
import { initTheme } from '/theme.js';
import { characterShapes } from '/shared/character.js';
import { SHIRTS, HAIR_STYLES, ROOM } from '/shared/settings.js';
import { drawCubes, EDGE } from '/games/cube-view.js';

// Old invite links pointed at /?room=CODE; send them to the game.
const linked = new URLSearchParams(location.search).get('room');
if (linked) location.replace(`/play?room=${encodeURIComponent(linked)}`);

initTheme(document.getElementById('theme'));

// ---------- quick join ----------
const form = document.getElementById('joinform'), input = document.getElementById('joincode'), hint = document.getElementById('joinhint');
input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM.codeLength); });
form.addEventListener('submit', e => {
  e.preventDefault();
  if (input.value.length !== ROOM.codeLength) {
    hint.textContent = `Room codes are ${ROOM.codeLength} letters. Ask your host for theirs.`;
    hint.classList.add('bad');
    input.focus();
    return;
  }
  location.href = `/play?room=${input.value}`;
});

// ---------- the stage ----------
const svg = document.getElementById('stage');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const A = 430, B = 215, CY = 250; // floor diamond: half-width, half-height, centre y
const P = (u, v) => [(u - v) * A / 2, CY + (u + v) * B / 2];
const LIMIT = 0.86;
const PROP = { u: -0.05, v: -0.12, r: 0.42 }; // the cube stack in the middle of the room
const LINES = ['21. Definitely 21.', 'Who picked F?', 'Trust me.', 'That was a Queen…', 'Double points!', 'I saw the back side.', 'Count the bottom!', 'Lock it in.'];

const floor = () => {
  let grid = '';
  for (let t = -1; t <= 1.001; t += 0.25) {
    const [a1, b1] = P(t, -1), [a2, b2] = P(t, 1), [c1, d1] = P(-1, t), [c2, d2] = P(1, t);
    grid += `M${a1} ${b1} L${a2} ${b2} M${c1} ${d1} L${c2} ${d2} `;
  }
  const T = 18;
  return `<g class="floor">
    <path d="M${-A} ${CY} L0 ${CY + B} L0 ${CY + B + T} L${-A} ${CY + T} Z" style="fill:var(--line-strong)"/>
    <path d="M${A} ${CY} L0 ${CY + B} L0 ${CY + B + T} L${A} ${CY + T} Z" style="fill:var(--line)"/>
    <path d="M0 ${CY - B} L${A} ${CY} L0 ${CY + B} L${-A} ${CY} Z" style="fill:var(--stone)"/>
    <path d="${grid}" style="fill:none;stroke:var(--ink);stroke-opacity:.12;stroke-width:1"/>
    <path d="M0 ${CY - B} L${A} ${CY} L${A} ${CY + T} L0 ${CY + B + T} L${-A} ${CY + T} L${-A} ${CY} Z M${-A} ${CY} L0 ${CY + B} L${A} ${CY} M0 ${CY + B} V${CY + B + T}" style="fill:none;stroke:var(--ink);stroke-width:2.4;stroke-linejoin:round"/>
  </g>`;
};

const [px, py] = P(PROP.u, PROP.v);
const propSVG = `<g class="prop" style="stroke:${EDGE};stroke-width:1.6;stroke-linejoin:round">${drawCubes([[2, 3, 2], [2, 4, 2], [1, 2, 1]], Math.PI / 4, Math.PI / 6, 40, px, py + 22)}</g>`;

const rand = (a, b) => a + Math.random() * (b - a);
const free = () => { // a random spot on the floor, away from the cube stack
  for (;;) {
    const u = rand(-LIMIT, LIMIT), v = rand(-LIMIT, LIMIT);
    if (Math.hypot(u - PROP.u, v - PROP.v) > PROP.r) return { u, v };
  }
};

const walkers = Array.from({ length: 8 }, (_, i) => {
  const at = free();
  return {
    ...at, to: free(), wait: rand(0, 2), dir: 1, moving: false,
    look: { hair: HAIR_STYLES[i % HAIR_STYLES.length], hairColor: (i * 5) % 6, skin: (i * 3) % 5 },
    shirt: SHIRTS[(i * 7) % SHIRTS.length],
  };
});

svg.innerHTML = floor() + '<g id="actors"></g>';
const actors = svg.querySelector('#actors');
const prop = document.createElementNS('http://www.w3.org/2000/svg', 'g');
prop.innerHTML = propSVG;
for (const w of walkers) {
  w.el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  w.el.setAttribute('class', 'walker still');
  w.el.innerHTML = `<g class="flip"><g transform="scale(1.15)">${characterShapes(w.look, w.shirt, { state: 'walk' })}</g></g><g class="bubble"></g>`;
  w.flip = w.el.querySelector('.flip');
  w.bubble = w.el.querySelector('.bubble');
}

function place(w) {
  const [x, y] = P(w.u, w.v);
  w.x = x; w.y = y;
  w.el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  w.flip.setAttribute('transform', `scale(${w.dir} 1)`);
}

function sortDepth() { // nearer (lower on screen) drawn last; the cube stack sorts by its front edge
  const items = [...walkers.map(w => [w.y, w.el]), [py + 70, prop]].sort((a, b) => a[0] - b[0]);
  for (const [, el] of items) actors.appendChild(el);
}

function step(w, dt) {
  if (w.wait > 0) { w.wait -= dt; if (w.moving) { w.moving = false; w.el.classList.add('still'); } return; }
  const du = w.to.u - w.u, dv = w.to.v - w.v, dist = Math.hypot(du, dv);
  if (dist < 0.02) { w.wait = rand(0.6, 3.2); w.to = free(); return; }
  if (!w.moving) { w.moving = true; w.el.classList.remove('still'); }
  const speed = 0.16;
  let nu = w.u + du / dist * speed * dt, nv = w.v + dv / dist * speed * dt;
  const pd = Math.hypot(nu - PROP.u, nv - PROP.v); // slide around the cube stack
  if (pd < PROP.r) { nu = PROP.u + (nu - PROP.u) / pd * PROP.r; nv = PROP.v + (nv - PROP.v) / pd * PROP.r; }
  const screenDx = (nu - nv) - (w.u - w.v);
  if (Math.abs(screenDx) > 1e-4) w.dir = screenDx < 0 ? -1 : 1;
  w.u = nu; w.v = nv;
}

let lastBubble = 0;
function say(now) {
  if (now - lastBubble < 2600) return;
  lastBubble = now;
  const w = walkers[Math.floor(Math.random() * walkers.length)];
  const text = LINES[Math.floor(Math.random() * LINES.length)];
  const wpx = text.length * 7.4 + 22;
  w.bubble.innerHTML = `<g class="say"><rect x="${-wpx / 2 + 1.5}" y="-128.5" width="${wpx}" height="28" rx="14" style="fill:var(--drop)"/>
    <rect x="${-wpx / 2}" y="-131" width="${wpx}" height="28" rx="14" style="fill:var(--sheet);stroke:var(--ink);stroke-width:2"/>
    <text x="0" y="-112" text-anchor="middle" style="fill:var(--ink);font:700 12.5px var(--font)">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></g>`;
  setTimeout(() => { w.bubble.innerHTML = ''; }, 2300);
}

walkers.forEach(place);
sortDepth();

if (!reduced) {
  let prev = performance.now();
  const frame = now => {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    for (const w of walkers) { step(w, dt); place(w); }
    sortDepth();
    say(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
