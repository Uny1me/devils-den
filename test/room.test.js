import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registry, RoomError } from '../server/room.js';
import { ROOM, SHIRTS } from '../shared/settings.js';

const inbox = () => { const msgs = []; const send = m => msgs.push(m); send.msgs = msgs; send.last = () => msgs.at(-1); return send; };
const setup = (n = 1) => {
  const reg = new Registry(), room = reg.create();
  const ps = Array.from({ length: n }, (_, i) => room.addPlayer({ name: `P${i + 1}`, look: {}, send: inbox() }));
  return { reg, room, ps };
};
const cube = { game: 'cube-count', difficulty: 'medium', length: 'standard' };
const poker = { game: 'memory-poker', difficulty: 'hard', length: 'short' };

test('room codes are 4 readable letters and unique', () => {
  const reg = new Registry();
  const codes = new Set(Array.from({ length: 200 }, () => reg.create().code));
  assert.equal(codes.size, 200);
  for (const c of codes) assert.match(c, /^[A-HJ-NP-Z]{4}$/);
});

test('lookup ignores case and spaces', () => {
  const { reg, room } = setup();
  assert.equal(reg.get(` ${room.code.toLowerCase()} `), room);
});

test('first player is host; names are made unique; colors differ', () => {
  const { room, ps } = setup(1);
  const b = room.addPlayer({ name: 'p1', look: {}, send: inbox() });
  assert.equal(room.hostId, ps[0].id);
  assert.equal(b.name, 'p1 2');
  assert.notEqual(b.color, ps[0].color);
  assert.ok(SHIRTS.includes(b.color));
});

test('blank and overlong names are cleaned', () => {
  const { room } = setup(0);
  assert.equal(room.addPlayer({ name: '   ', send: inbox() }).name, 'Player');
  assert.equal(room.addPlayer({ name: 'x'.repeat(40), send: inbox() }).name.length, ROOM.nameMax);
});

test('bad looks fall back to safe values', () => {
  const { room } = setup(0);
  const p = room.addPlayer({ name: 'A', look: { hair: '<script>', hairColor: 99, skin: -1 }, send: inbox() });
  assert.deepEqual(p.look, { hair: 'crop', hairColor: 0, skin: 0 });
});

test('room is full at the max', () => {
  const { room } = setup(ROOM.maxPlayers);
  assert.throws(() => room.addPlayer({ name: 'late', send: inbox() }), RoomError);
});

test('only the host can edit the playlist, and it is validated', () => {
  const { room, ps: [host, guest] } = setup(2);
  assert.throws(() => room.setPlaylist(guest, [cube]), /Only the host/);
  room.setPlaylist(host, [cube, poker]);
  assert.deepEqual(room.playlist, [cube, poker]);
  assert.throws(() => room.setPlaylist(host, [cube, cube]), /only be in the playlist once/);
  assert.throws(() => room.setPlaylist(host, [{ ...cube, difficulty: 'insane' }]), RoomError);
  assert.throws(() => room.setPlaylist(host, [{ ...cube, length: 'forever' }]), RoomError);
  assert.throws(() => room.setPlaylist(host, [{ game: 'chess', difficulty: 'easy', length: 'short' }]), /Unknown game/);
  assert.deepEqual(room.playlist, [cube, poker], 'a rejected edit leaves the playlist alone');
});

test('start needs at least one game and two players online', () => {
  const { room, ps: [host] } = setup(1);
  assert.equal(room.startProblem(), 'Pick at least one game.');
  room.setPlaylist(host, [cube]);
  assert.match(room.startProblem(), /at least 2 players/);
  const guest = room.addPlayer({ name: 'G', send: inbox() });
  assert.equal(room.startProblem(), null);
  assert.throws(() => room.start(guest), /Only the host/);
  room.start(host);
  assert.equal(room.phase, 'running');
  assert.throws(() => room.addPlayer({ name: 'late', send: inbox() }), /already started/);
  room.backToLobby(host);
  assert.equal(room.phase, 'lobby');
});

test('everyone gets the room state, with their own id', () => {
  const { room, ps: [a, b] } = setup(2);
  room.setPlaylist(a, [poker]);
  const sa = a.send.last(), sb = b.send.last();
  assert.equal(sa.t, 'room');
  assert.equal(sa.room.you, a.id);
  assert.equal(sb.room.you, b.id);
  assert.deepEqual(sb.room.playlist, [poker]);
  assert.ok(!('token' in sa.room.players[0]), 'tokens are never shared');
});

test('host passes on when the host disconnects, and a reconnect keeps the seat', () => {
  const { room, ps: [a, b] } = setup(2);
  room.disconnect(a);
  assert.equal(room.hostId, b.id);
  assert.equal(a.connected, false);
  const back = room.reconnect(a.token, inbox());
  assert.equal(back, a);
  assert.equal(room.hostId, b.id, 'the returning player does not take the host role back');
  assert.equal(room.reconnect('nope', inbox()), null);
});

test('the room disappears when the last player leaves', () => {
  const { reg, room, ps: [a, b] } = setup(2);
  room.removePlayer(a.id);
  assert.equal(room.hostId, b.id);
  room.removePlayer(b.id);
  assert.equal(reg.get(room.code), undefined);
});
