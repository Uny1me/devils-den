// Numbers and lists used by both the server and the browser.
// Change a value here and both sides agree.

export const ROOM = {
  minPlayers: 2,
  maxPlayers: 10,
  codeLength: 4,
  codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // no I or O, so codes are easy to read aloud
  nameMax: 16,
  reconnectGraceSecs: 60,
};

export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export const LENGTHS = {
  short: { label: 'Short', rounds: 3 },
  standard: { label: 'Standard', rounds: 5 },
  long: { label: 'Long', rounds: 7 },
};

export const DEFAULT_ENTRY = { difficulty: 'medium', length: 'standard' };

export const INTRO_SECS = 15;
export const STANDINGS_SECS = 20;

// Game catalog. Each game's module (built in G2/G3) reads its difficulty table from here.
export const GAMES = {
  'cube-count': {
    name: 'Cube Count',
    blurb: 'Turn a stack of cubes around, then guess how many there are.',
    ready: true,
    hue: 'blue',
    difficulty: {
      easy: { grid: 3, maxHeight: 3, cubes: [7, 12], lookSecs: 25, turning: 'free' },
      medium: { grid: 4, maxHeight: 4, cubes: [15, 30], lookSecs: 20, turning: 'free' },
      hard: { grid: 6, maxHeight: 5, cubes: [40, 80], lookSecs: 15, turning: 'snap' },
    },
    roundSecs: d => d.lookSecs + 15 + 15, // look + answer + reveal
  },
  'memory-poker': {
    name: 'Memory Poker',
    blurb: 'Memorize 12 cards by letter, then pick two for the best poker hand.',
    ready: false, // G3
    hue: 'rose',
    difficulty: {
      easy: { memorizeSecs: 30, pickSecs: 25 },
      medium: { memorizeSecs: 20, pickSecs: 20 },
      hard: { memorizeSecs: 12, pickSecs: 15 },
    },
    roundSecs: d => d.memorizeSecs + 5 + d.pickSecs + 15, // memorize + main deck + pick + showdown
  },
};

export function estimateSecs(entry) {
  const g = GAMES[entry.game];
  return INTRO_SECS + STANDINGS_SECS + LENGTHS[entry.length].rounds * g.roundSecs(g.difficulty[entry.difficulty]);
}

export const formatMins = secs => `≈ ${Math.max(1, Math.round(secs / 60))} min`;

// Player looks. Shirt color is assigned by the room; the rest is the player's choice.
export const SHIRTS = ['#e8604c', '#4a90d9', '#5cb85c', '#f0c419', '#9b6fd1', '#ef8a3c',
  '#2bb3a0', '#f2efe9', '#f27db0', '#8d6e63', '#8e99a6', '#3fd0e0'];
export const HAIR_STYLES = ['crop', 'bob', 'bun', 'spiky', 'long', 'afro'];
export const HAIR_COLORS = ['#3a2a20', '#1f1c1a', '#e1b659', '#c4622d', '#a39e95', '#e58fb1'];
export const SKINS = ['#f6d7bb', '#e9b994', '#c98d63', '#94603f', '#5e3b27'];

export function cleanLook(look = {}) {
  const pick = (v, max) => (Number.isInteger(v) && v >= 0 && v < max ? v : 0);
  return {
    hair: HAIR_STYLES.includes(look.hair) ? look.hair : 'crop',
    hairColor: pick(look.hairColor, HAIR_COLORS.length),
    skin: pick(look.skin, SKINS.length),
  };
}

export function randomLook() {
  const r = n => Math.floor(Math.random() * n);
  return { hair: HAIR_STYLES[r(HAIR_STYLES.length)], hairColor: r(HAIR_COLORS.length), skin: r(SKINS.length) };
}
