import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../shared/settings.js';
import { generate, countOf, exposedCubes, points, parseInput, newRound, view } from '../server/games/cube-count.js';

const DIFF = GAMES['cube-count'].difficulty;

test('generated structures stay inside each difficulty’s limits', () => {
  for (const d of Object.values(DIFF)) {
    for (let i = 0; i < 200; i++) {
      const h = generate(d);
      assert.equal(h.length, d.grid);
      assert.ok(h.every(row => row.length === d.grid && row.every(x => x >= 0 && x <= d.maxHeight)));
      const c = countOf(h);
      assert.ok(c >= d.cubes[0] && c <= d.cubes[1], `${c} outside ${d.cubes}`);
    }
  }
});

test('exposed cubes leave out buried ones but keep every column top', () => {
  const h = [[1, 1, 1], [1, 3, 1], [1, 1, 1]]; // middle column: bottom cube is surrounded, so hidden
  const cubes = exposedCubes(h);
  assert.equal(cubes.length, 10); // 8 edge tops + middle cubes at k=1 and k=2
  assert.ok(!cubes.some(([i, j, k]) => i === 1 && j === 1 && k === 0));
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) assert.ok(cubes.some(c => c[0] === i && c[1] === j && c[2] === h[j][i] - 1));
});

test('scoring: exact 3, within 5% 2, within 10% 1', () => {
  assert.equal(points(20, 20), 3);
  assert.equal(points(20, 21), 2);
  assert.equal(points(20, 18), 1);
  assert.equal(points(20, 16), 0);
  assert.equal(points(60, 57), 2); // 5% of 60 = 3
  assert.equal(points(60, 54), 1); // 10% of 60 = 6
  assert.equal(points(60, 53), 0);
  assert.equal(points(7, 9), 1); // small counts still allow 1 and 2 off
  assert.equal(points(20, null), 0);
});

test('answers must be whole numbers from 0 to 999', () => {
  assert.equal(parseInput('12'), 12);
  for (const bad of [-1, 1000, 2.5, 'abc', null, '', ' ', undefined, '1e2']) assert.throws(() => parseInput(bad));
});

test('the look view never contains the count', () => {
  const r = newRound(DIFF.medium);
  const v = view(r, 'look', { answers: new Map() });
  assert.deepEqual(Object.keys(v).sort(), ['cubes', 'grid', 'turning']);
  assert.ok(v.cubes.length < r.count || r.count === v.cubes.length);
  const rev = view(r, 'reveal', { answers: new Map([[1, 5]]) });
  assert.equal(rev.count, r.count);
  assert.deepEqual(rev.guesses, { 1: 5 });
});
