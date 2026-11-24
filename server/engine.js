// The night engine: walks the playlist. For each game: intro -> rounds (each made of the game's phases) -> standings.
// After the last game: final results. Every stage has a timer; the host can skip intros and standings.
import { GAMES, LENGTHS, INTRO_SECS, STANDINGS_SECS } from '../shared/settings.js';
import { RoomError } from './errors.js';
import * as cubeCount from './games/cube-count.js';

// Game modules. Each one exports:
//   phases(difficulty) -> [{ id, secs }]       the steps of one round
//   newRound(difficulty) -> round              the secret round state
//   inputPhase                                 the phase id in which players answer
//   parseInput(value, difficulty) -> answer    validates an answer (throws RoomError)
//   score(round, answers) -> Map(id -> pts)    points for the round (missing answers score 0)
//   view(round, phaseId, { answers }) -> data  what screens may see in that phase
export const MODULES = { 'cube-count': cubeCount };

export const PIECES_BY_PLACE = [3, 2, 1];

// [[id, points]] -> [{ id, points, place }]; tied players share the higher place.
export function rank(entries) {
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  let place = 0, prev = null;
  return sorted.map(([id, points], i) => {
    if (points !== prev) { place = i + 1; prev = points; }
    return { id, points, place };
  });
}

export class Night {
  constructor({ playlist, playerIds, activeIds = () => playerIds, onChange = () => {}, timers = { set: setTimeout, clear: clearTimeout }, now = Date.now }) {
    Object.assign(this, { playlist, playerIds, activeIds, onChange, timers, now });
    this.gi = 0; this.ri = 0; this.pi = 0;
    this.stage = 'intro';
    this.pieces = new Map(playerIds.map(id => [id, 0]));
    this.results = [];
    this.timer = null; this.endsAt = 0; this.total = 0;
    this.stopped = false;
  }

  get entry() { return this.playlist[this.gi]; }
  get mod() { return MODULES[this.entry.game]; }
  get diff() { return GAMES[this.entry.game].difficulty[this.entry.difficulty]; }
  get rounds() { return LENGTHS[this.entry.length].rounds; }
  get phases() { return this.mod.phases(this.diff); }
  get phase() { return this.phases[this.pi]; }
  get isFinalRound() { return this.ri === this.rounds - 1; }

  begin() { this.enterIntro(); }

  stop() { this.timers.clear(this.timer); this.timer = null; this.stopped = true; }

  schedule(secs) {
    this.timers.clear(this.timer);
    this.total = secs * 1000;
    this.endsAt = this.now() + this.total;
    this.timer = this.timers.set(() => this.next(), this.total);
    this.timer?.unref?.();
  }

  enterIntro() {
    this.stage = 'intro';
    this.ri = 0;
    this.gameScores = new Map(this.playerIds.map(id => [id, 0]));
    this.schedule(INTRO_SECS);
    this.onChange();
  }

  startRound() {
    this.stage = 'play';
    this.pi = 0;
    this.round = this.mod.newRound(this.diff);
    this.answers = new Map();
    this.roundPoints = null;
    this.schedule(this.phase.secs);
    this.onChange();
  }

  scoreRound() {
    const pts = this.mod.score(this.round, this.answers);
    const mult = this.isFinalRound ? 2 : 1;
    this.roundPoints = new Map(this.playerIds.map(id => [id, (pts.get(id) || 0) * mult]));
    for (const [id, p] of this.roundPoints) this.gameScores.set(id, this.gameScores.get(id) + p);
  }

  enterStandings() {
    this.stage = 'standings';
    const ranking = rank([...this.gameScores]).map(r => ({ ...r, pieces: PIECES_BY_PLACE[r.place - 1] || 0 }));
    for (const r of ranking) this.pieces.set(r.id, this.pieces.get(r.id) + r.pieces);
    this.results.push({ game: this.entry.game, difficulty: this.entry.difficulty, ranking });
    this.schedule(STANDINGS_SECS);
    this.onChange();
  }

  enterFinal() {
    this.stage = 'final';
    this.timers.clear(this.timer);
    this.timer = null; this.endsAt = 0; this.total = 0;
    this.onChange();
  }

  next() {
    if (this.stopped) return;
    if (this.stage === 'intro') return this.startRound();
    if (this.stage === 'play') {
      if (this.phase.id === this.mod.inputPhase) this.scoreRound();
      this.pi++;
      if (this.pi < this.phases.length) { this.schedule(this.phase.secs); return this.onChange(); }
      this.ri++;
      if (this.ri < this.rounds) return this.startRound();
      return this.enterStandings();
    }
    if (this.stage === 'standings') {
      this.gi++;
      return this.gi < this.playlist.length ? this.enterIntro() : this.enterFinal();
    }
  }

  skip() {
    if (this.stage !== 'intro' && this.stage !== 'standings') throw new RoomError('You can only skip the intro or the standings.');
    this.next();
  }

  input(id, value) {
    if (this.stage !== 'play' || this.phase.id !== this.mod.inputPhase) throw new RoomError('Answers aren’t open right now.');
    if (!this.playerIds.includes(id)) throw new RoomError('You joined after this night started.');
    if (this.answers.has(id)) throw new RoomError('Your answer is already locked in.');
    this.answers.set(id, this.mod.parseInput(value, this.diff));
    const waiting = this.activeIds().filter(x => this.playerIds.includes(x) && !this.answers.has(x));
    if (waiting.length === 0) this.next(); // everyone here has answered: don't make them wait
    else this.onChange();
  }

  stateFor(id) {
    const base = {
      stage: this.stage,
      msLeft: this.endsAt ? Math.max(0, this.endsAt - this.now()) : null,
      msTotal: this.total || null,
      pieces: Object.fromEntries(this.pieces),
      players: this.playerIds,
    };
    if (this.stage === 'final') return { ...base, results: this.results };
    const e = this.entry;
    base.game = { id: e.game, difficulty: e.difficulty, rounds: this.rounds, index: this.gi, of: this.playlist.length, settings: this.diff };
    base.scores = Object.fromEntries(this.gameScores);
    if (this.stage === 'standings') base.standings = this.results.at(-1);
    if (this.stage === 'play') {
      base.round = {
        n: this.ri + 1,
        final: this.isFinalRound,
        phase: this.phase.id,
        view: this.mod.view(this.round, this.phase.id, { answers: this.answers }),
        answered: [...this.answers.keys()],
        mine: this.answers.has(id) ? this.answers.get(id) : null,
        points: this.roundPoints ? Object.fromEntries(this.roundPoints) : null,
      };
    }
    return base;
  }
}
