// Browser side of G1: home (name, look, create/join), lobby (players, playlist), and a placeholder "running" screen.
import {
  GAMES, DIFFICULTIES, DIFFICULTY_LABEL, LENGTHS, DEFAULT_ENTRY, HAIR_STYLES, HAIR_COLORS, SKINS, SHIRTS, ROOM,
  estimateSecs, formatMins, cleanLook, randomLook,
} from '/shared/settings.js';
import { characterSVG } from '/shared/character.js';
import { renderNight, leaveNight } from '/night.js';
import { initTheme } from '/theme.js';

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(key, area = localStorage) { try { return JSON.parse(area.getItem(key)); } catch { return null; } },
  set(key, val, area = localStorage) { try { area.setItem(key, JSON.stringify(val)); } catch { /* private mode */ } },
  del(key, area = localStorage) { try { area.removeItem(key); } catch { /* private mode */ } },
};

// ---------- state ----------
const saved = store.get('dd-profile') || {};
const profile = { name: typeof saved.name === 'string' ? saved.name : '', look: saved.look ? cleanLook(saved.look) : randomLook() };
let session = store.get('dd-session', sessionStorage); // { code, token } for this tab
let room = null;
let ws = null, online = false, busy = false;
let screen = null, editingLook = false;
let codeDraft = (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, ROOM.codeLength);

const saveProfile = () => store.set('dd-profile', profile);
const me = () => room?.players.find(p => p.id === room.you);
const isHost = () => room && room.hostId === room.you;

// ---------- connection ----------
function send(msg) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => {
    online = true;
    if (session) send({ t: 'join', code: session.code, token: session.token, name: profile.name, look: profile.look });
    render();
  };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } handle(m); };
  ws.onclose = () => { online = false; busy = false; render(); setTimeout(connect, 1500); };
}

function handle(m) {
  if (m.t === 'joined') {
    session = { code: m.code, token: m.token };
    store.set('dd-session', session, sessionStorage);
    busy = false;
    const url = new URL(location.href); url.searchParams.set('room', m.code); history.replaceState(null, '', url);
  } else if (m.t === 'room') {
    room = m.room;
    if (me()) profile.look = cleanLook(me().look);
  } else if (m.t === 'error') {
    busy = false;
    if (m.code === 'no-room') room = null; // e.g. the server restarted while we were away
    if (!room) { // a join or create failed: forget any old session for this tab
      session = null; store.del('dd-session', sessionStorage);
      homeError(m.text);
    } else toast(m.text, true);
  } else if (m.t === 'left') {
    room = null; session = null; store.del('dd-session', sessionStorage);
    const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url);
  }
  render();
}

// ---------- shared bits ----------
const GAME_ICONS = {
  'cube-count': '<path d="M0 -10 L9 -5 L9 5 L0 10 L-9 5 L-9 -5 Z M-9 -5 L0 0 L9 -5 M0 0 V10"/>',
  'memory-poker': '<path d="M-10 -7 h10 v15 h-10 Z M2 -9 l8 2 l-3.5 14.5 l-5 -1.2"/>',
};
const gameIcon = id => `<span class="gicon" style="background:var(--${GAMES[id].hue})"><svg width="24" height="24" viewBox="-12 -12 24 24" aria-hidden="true" style="fill:none;stroke:var(--ink);stroke-width:2;stroke-linejoin:round;stroke-linecap:round">${GAME_ICONS[id]}</svg></span>`;

// a small isometric slab for characters to stand on
const slab = (w = 120) => `<svg class="base" width="${w}" height="${w * 0.36}" viewBox="-62 -18 124 44" aria-hidden="true">
  <path d="M-58 -2 L0 -16 L58 -2 L0 12 Z" fill="var(--stone)"/><path d="M-58 -2 L0 12 L0 22 L-58 8 Z" fill="var(--line-strong)"/><path d="M58 -2 L0 12 L0 22 L58 8 Z" fill="var(--line)"/>
  <path d="M0 -16 L58 -2 L58 8 L0 22 L-58 8 L-58 -2 Z M-58 -2 L0 12 L58 -2 M0 12 V22" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/></svg>`;

function lookPicker(look, shirt) {
  const hair = HAIR_STYLES.map(h => `<button class="opt" data-look="hair" data-v="${h}" aria-pressed="${look.hair === h}" aria-label="Hair: ${h}" title="${h}">${characterSVG({ ...look, hair: h }, shirt, { height: 58, label: h })}</button>`).join('');
  const hairColor = HAIR_COLORS.map((c, i) => `<button class="swatch" style="background:${c}" data-look="hairColor" data-v="${i}" aria-pressed="${look.hairColor === i}" aria-label="Hair color ${i + 1}"></button>`).join('');
  const skin = SKINS.map((c, i) => `<button class="swatch" style="background:${c}" data-look="skin" data-v="${i}" aria-pressed="${look.skin === i}" aria-label="Skin tone ${i + 1}"></button>`).join('');
  return `<label>Hair</label><div class="picker">${hair}</div>
    <label>Hair color</label><div class="picker">${hairColor}</div>
    <label>Skin</label><div class="picker">${skin}</div>
    <div style="margin-top:14px"><button class="btn small" data-act="shuffle">Shuffle look</button></div>`;
}

function setLook(key, value) {
  profile.look = cleanLook({ ...profile.look, [key]: key === 'hair' ? value : Number(value) });
  saveProfile();
  if (room) send({ t: 'look', look: profile.look }); else renderHomePreview();
}

// ---------- home ----------
function homeHTML() {
  return `<section class="hero">
      <span class="eyebrow">Game night</span>
      <h1>Short games, long grudges.</h1>
      <p>One person creates a room and picks tonight’s games. Everyone else joins with the 4-letter code on their own phone or laptop.</p>
    </section>
    <div class="home">
      <section class="panel">
        <h2>Your player</h2>
        <div class="preview" id="preview"></div>
        <label for="name">Name</label>
        <input type="text" id="name" maxlength="${ROOM.nameMax}" autocomplete="nickname" placeholder="What should we call you?">
        <div id="homepicker"></div>
        <p class="muted" style="margin-top:12px">Your shirt color is given to you in the room, so everyone can tell players apart.</p>
      </section>
      <div class="stack">
        <section class="panel">
          <h2>Host a night</h2>
          <p>Create a room, pick the games, and share the code.</p>
          <button class="btn primary big" id="create">Create room</button>
        </section>
        <section class="panel">
          <h2>Join a room</h2>
          <label for="code" style="margin-top:0">Room code</label>
          <div class="row">
            <input type="text" id="code" class="code-input" maxlength="${ROOM.codeLength}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7QF">
            <button class="btn" id="join">Join</button>
          </div>
        </section>
        <p class="error" id="homeerror" role="alert"></p>
      </div>
    </div>`;
}

function renderHomePreview() {
  const p = $('#preview'); if (!p) return;
  p.innerHTML = `<div class="platform">${characterSVG(profile.look, SHIRTS[1], { height: 130, state: 'walk', label: 'Your character' })}${slab(130)}</div>`;
  $('#homepicker').innerHTML = lookPicker(profile.look, SHIRTS[1]);
}

function updateHome() {
  const disabled = !online || busy;
  $('#create').disabled = disabled;
  $('#join').disabled = disabled || codeDraft.length !== ROOM.codeLength;
  $('#create').textContent = busy ? 'Working…' : 'Create room';
}

function homeError(text) { const el = $('#homeerror'); if (el) el.textContent = text; }

function needName() {
  if (profile.name.trim()) return false;
  homeError('Type your name first.');
  $('#name').focus();
  return true;
}

// ---------- lobby ----------
function playerCard(p) {
  const badges = [p.id === room.hostId ? '<span class="badge host">host</span>' : '', p.id === room.you ? '<span class="badge you">you</span>' : '', !p.connected ? '<span class="badge off">away</span>' : ''].join('');
  return `<div class="pcard ${p.id === room.you ? 'me' : ''} ${p.connected ? '' : 'off'}">
    ${characterSVG(p.look, p.color, { height: 72, label: p.name })}
    <div class="pname">${esc(p.name)}</div><div class="badges">${badges}</div></div>`;
}

function gameCard(id, index, host) {
  const g = GAMES[id], entry = room.playlist[index], on = !!entry, dis = host ? '' : 'disabled';
  let body = '';
  if (on) {
    const diff = DIFFICULTIES.map(d => `<button data-act="diff" data-game="${id}" data-v="${d}" aria-pressed="${entry.difficulty === d}" ${dis}>${DIFFICULTY_LABEL[d]}</button>`).join('');
    const len = Object.entries(LENGTHS).map(([k, l]) => `<button data-act="len" data-game="${id}" data-v="${k}" aria-pressed="${entry.length === k}" ${dis}>${l.label} · ${l.rounds}</button>`).join('');
    const many = room.playlist.length > 1;
    body = `<div class="gset">
        <span class="lab">Difficulty</span><div class="seg" role="group" aria-label="${g.name} difficulty">${diff}</div>
        <span class="lab">Rounds</span><div class="seg" role="group" aria-label="${g.name} length">${len}</div>
      </div>
      <div class="gfoot"><span>${formatMins(estimateSecs(entry))} · ${LENGTHS[entry.length].rounds} rounds</span>
        ${host && many ? `<span class="order"><button class="btn small" data-act="up" data-game="${id}" ${index === 0 ? 'disabled' : ''} aria-label="Play ${g.name} earlier">↑</button><button class="btn small" data-act="down" data-game="${id}" ${index === room.playlist.length - 1 ? 'disabled' : ''} aria-label="Play ${g.name} later">↓</button></span>` : ''}
      </div>`;
  }
  const toggle = !g.ready
    ? '<span class="badge off">coming soon</span>'
    : host
    ? `<button class="btn small ${on ? 'primary' : ''}" data-act="toggle" data-game="${id}" aria-pressed="${on}">${on ? `✓ Game ${index + 1}` : 'Add'}</button>`
    : `<span class="badge ${on ? 'you' : 'off'}">${on ? `game ${index + 1}` : 'not tonight'}</span>`;
  return `<article class="game ${on ? 'on' : ''}"><div class="ghead">${gameIcon(id)}<div><div class="gname">${g.name}</div><div class="gblurb">${g.blurb}</div></div>${toggle}</div>${body}</article>`;
}

function lobbyHTML() {
  const host = isHost(), mine = me();
  const ordered = [...room.playlist.map(e => e.game), ...Object.keys(GAMES).filter(id => !room.playlist.some(e => e.game === id))];
  const total = room.playlist.reduce((s, e) => s + estimateSecs(e), 0);
  const here = room.players.filter(p => p.connected).length;
  const startNote = host ? (room.startProblem || 'Ready when you are.') : 'Waiting for the host to start the night.';
  return `<div class="lobbyhead">
      <div><span class="eyebrow">Room code</span><div class="bigcode">${esc(room.code)}</div></div>
      <div class="actions"><button class="btn" data-act="copy">Copy invite link</button><button class="btn ghost" data-act="leave">Leave room</button></div>
    </div>
    <div class="lobbygrid">
      <section class="panel">
        <h2>Players <small>${here} here · max ${ROOM.maxPlayers}</small></h2>
        <div class="players">${room.players.map(playerCard).join('')}</div>
        <button class="btn small" data-act="editlook" aria-expanded="${editingLook}">${editingLook ? 'Done' : 'Change my look'}</button>
        ${editingLook && mine ? `<div class="lookeditor">${lookPicker(mine.look, mine.color)}</div>` : ''}
      </section>
      <section class="panel">
        <h2>Tonight’s games <small>${host ? 'you’re the host' : 'host picks'}</small></h2>
        ${host ? '<p class="muted">Add at least one game. Each game gets its own difficulty and number of rounds.</p>' : ''}
        <div class="games">${ordered.map(id => gameCard(id, room.playlist.findIndex(e => e.game === id), host)).join('')}</div>
        <div class="startbar">
          <div class="total"><span>${room.playlist.length} game${room.playlist.length === 1 ? '' : 's'}</span><span>${room.playlist.length ? formatMins(total) + ' total' : ''}</span></div>
          ${host ? `<button class="btn primary big" data-act="start" ${room.startProblem ? 'disabled' : ''}>Start the night</button>` : ''}
          <span class="muted" role="status">${esc(startNote)}</span>
        </div>
      </section>
    </div>`;
}

function editPlaylist(fn) {
  const list = room.playlist.map(e => ({ ...e }));
  fn(list);
  send({ t: 'playlist', playlist: list });
}

// ---------- render ----------
function render() {
  const next = !room ? 'home' : room.phase === 'lobby' ? 'lobby' : 'running';
  const status = $('#status');
  status.textContent = online ? '' : 'Reconnecting…';
  status.classList.toggle('bad', !online);
  $('#roomchip').hidden = !room;
  if (room) $('#roomchip').textContent = room.code;

  if (next === 'home') {
    if (screen !== 'home') {
      $('#app').innerHTML = homeHTML();
      $('#name').value = profile.name;
      $('#code').value = codeDraft;
      renderHomePreview();
    }
    updateHome();
  } else if (next === 'lobby') {
    const scrollY = window.scrollY;
    $('#app').innerHTML = lobbyHTML();
    if (screen === next) window.scrollTo(0, scrollY);
  } else {
    if (screen !== 'running') { $('#app').innerHTML = '<div id="night" class="night"></div>'; window.scrollTo(0, 0); }
    renderNight($('#night'), room, send);
  }
  if (screen === 'running' && next !== 'running') leaveNight();
  screen = next;
}

// ---------- events ----------
document.addEventListener('input', e => {
  if (e.target.id === 'name') { profile.name = e.target.value.slice(0, ROOM.nameMax); saveProfile(); homeError(''); }
  if (e.target.id === 'code') {
    codeDraft = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM.codeLength);
    e.target.value = codeDraft;
    homeError('');
    updateHome();
  }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'code' && !$('#join').disabled) $('#join').click();
  if (e.target.id === 'name' && codeDraft.length === ROOM.codeLength && !$('#join').disabled) $('#join').click();
});

document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.id === 'create') {
    if (needName()) return;
    busy = true; updateHome();
    send({ t: 'create', name: profile.name, look: profile.look });
    return;
  }
  if (t.id === 'join') {
    if (needName()) return;
    busy = true; updateHome();
    send({ t: 'join', code: codeDraft, name: profile.name, look: profile.look });
    return;
  }
  if (t.dataset.look) { setLook(t.dataset.look, t.dataset.v); return; }
  const act = t.dataset.act, game = t.dataset.game;
  switch (act) {
    case 'shuffle': profile.look = randomLook(); saveProfile(); if (room) send({ t: 'look', look: profile.look }); else renderHomePreview(); break;
    case 'editlook': editingLook = !editingLook; render(); break;
    case 'toggle': editPlaylist(l => { const i = l.findIndex(x => x.game === game); if (i >= 0) l.splice(i, 1); else l.push({ game, ...DEFAULT_ENTRY }); }); break;
    case 'diff': editPlaylist(l => { l.find(x => x.game === game).difficulty = t.dataset.v; }); break;
    case 'len': editPlaylist(l => { l.find(x => x.game === game).length = t.dataset.v; }); break;
    case 'up': case 'down': editPlaylist(l => {
      const i = l.findIndex(x => x.game === game), j = act === 'up' ? i - 1 : i + 1;
      if (j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]];
    }); break;
    case 'start': send({ t: 'start' }); break;
    case 'lobby': send({ t: 'lobby' }); break;
    case 'leave': editingLook = false; send({ t: 'leave' }); break;
    case 'copy': copyInvite(); break;
  }
});

function copyInvite() {
  const link = `${location.origin}/play?room=${room.code}`;
  navigator.clipboard?.writeText(link).then(() => toast('Invite link copied.'), () => toast(`Share this link: ${link}`))
    ?? toast(`Share this link: ${link}`);
}

let toastTimer = 0;
function toast(text, bad = false) {
  const el = $('#toast');
  el.textContent = text; el.classList.toggle('bad', bad); el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

initTheme($('#theme'));
});
applyTheme();

render();
connect();
