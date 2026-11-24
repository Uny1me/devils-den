// End-to-end: a real server on a random port, four WebSocket "players".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';

let srv, url;
before(async () => { srv = await startServer(0); url = `ws://localhost:${srv.port}`; });
after(() => { for (const c of srv.wss.clients) c.terminate(); srv.wss.close(); srv.server.close(); });

function client() {
  const ws = new WebSocket(url);
  const msgs = [];
  const waiters = [];
  ws.on('message', raw => {
    const m = JSON.parse(raw); msgs.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  const next = (pred, ms = 2000) => {
    const found = msgs.find(pred);
    if (found) { msgs.splice(msgs.indexOf(found), 1); return Promise.resolve(found); }
    return new Promise((resolve, reject) => {
      const w = { pred, resolve: m => { msgs.splice(msgs.indexOf(m), 1); clearTimeout(timer); resolve(m); } };
      const timer = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error('timed out waiting for message')); }, ms);
      waiters.push(w);
    });
  };
  const send = m => ws.send(JSON.stringify(m));
  const open = new Promise(r => ws.once('open', r));
  const latestRoom = () => [...msgs].reverse().find(m => m.t === 'room')?.room;
  return { ws, send, next, open, msgs, latestRoom };
}
const settle = () => new Promise(r => setTimeout(r, 120));

test('serves the page and the shared files', async () => {
  const base = `http://localhost:${srv.port}`;
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/app.js')).status, 200);
  assert.equal((await fetch(base + '/shared/settings.js')).status, 200);
  for (const path of ['/../server/room.js', '/shared/%2e%2e/server/room.js', '/shared/..%2fserver/room.js', '/..%2fpackage.json']) {
    assert.ok([403, 404].includes((await fetch(base + path)).status), `${path} must not be served`);
  }
});

test('four players: create, join, set a playlist, start', async () => {
  const host = client(); await host.open;
  host.send({ t: 'create', name: 'Mina', look: { hair: 'bob' } });
  const { code } = await host.next(m => m.t === 'joined');
  assert.match(code, /^[A-Z]{4}$/);

  const guests = [client(), client(), client()];
  for (const [i, g] of guests.entries()) {
    await g.open;
    g.send({ t: 'join', code: code.toLowerCase(), name: `Guest ${i + 1}`, look: {} });
    await g.next(m => m.t === 'joined');
  }
  await settle();
  assert.equal(host.latestRoom().players.length, 4);

  const bad = client(); await bad.open;
  bad.send({ t: 'join', code: 'ZZZZ', name: 'X' });
  assert.equal((await bad.next(m => m.t === 'error')).code, 'no-room');

  guests[0].send({ t: 'playlist', playlist: [{ game: 'cube-count', difficulty: 'easy', length: 'short' }] });
  assert.match((await guests[0].next(m => m.t === 'error')).text, /Only the host/);

  host.send({ t: 'playlist', playlist: [{ game: 'cube-count', difficulty: 'easy', length: 'short' }] });
  await settle();
  const seen = guests[2].latestRoom();
  assert.deepEqual(seen.playlist.map(e => e.game), ['cube-count']);
  assert.equal(seen.startProblem, null);

  host.send({ t: 'start' });
  await settle();
  for (const c of [host, ...guests]) assert.equal(c.latestRoom().night.stage, 'intro');

  // host skips the intro; round 1 opens with the look phase, and nobody is sent the count
  host.send({ t: 'skip' });
  await settle();
  const look = guests[0].latestRoom().night.round;
  assert.equal(look.phase, 'look');
  assert.ok(look.view.cubes.length > 0);
  assert.ok(!('count' in look.view) && !('heights' in look.view));

  guests[1].send({ t: 'answer', value: 9 });
  assert.match((await guests[1].next(m => m.t === 'error')).text, /aren’t open/);
  for (const c of [host, ...guests, bad]) c.ws.close();
});

test('a dropped player gets their seat back with their token', async () => {
  const a = client(); await a.open;
  a.send({ t: 'create', name: 'Host' });
  const { code } = await a.next(m => m.t === 'joined');
  const b = client(); await b.open;
  b.send({ t: 'join', code, name: 'Sol' });
  const joined = await b.next(m => m.t === 'joined');
  b.ws.close();
  await settle();
  assert.equal(a.latestRoom().players.find(p => p.id === joined.id).connected, false);

  const b2 = client(); await b2.open;
  b2.send({ t: 'join', code, token: joined.token, name: 'ignored' });
  const again = await b2.next(m => m.t === 'joined');
  assert.equal(again.id, joined.id);
  await settle();
  assert.equal(a.latestRoom().players.length, 2);
  assert.equal(a.latestRoom().players.find(p => p.id === joined.id).name, 'Sol');
  a.ws.close(); b2.ws.close();
});
