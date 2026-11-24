import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { TASKS, BUTTON, SPAWN, WORLD, RULES, canStand, dist } from './map.js';

const PORT = process.env.PORT || 3000;
const TICK_MS = 50;
const PUBLIC = fileURLToPath(new URL('./public/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

// ---------- static file server ----------
const server = http.createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = '/index.html';
  const file = normalize(join(PUBLIC, path));
  if (!file.startsWith(PUBLIC.endsWith(sep) ? PUBLIC : PUBLIC + sep)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

// ---------- game state ----------
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22',
  '#1abc9c', '#ecf0f1', '#ff6fb5', '#8d6e63', '#95a5a6', '#00e5ff'];
const players = new Map(); // id -> player (insertion order = join order; first is host)
let nextId = 1;
const game = { phase: 'lobby', bodies: [], meeting: null, result: null, over: null };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const all = () => [...players.values()];
const inGame = () => all().filter(p => p.inGame);
const aliveIn = () => inGame().filter(p => p.alive);
const hostId = () => (players.size ? players.keys().next().value : null);
const send = (p, msg) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };
const broadcast = msg => all().forEach(p => send(p, msg));
const sys = text => broadcast({ t: 'sys', text });

function freeColor() {
  const used = new Set(all().map(p => p.color));
  return COLORS.find(c => !used.has(c)) || COLORS[Math.floor(Math.random() * COLORS.length)];
}

function taskProgress() {
  let done = 0, total = 0;
  for (const p of inGame()) if (p.role === 'crew') for (const t of p.tasks) { total++; if (t.done) done++; }
  return { done, total };
}

function spawnAll() {
  const ps = aliveIn();
  ps.forEach((p, i) => {
    const a = (i / Math.max(1, ps.length)) * Math.PI * 2;
    let x = SPAWN.x + Math.cos(a) * 80, y = SPAWN.y + Math.sin(a) * 60;
    if (!canStand(x, y)) { x = SPAWN.x; y = SPAWN.y; }
    p.x = x; p.y = y; p.dx = 0; p.dy = 0; p.task = null;
  });
}

function startGame() {
  const ps = all();
  if (ps.length < RULES.minPlayers) return sys(`Need at least ${RULES.minPlayers} players to start.`);
  const nDevils = ps.length >= 7 ? 2 : 1;
  const now = Date.now();
  shuffle([...ps]).forEach((p, i) => {
    p.inGame = true; p.alive = true;
    p.role = i < nDevils ? 'devil' : 'crew';
    p.tasks = shuffle([...TASKS]).slice(0, RULES.tasksEach).map(t => ({ id: t.id, done: false }));
    p.emergencyLeft = RULES.emergencyPerPlayer;
    p.killReadyAt = now + RULES.firstKillCooldown * 1000;
    p.task = null;
  });
  Object.assign(game, { phase: 'play', bodies: [], meeting: null, result: null, over: null });
  spawnAll();
  for (const p of ps) {
    send(p, { t: 'role', role: p.role, allies: p.role === 'devil' ? ps.filter(q => q.role === 'devil' && q !== p).map(q => q.name) : [] });
  }
}

function toLobby() {
  for (const p of all()) Object.assign(p, { inGame: false, alive: false, role: null, tasks: [], task: null });
  Object.assign(game, { phase: 'lobby', bodies: [], meeting: null, result: null, over: null });
}

function endGame(winner, reason) {
  game.phase = 'over';
  const ps = inGame();
  for (const p of ps) if (p.role === winner) p.pieces += RULES.winBonus;
  game.over = { winner, reason, roles: ps.map(p => ({ name: p.name, color: p.color, role: p.role, alive: p.alive })) };
  return true;
}

function checkWin() {
  if (!['play', 'meeting', 'result'].includes(game.phase)) return false;
  const alive = aliveIn();
  const devils = alive.filter(p => p.role === 'devil').length;
  const crew = alive.filter(p => p.role === 'crew').length;
  if (devils === 0) return endGame('crew', 'Every Devil was caught.');
  if (devils >= crew) return endGame('devil', 'The Devils now outnumber everyone else.');
  const { done, total } = taskProgress();
  if (total > 0 && done >= total) return endGame('crew', 'All tasks were completed.');
  return false;
}

function startMeeting(reason) {
  game.phase = 'meeting';
  game.meeting = { reason, endsAt: Date.now() + RULES.meetingSecs * 1000, votes: new Map() };
  for (const p of all()) { p.task = null; p.dx = 0; p.dy = 0; }
  broadcast({ t: 'meeting', reason });
}

function endMeeting() {
  const tally = new Map();
  for (const { target, weight } of game.meeting.votes.values()) tally.set(target, (tally.get(target) || 0) + weight);
  let best = null, bestN = 0, tie = false;
  for (const [target, n] of tally) {
    if (n > bestN) { best = target; bestN = n; tie = false; } else if (n === bestN) tie = true;
  }
  const summary = [...tally].sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t === 'skip' ? 'Skip' : players.get(t)?.name ?? '?'}: ${n}`).join(' · ') || 'No votes';
  let text;
  if (!best || tie || best === 'skip') text = tie ? 'It was a tie. Nobody was ejected.' : 'Nobody was ejected.';
  else {
    const p = players.get(best);
    p.alive = false;
    text = `${p.name} was ejected. They ${p.role === 'devil' ? 'WERE' : 'were NOT'} a Devil.`;
  }
  game.phase = 'result';
  game.meeting = null;
  game.result = { text, summary, endsAt: Date.now() + RULES.resultSecs * 1000 };
}

function nearest(from, filter, range) {
  let best = null, bd = range;
  for (const q of all()) if (q !== from && filter(q)) { const d = dist(from, q); if (d <= bd) { bd = d; best = q; } }
  return best;
}

function chat(p, text, toId) {
  if (toId) { // private whisper: the "secret deal" channel, allowed any time
    const to = players.get(Number(toId));
    if (!to) return;
    const msg = { t: 'chat', from: p.name, color: p.color, text, whisper: to.name };
    send(p, msg); if (to !== p) send(to, msg);
    return;
  }
  const running = game.phase !== 'lobby' && game.phase !== 'over';
  const ghost = running && (!p.inGame || !p.alive);
  if (running && !ghost && game.phase !== 'meeting') {
    return send(p, { t: 'sys', text: 'Public chat is only open during meetings. Whispers still work.' });
  }
  const msg = { t: 'chat', from: p.name, color: p.color, text, ghost };
  for (const q of all()) if (!ghost || !q.inGame || !q.alive) send(q, msg);
}

function handle(p, m) {
  const now = Date.now();
  if (m.t === 'join') {
    if (p.name) return;
    p.name = String(m.name || '').trim().slice(0, 16) || `Player${p.id}`;
    p.color = freeColor();
    players.set(p.id, p);
    send(p, { t: 'welcome', id: p.id });
    if (game.phase !== 'lobby') send(p, { t: 'sys', text: 'A game is in progress. You are spectating until the next one.' });
    return;
  }
  if (!p.name) return;

  switch (m.t) {
    case 'start':
      if (p.id === hostId() && game.phase === 'lobby') startGame();
      break;
    case 'lobby':
      if (p.id === hostId() && game.phase === 'over') toLobby();
      break;
    case 'input':
      p.dx = clamp(Number(m.dx) || 0, -1, 1);
      p.dy = clamp(Number(m.dy) || 0, -1, 1);
      break;
    case 'taskStart': {
      const t = TASKS.find(t => t.id === m.id);
      if (game.phase === 'play' && p.inGame && t && dist(p, t) <= RULES.useRange) p.task = { id: t.id, at: now };
      break;
    }
    case 'taskCancel':
      p.task = null;
      break;
    case 'taskDone': {
      const t = TASKS.find(t => t.id === m.id);
      const started = p.task;
      p.task = null;
      if (game.phase !== 'play' || !t || !started || started.id !== t.id) break;
      if (now - started.at < RULES.minTaskMs || dist(p, t) > RULES.useRange + 15) break;
      const mine = p.tasks.find(x => x.id === t.id && !x.done);
      if (!mine) break;
      mine.done = true; // devils have fake tasks: they tick off but count for nothing
      if (p.role === 'crew') { p.pieces += 1; checkWin(); }
      break;
    }
    case 'kill': {
      if (game.phase !== 'play' || !p.alive || p.role !== 'devil' || now < p.killReadyAt) break;
      const v = nearest(p, q => q.inGame && q.alive && q.role === 'crew', RULES.killRange);
      if (!v) break;
      v.alive = false; v.task = null;
      game.bodies.push({ id: v.id, name: v.name, color: v.color, x: v.x, y: v.y });
      p.x = v.x; p.y = v.y;
      p.killReadyAt = now + RULES.killCooldown * 1000;
      p.pieces += 1;
      send(v, { t: 'sys', text: 'You were eliminated. As a ghost you can still finish your tasks.' });
      checkWin();
      break;
    }
    case 'report': {
      if (game.phase !== 'play' || !p.alive) break;
      const b = game.bodies.find(b => dist(p, b) <= RULES.reportRange);
      if (b) startMeeting(`${p.name} found ${b.name}'s body`);
      break;
    }
    case 'emergency':
      if (game.phase !== 'play' || !p.alive || p.emergencyLeft <= 0 || dist(p, BUTTON) > RULES.buttonRange) break;
      p.emergencyLeft--;
      startMeeting(`${p.name} called an emergency meeting`);
      break;
    case 'vote': {
      const M = game.meeting;
      if (game.phase !== 'meeting' || !p.inGame || !p.alive || M.votes.has(p.id)) break;
      const target = m.target === 'skip' ? 'skip' : Number(m.target);
      if (target !== 'skip') { const q = players.get(target); if (!q || !q.inGame || !q.alive) break; }
      let weight = 1;
      if (m.double && p.pieces >= RULES.doubleVoteCost) { p.pieces -= RULES.doubleVoteCost; weight = 2; }
      M.votes.set(p.id, { target, weight });
      if (aliveIn().every(q => M.votes.has(q.id))) endMeeting();
      break;
    }
    case 'chat': {
      const text = String(m.text || '').trim().slice(0, 200);
      if (text) chat(p, text, m.to);
      break;
    }
  }
}

// ---------- simulation loop ----------
function move(p, dt) {
  let { dx, dy } = p;
  const len = Math.hypot(dx, dy);
  if (!len) return;
  if (len > 1) { dx /= len; dy /= len; }
  const nx = p.x + dx * RULES.speed * dt, ny = p.y + dy * RULES.speed * dt;
  if (!p.alive) { // ghosts float through walls
    p.x = clamp(nx, 0, WORLD.w); p.y = clamp(ny, 0, WORLD.h);
    return;
  }
  if (canStand(nx, p.y)) p.x = nx;
  if (canStand(p.x, ny)) p.y = ny;
}

function stateFor(me, now) {
  const ps = all();
  const seesAll = game.phase !== 'play' || !me.inGame || !me.alive;
  const vision = me.role === 'devil' ? RULES.visionDevil : RULES.visionCrew;
  const isDevil = me.role === 'devil';
  return {
    t: 'state',
    phase: game.phase,
    hostId: hostId(),
    progress: taskProgress(),
    lobby: ps.map(p => ({ id: p.id, name: p.name, color: p.color, pieces: p.pieces })),
    players: ps
      .filter(q => q.inGame && (q === me || seesAll || (q.alive && dist(me, q) <= vision)))
      .map(q => ({
        id: q.id, name: q.name, color: q.color, x: Math.round(q.x), y: Math.round(q.y), alive: q.alive,
        ally: isDevil && q.role === 'devil' && q !== me,
      })),
    bodies: game.bodies.filter(b => seesAll || dist(me, b) <= vision),
    me: {
      id: me.id, inGame: me.inGame, alive: me.alive, role: me.role, pieces: me.pieces,
      tasks: me.tasks.map(t => ({ ...TASKS.find(x => x.id === t.id), done: t.done })),
      killIn: Math.max(0, Math.ceil((me.killReadyAt - now) / 1000)),
      emergencyLeft: me.emergencyLeft,
    },
    meeting: game.meeting && {
      reason: game.meeting.reason,
      endsIn: Math.max(0, Math.ceil((game.meeting.endsAt - now) / 1000)),
      voted: [...game.meeting.votes.keys()],
    },
    result: game.result && game.phase === 'result' ? { text: game.result.text, summary: game.result.summary } : null,
    over: game.phase === 'over' ? game.over : null,
  };
}

setInterval(() => {
  const now = Date.now();
  if (game.phase === 'play') for (const p of inGame()) move(p, TICK_MS / 1000);
  if (game.phase === 'meeting' && now >= game.meeting.endsAt) endMeeting();
  if (game.phase === 'result' && now >= game.result.endsAt) {
    game.bodies = [];
    if (!checkWin()) {
      game.phase = 'play';
      spawnAll();
      for (const p of aliveIn()) if (p.role === 'devil') p.killReadyAt = now + RULES.firstKillCooldown * 1000;
    }
  }
  for (const p of all()) send(p, stateFor(p, now));
}, TICK_MS);

// ---------- connections ----------
const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  const p = { id: nextId++, ws, name: null, color: '#fff', pieces: 0, x: SPAWN.x, y: SPAWN.y, dx: 0, dy: 0,
    alive: false, inGame: false, role: null, tasks: [], task: null, killReadyAt: 0, emergencyLeft: 0 };
  ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch { return; } handle(p, m); });
  ws.on('close', () => {
    if (!players.delete(p.id)) return;
    if (p.inGame && game.phase !== 'lobby' && game.phase !== 'over') {
      sys(`${p.name} left the game.`);
      if (game.phase === 'meeting' && aliveIn().every(q => game.meeting.votes.has(q.id))) endMeeting();
      checkWin();
    }
  });
});

server.listen(PORT, () => console.log(`Devil's Den running at http://localhost:${PORT}`));
