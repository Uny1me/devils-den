// Screens while a night is running: intro, a game's round phases, standings, final results.
// The view is rebuilt only when the stage/round/phase changes, so turning the cubes or typing an answer
// isn't interrupted by other players' updates.
import { GAMES, DIFFICULTY_LABEL } from '/shared/settings.js';
import { characterSVG } from '/shared/character.js';
import { mountCubeView, resetCubeView, layerSummary } from '/games/cube-view.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const HOW_TO = {
  'cube-count': d => [
    `A stack of cubes appears for <b>${d.lookSecs} seconds</b>. ${d.turning === 'free' ? 'Drag it to turn it around, or' : 'Use'} the 90° buttons to look from other sides.`,
    'Then it hides. Type how many cubes it has and lock it in.',
    'No floating cubes: every cube sits on the floor or on another cube.',
    'Exact answer: 3 points. Within 5%: 2. Within 10%: 1.',
    'The last round counts double.',
  ],
};

let ctx = null; // { root, room, send }
let lastKey = null, view = null, draft = '', endConfirm = false;
let deadline = 0, total = 0, ticker = 0;

const player = id => ctx.room.players.find(p => p.id === id);
const nameOf = id => player(id)?.name ?? 'Someone who left';
const isHost = () => ctx.room.hostId === ctx.room.you;
const mini = (id, h = 40) => { const p = player(id); return p ? characterSVG(p.look, p.color, { height: h, label: p.name }) : ''; };

function keyOf(n) {
  return [n.stage, n.game?.index, n.round?.n, n.round?.phase, n.round?.mine != null, isHost(), endConfirm].join('|');
}

export function renderNight(root, room, send) {
  ctx = { root, room, send };
  const n = room.night;
  total = n.msTotal || 0;
  deadline = n.msLeft == null ? 0 : performance.now() + n.msLeft;
  const key = keyOf(n);
  if (key !== lastKey) {
    const newRound = n.stage === 'play' && n.round.phase === 'look';
    view?.destroy(); view = null;
    if (newRound) { draft = ''; resetCubeView(); }
    root.innerHTML = hud(n) + `<div class="stagebody">${body(n)}</div>`;
    mount(n);
    lastKey = key;
  }
  live(n);
  if (!ticker) ticker = setInterval(tick, 200);
  tick();
}

export function leaveNight() {
  view?.destroy(); view = null;
  lastKey = null; draft = ''; endConfirm = false;
  clearInterval(ticker); ticker = 0;
}

// ---------- pieces of the screen ----------
function hud(n) {
  const g = n.game && GAMES[n.game.id];
  const where = n.stage === 'final' ? 'Final results'
    : `${g.name} · ${DIFFICULTY_LABEL[n.game.difficulty]}${n.round ? ` · Round ${n.round.n} of ${n.game.rounds}` : ''}`;
  const hostBtns = isHost() ? `
      ${n.stage === 'intro' || n.stage === 'standings' ? '<button class="btn small" data-n="skip">Skip</button>' : ''}
      <button class="btn small ghost" data-n="end">${endConfirm ? 'Tap again to end the night' : 'End night'}</button>` : '';
  return `<div class="hud">
      <div class="hudtop">
        <div><span class="eyebrow">${n.game ? `Game ${n.game.index + 1} of ${n.game.of}` : 'Tonight'}</span><div class="hudwhere">${esc(where)}${n.round?.final ? ' <span class="badge x2">× 2</span>' : ''}</div></div>
        <div class="hudright"><span class="timer" data-timer></span>${hostBtns}</div>
      </div>
      <div class="timebar"><span data-bar></span></div>
    </div>`;
}

function body(n) {
  if (n.stage === 'intro') return intro(n);
  if (n.stage === 'standings') return standings(n);
  if (n.stage === 'final') return final(n);
  const ph = n.round.phase;
  if (ph === 'look') return `<div class="lookwrap"><h1 class="ask">How many cubes?</h1><div data-cubes></div><p class="muted center">Look carefully. It hides when the timer runs out.</p></div>`;
  if (ph === 'answer') return answer(n);
  return reveal(n);
}

function intro(n) {
  const g = GAMES[n.game.id];
  const steps = HOW_TO[n.game.id](n.game.settings).map(s => `<li>${s}</li>`).join('');
  return `<section class="panel intro">
      <span class="eyebrow">Up next</span>
      <h1>${g.name}</h1>
      <div class="chips"><span class="chip">${DIFFICULTY_LABEL[n.game.difficulty]}</span><span class="chip">${n.game.rounds} rounds</span></div>
      <ol class="howto">${steps}</ol>
      <p class="muted">Starting in <b data-timer></b>${isHost() ? ' · you can skip ahead' : ''}.</p>
    </section>`;
}

function answer(n) {
  if (n.round.mine != null) {
    return `<section class="panel center locked"><span class="eyebrow">Locked in</span><div class="bignum">${n.round.mine}</div>
      <p>Waiting for everyone else…</p><div class="answered" data-answered></div></section>`;
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];
  return `<section class="panel center padwrap">
      <h1 class="ask">How many cubes?</h1>
      <div class="display" data-draft aria-live="polite">${draft || '&nbsp;'}</div>
      <div class="pad">${keys.map(k => `<button class="btn ${k === '✓' ? 'primary' : ''}" data-key="${k}" aria-label="${k === '⌫' ? 'Delete' : k === '✓' ? 'Lock in' : k}">${k}</button>`).join('')}</div>
      <p class="muted">You can also type the number and press Enter.</p>
      <div class="answered" data-answered></div>
    </section>`;
}

function reveal(n) {
  const v = n.round.view, pts = n.round.points || {};
  const dist = r => (r.guess == null ? 1e9 : Math.abs(r.guess - v.count));
  const rows = n.players.map(id => ({ id, guess: v.guesses[id], pts: pts[id] || 0 })).sort((a, b) => dist(a) - dist(b));
  const list = rows.map(r => `<li class="${r.id === ctx.room.you ? 'me' : ''}">${mini(r.id, 38)}
      <span class="who">${esc(nameOf(r.id))}</span>
      <span class="guess">${r.guess == null ? '—' : r.guess}</span>
      <span class="off">${r.guess == null ? 'no answer' : r.guess === v.count ? 'exact' : `${Math.abs(r.guess - v.count)} off`}</span>
      <span class="pts ${r.pts ? 'got' : ''}">+${r.pts}</span></li>`).join('');
  return `<div class="revealgrid">
      <div class="panel"><span class="eyebrow">The answer</span><div class="bignum">${v.count} <small>cubes</small></div>
        <p class="muted">Layer by layer: ${layerSummary(v.heights)}</p><div data-cubes></div></div>
      <div class="panel"><h2>Answers${n.round.final ? ' <small>points doubled</small>' : ''}</h2><ol class="guesses">${list}</ol></div>
    </div>`;
}

function rankingList(ranking, { showPieces }) {
  return `<ol class="ranking">${ranking.map(r => `<li class="${r.id === ctx.room.you ? 'me' : ''}">
      <span class="place">${r.place}</span>${mini(r.id, 44)}<span class="who">${esc(nameOf(r.id))}</span>
      <span class="score">${r.points} pts</span>${showPieces ? `<span class="pieces">${r.pieces ? `+${r.pieces} piece${r.pieces > 1 ? 's' : ''}` : '—'}</span>` : ''}</li>`).join('')}</ol>`;
}

function standings(n) {
  const nextGame = n.game.index + 1 < n.game.of;
  return `<section class="panel">
      <span class="eyebrow">${GAMES[n.game.id].name} · final standings</span>
      <h1>${esc(nameOf(n.standings.ranking[0].id))} takes it</h1>
      ${rankingList(n.standings.ranking, { showPieces: true })}
      <p class="muted">${nextGame ? 'Next game' : 'Final results'} in <b data-timer></b>.</p>
    </section>`;
}

function final(n) {
  const totals = Object.entries(n.pieces).map(([id, p]) => [Number(id), p]).sort((a, b) => b[1] - a[1]);
  let place = 0, prev = null;
  const rows = totals.map(([id, p], i) => { if (p !== prev) { place = i + 1; prev = p; } return { id, p, place }; });
  const top = rows.filter(r => r.place === 1);
  const games = n.results.map(r => `<li><b>${GAMES[r.game].name}</b> · ${DIFFICULTY_LABEL[r.difficulty]}: ${r.ranking.filter(x => x.place === 1).map(x => esc(nameOf(x.id))).join(' & ')}</li>`).join('');
  return `<section class="panel">
      <span class="eyebrow">The night is over</span>
      <h1>${top.map(r => esc(nameOf(r.id))).join(' & ')} win${top.length > 1 ? '' : 's'} the night</h1>
      <div class="podium">${rows.slice(0, 3).map(r => `<div class="step s${r.place}">${mini(r.id, 70)}<div class="block"><b>${r.place}</b><span>${r.p} pieces</span></div><div class="pname">${esc(nameOf(r.id))}</div></div>`).join('')}</div>
      <ol class="ranking">${rows.map(r => `<li class="${r.id === ctx.room.you ? 'me' : ''}"><span class="place">${r.place}</span>${mini(r.id, 40)}<span class="who">${esc(nameOf(r.id))}</span><span class="score">${r.p} pieces</span></li>`).join('')}</ol>
      <h2>Game winners</h2><ul class="gamewins">${games}</ul>
      ${isHost() ? '<button class="btn primary big" data-n="lobby">Back to the lobby</button>' : '<p class="muted">The host will take everyone back to the lobby.</p>'}
    </section>`;
}

// ---------- mounting and live updates ----------
function mount(n) {
  const slot = $('[data-cubes]', ctx.root);
  if (slot && n.round?.view) view = mountCubeView(slot, n.round.view);
}

function live(n) {
  const el = $('[data-answered]', ctx.root);
  if (el && n.round) {
    el.innerHTML = n.players.map(id => {
      const done = n.round.answered.includes(id), p = player(id);
      return `<span class="tag ${done ? 'done' : ''} ${p?.connected === false ? 'away' : ''}">${done ? '✓' : '…'} ${esc(nameOf(id))}</span>`;
    }).join('');
  }
}

function tick() {
  if (!ctx) return;
  const left = deadline ? Math.max(0, deadline - performance.now()) : 0;
  const secs = Math.ceil(left / 1000);
  const text = deadline ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';
  ctx.root.querySelectorAll('[data-timer]').forEach(e => { e.textContent = text; e.classList.toggle('urgent', deadline && secs <= 5); });
  const bar = $('[data-bar]', ctx.root);
  if (bar) bar.style.width = total && deadline ? `${(left / total) * 100}%` : '0%';
}

// ---------- input ----------
function setDraft(v) {
  draft = v.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 3);
  const d = $('[data-draft]', ctx.root);
  if (d) d.innerHTML = draft || '&nbsp;';
}
function lockIn() { if (draft !== '') ctx.send({ t: 'answer', value: Number(draft) }); }

document.addEventListener('click', e => {
  if (!ctx || !ctx.room.night) return;
  const k = e.target.closest('[data-key]');
  if (k) {
    const key = k.dataset.key;
    if (key === '⌫') setDraft(draft.slice(0, -1));
    else if (key === '✓') lockIn();
    else setDraft(draft + key);
    return;
  }
  const b = e.target.closest('[data-n]');
  if (!b) return;
  const act = b.dataset.n;
  if (act === 'skip') ctx.send({ t: 'skip' });
  if (act === 'lobby') ctx.send({ t: 'lobby' });
  if (act === 'end') {
    if (endConfirm) { endConfirm = false; ctx.send({ t: 'lobby' }); return; }
    endConfirm = true; renderNight(ctx.root, ctx.room, ctx.send);
    setTimeout(() => { if (endConfirm) { endConfirm = false; if (ctx?.room.night) renderNight(ctx.root, ctx.room, ctx.send); } }, 3000);
  }
});

document.addEventListener('keydown', e => {
  if (!ctx?.room.night || !$('[data-draft]', ctx.root)) return;
  if (e.target.closest?.('input, textarea')) return;
  if (/^\d$/.test(e.key)) { setDraft(draft + e.key); e.preventDefault(); }
  else if (e.key === 'Backspace') { setDraft(draft.slice(0, -1)); e.preventDefault(); }
  else if (e.key === 'Enter') { lockIn(); e.preventDefault(); }
});
