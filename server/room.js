// Rooms: codes, players, host, playlist of games, and the lobby -> running switch.
// No networking in here: each player has a `send(message)` function, so tests can use fakes.
import { randomBytes, randomInt } from 'node:crypto';
import { DIFFICULTIES, GAMES, LENGTHS, ROOM, SHIRTS, cleanLook } from '../shared/settings.js';
import { RoomError } from './errors.js';
import { Night, MODULES } from './engine.js';

export { RoomError };

export class Registry {
  constructor() { this.rooms = new Map(); }

  newCode() {
    const { codeAlphabet: abc, codeLength: len } = ROOM;
    for (let tries = 0; tries < 1000; tries++) {
      let code = '';
      for (let i = 0; i < len; i++) code += abc[randomInt(abc.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError('Could not make a room code. Try again.');
  }

  create() {
    const room = new Room(this.newCode(), this);
    this.rooms.set(room.code, room);
    return room;
  }

  get(code) { return this.rooms.get(String(code || '').trim().toUpperCase()); }
  remove(room) { room.night?.stop(); this.rooms.delete(room.code); }
}

export class Room {
  constructor(code, registry) {
    this.code = code;
    this.registry = registry;
    this.players = new Map(); // insertion order = join order, used to pass the host role on
    this.hostId = null;
    this.phase = 'lobby'; // 'lobby' | 'running'
    this.playlist = []; // [{ game, difficulty, length }]
    this.night = null; // the running Night (engine.js) while phase is 'running'
    this.nextId = 1;
  }

  // ---------- membership ----------
  addPlayer({ name, look, send }) {
    if (this.phase !== 'lobby') throw new RoomError('This room’s night has already started. Ask the host to go back to the lobby, then join.');
    if (this.players.size >= ROOM.maxPlayers) throw new RoomError(`This room is full (${ROOM.maxPlayers} players).`);
    const p = {
      id: this.nextId++,
      token: randomBytes(16).toString('hex'),
      name: this.uniqueName(name),
      look: cleanLook(look),
      color: this.freeColor(),
      connected: true,
      send,
      dropTimer: null,
    };
    this.players.set(p.id, p);
    if (!this.connectedHost()) this.hostId = p.id;
    this.broadcast();
    return p;
  }

  reconnect(token, send) {
    const p = [...this.players.values()].find(q => q.token === token);
    if (!p) return null;
    clearTimeout(p.dropTimer);
    p.connected = true;
    p.send = send;
    if (!this.connectedHost()) this.hostId = p.id;
    this.broadcast();
    return p;
  }

  disconnect(p) {
    if (!this.players.has(p.id)) return;
    p.connected = false;
    p.send = null;
    if (this.hostId === p.id) this.passHost();
    p.dropTimer = setTimeout(() => this.removePlayer(p.id), ROOM.reconnectGraceSecs * 1000);
    p.dropTimer.unref?.();
    this.broadcast();
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    clearTimeout(p.dropTimer);
    this.players.delete(id);
    if (this.players.size === 0) { this.registry.remove(this); return; }
    if (this.hostId === id) this.passHost();
    this.broadcast();
  }

  connectedHost() { const h = this.players.get(this.hostId); return h && h.connected ? h : null; }

  passHost() {
    const next = [...this.players.values()].find(q => q.connected && q.id !== this.hostId);
    if (next) this.hostId = next.id;
  }

  uniqueName(raw) {
    const base = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, ROOM.nameMax) || 'Player';
    const taken = new Set([...this.players.values()].map(p => p.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) {
      const name = `${base.slice(0, ROOM.nameMax - String(n).length - 1)} ${n}`;
      if (!taken.has(name.toLowerCase())) return name;
    }
  }

  freeColor() {
    const used = new Set([...this.players.values()].map(p => p.color));
    return SHIRTS.find(c => !used.has(c)) || SHIRTS[0];
  }

  // ---------- player actions ----------
  setLook(p, look) {
    p.look = cleanLook(look);
    this.broadcast();
  }

  setPlaylist(p, list) {
    this.requireHost(p);
    if (this.phase !== 'lobby') throw new RoomError('The playlist can only change in the lobby.');
    if (!Array.isArray(list)) throw new RoomError('That playlist isn’t valid.');
    const seen = new Set();
    const clean = list.map(e => {
      if (!e || !GAMES[e.game]) throw new RoomError('Unknown game in the playlist.');
      if (!MODULES[e.game]) throw new RoomError(`${GAMES[e.game].name} isn’t playable yet.`);
      if (seen.has(e.game)) throw new RoomError('Each game can only be in the playlist once.');
      seen.add(e.game);
      if (!DIFFICULTIES.includes(e.difficulty)) throw new RoomError('Pick Easy, Medium or Hard.');
      if (!LENGTHS[e.length]) throw new RoomError('Pick Short, Standard or Long.');
      return { game: e.game, difficulty: e.difficulty, length: e.length };
    });
    this.playlist = clean;
    this.broadcast();
  }

  startProblem() {
    if (this.playlist.length === 0) return 'Pick at least one game.';
    const online = [...this.players.values()].filter(q => q.connected).length;
    if (online < ROOM.minPlayers) return `Waiting for at least ${ROOM.minPlayers} players.`;
    return null;
  }

  start(p) {
    this.requireHost(p);
    if (this.phase !== 'lobby') throw new RoomError('The night has already started.');
    const problem = this.startProblem();
    if (problem) throw new RoomError(problem);
    const players = [...this.players.values()].filter(q => q.connected).map(q => q.id);
    this.phase = 'running';
    this.night = new Night({
      playlist: this.playlist.map(e => ({ ...e })),
      playerIds: players,
      activeIds: () => [...this.players.values()].filter(q => q.connected).map(q => q.id),
      onChange: () => this.broadcast(),
    });
    this.night.begin();
  }

  backToLobby(p) {
    this.requireHost(p);
    this.night?.stop();
    this.night = null;
    this.phase = 'lobby';
    this.broadcast();
  }

  answer(p, value) {
    if (!this.night) throw new RoomError('No game is running.');
    this.night.input(p.id, value);
  }

  skip(p) {
    this.requireHost(p);
    if (!this.night) throw new RoomError('No game is running.');
    this.night.skip();
  }

  requireHost(p) {
    if (p.id !== this.hostId) throw new RoomError('Only the host can do that.');
  }

  // ---------- what each player is sent ----------
  stateFor(id) {
    return {
      code: this.code,
      phase: this.phase,
      you: id,
      hostId: this.hostId,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, look: p.look, color: p.color, connected: p.connected })),
      playlist: this.playlist,
      startProblem: this.startProblem(),
      night: this.night ? this.night.stateFor(id) : null,
    };
  }

  broadcast() {
    for (const p of this.players.values()) if (p.connected && p.send) p.send({ t: 'room', room: this.stateFor(p.id) });
  }
}
