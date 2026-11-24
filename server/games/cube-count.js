// Cube Count: a heightmap of stacked cubes. Look (and turn it), answer how many, reveal.
import { randomInt } from 'node:crypto';
import { RoomError } from '../errors.js';

export const ANSWER_SECS = 15;
export const REVEAL_SECS = 15;
export const inputPhase = 'answer';

const secureRandom = () => randomInt(0, 1_000_000) / 1_000_000;

export function phases(d) {
  return [{ id: 'look', secs: d.lookSecs }, { id: 'answer', secs: ANSWER_SECS }, { id: 'reveal', secs: REVEAL_SECS }];
}

export const countOf = heights => heights.flat().reduce((a, b) => a + b, 0);

// Random heights, tallest toward the middle (so turning it matters), kept only if the total is in range.
export function generate(d, rand = secureRandom) {
  const { grid: n, maxHeight: H, cubes: [lo, hi] } = d;
  const mid = (n - 1) / 2;
  for (let tries = 0; tries < 5000; tries++) {
    const heights = Array.from({ length: n }, (_, j) => Array.from({ length: n }, (_, i) => {
      const edge = Math.max(Math.abs(i - mid), Math.abs(j - mid)) / (mid || 1); // 0 in the middle, 1 at the edge
      const h = Math.round(H * (1 - edge) + 0.6 + (rand() * 2 - 1) * 1.2);
      return Math.max(0, Math.min(H, h));
    }));
    const total = countOf(heights);
    const filled = heights.flat().filter(h => h > 0).length;
    if (total >= lo && total <= hi && filled >= n * 2) return heights;
  }
  throw new Error(`Could not generate a structure for ${JSON.stringify(d)}`);
}

// Cubes with at least one face showing (top, or a side next to a shorter column).
// These are what a screen needs to draw the structure from any angle; buried cubes are left out.
export function exposedCubes(heights) {
  const n = heights.length, h = (i, j) => (i < 0 || j < 0 || i >= n || j >= n ? 0 : heights[j][i]);
  const out = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) for (let k = 0; k < heights[j][i]; k++) {
    const top = k === heights[j][i] - 1;
    const side = h(i + 1, j) <= k || h(i - 1, j) <= k || h(i, j + 1) <= k || h(i, j - 1) <= k;
    if (top || side) out.push([i, j, k]);
  }
  return out;
}

export function newRound(d) {
  const heights = generate(d);
  return { heights, count: countOf(heights), cubes: exposedCubes(heights), grid: d.grid, turning: d.turning };
}

export function parseInput(value) {
  const n = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim())) ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new RoomError('Type a whole number between 0 and 999.');
  return n;
}

// Exact 3, within 5% 2, within 10% 1 (at least 1 and 2 cubes off, so small structures still give partial credit).
export function points(count, guess) {
  if (guess == null) return 0;
  const off = Math.abs(guess - count);
  if (off === 0) return 3;
  if (off <= Math.max(1, Math.round(count * 0.05))) return 2;
  if (off <= Math.max(2, Math.round(count * 0.1))) return 1;
  return 0;
}

export function score(round, answers) {
  return new Map([...answers].map(([id, guess]) => [id, points(round.count, guess)]));
}

export function view(round, phaseId, { answers }) {
  if (phaseId === 'look') return { grid: round.grid, turning: round.turning, cubes: round.cubes };
  if (phaseId === 'answer') return {};
  return { grid: round.grid, turning: round.turning, heights: round.heights, count: round.count, guesses: Object.fromEntries(answers) };
}
