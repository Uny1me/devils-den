import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Night, rank } from '../server/engine.js';
import { RoomError } from '../server/errors.js';

// Manual clock: timers never fire on their own; tests call next() or fire() instead.
function fakeTimers() {
  let pending = null;
  return { set: (fn, ms) => (pending = { fn, ms }), clear: () => { pending = null; }, fire: () => pending?.fn(), get pending() { return pending; } };
}
const make = (playlist, ids = [1, 2, 3], active = ids) => {
  const timers = fakeTimers();
  let changes = 0;
  const night = new Night({ playlist, playerIds: ids, activeIds: () => active, timers, onChange: () => changes++ });
  return { night, timers, changes: () => changes };
};
const cube = (length = 'short', difficulty = 'easy') => ({ game: 'cube-count', difficulty, length });

test('rank shares places on ties', () => {
  assert.deepEqual(rank([[1, 5], [2, 9], [3, 5], [4, 0]]).map(r => [r.id, r.place]), [[2, 1], [1, 2], [3, 2], [4, 4]]);
});

test('a full short game: intro, 3 rounds of look/answer/reveal, standings, final', () => {
  const { night, timers } = make([cube('short')]);
  night.begin();
  assert.equal(night.stage, 'intro');
  assert.equal(timers.pending.ms, 15000);
  const seen = [];
  timers.fire(); // intro over
  while (night.stage === 'play') { seen.push(`${night.ri + 1}:${night.phase.id}`); timers.fire(); }
  assert.deepEqual(seen, ['1:look', '1:answer', '1:reveal', '2:look', '2:answer', '2:reveal', '3:look', '3:answer', '3:reveal']);
  assert.equal(night.stage, 'standings');
  timers.fire();
  assert.equal(night.stage, 'final');
  assert.equal(timers.pending, null);
});

test('answers: only during the answer phase, once each; all answered ends the phase early', () => {
  const { night } = make([cube()], [1, 2]);
  night.begin(); night.next(); // -> look
  assert.throws(() => night.input(1, 5), RoomError);
  night.next(); // -> answer
  night.input(1, night.round.count);
  assert.throws(() => night.input(1, 3), /already locked/);
  assert.throws(() => night.input(9, 3), /joined after/);
  assert.equal(night.phase.id, 'answer');
  night.input(2, night.round.count + 50);
  assert.equal(night.phase.id, 'reveal', 'moved on without waiting for the timer');
  assert.equal(night.stateFor(1).round.points[1], 3);
  assert.equal(night.stateFor(1).round.points[2], 0);
});

test('a player who is away doesn’t hold up the answer phase', () => {
  const { night } = make([cube()], [1, 2], [1]);
  night.begin(); night.next(); night.next();
  night.input(1, 10);
  assert.equal(night.phase.id, 'reveal');
});

test('the last round counts double and placings turn into pieces', () => {
  const { night } = make([cube('short')], [1, 2, 3]);
  night.begin(); night.next();
  for (let r = 0; r < 3; r++) {
    night.next(); // look -> answer
    night.input(1, night.round.count);     // exact: 3 (6 in the final round)
    night.input(2, night.round.count + 40); // 0
    night.input(3, night.round.count + 40); // 0
    night.next(); // reveal -> next round / standings
  }
  assert.equal(night.stage, 'standings');
  assert.equal(night.gameScores.get(1), 3 + 3 + 6);
  const st = night.stateFor(2).standings.ranking;
  assert.deepEqual(st.map(r => [r.id, r.place, r.pieces]), [[1, 1, 3], [2, 2, 2], [3, 2, 2]]);
});

test('two games in a row keep pieces across the night', () => {
  const { night } = make([cube('short', 'easy'), cube('short', 'hard')], [1, 2]);
  night.playlist[1].game = 'cube-count';
  night.begin();
  let guard = 0;
  while (night.stage !== 'final' && guard++ < 100) night.next();
  assert.equal(night.stage, 'final');
  assert.equal(night.results.length, 2);
  assert.equal(night.pieces.get(1) + night.pieces.get(2), 12); // nobody answered: everyone ties for 1st twice
});

test('state sent to players never includes the count before the reveal', () => {
  const { night } = make([cube()]);
  night.begin(); night.next();
  const look = JSON.stringify(night.stateFor(1));
  assert.ok(!look.includes('"count"') && !look.includes('"heights"'));
  night.next();
  assert.deepEqual(night.stateFor(1).round.view, {});
});

test('skip only works on intro and standings', () => {
  const { night } = make([cube()]);
  night.begin();
  night.skip();
  assert.equal(night.stage, 'play');
  assert.throws(() => night.skip(), /only skip/);
});
