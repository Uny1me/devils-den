// Shared by the server (rules + collision) and the browser (drawing).

export const WORLD = { w: 1600, h: 1100 };

export const ROOMS = [
  { name: 'Cafeteria',   x: 600,  y: 80,  w: 400,  h: 300 },
  { name: 'Vault',       x: 120,  y: 80,  w: 320,  h: 240 },
  { name: 'Lab',         x: 1160, y: 80,  w: 320,  h: 240 },
  { name: 'Casino',      x: 120,  y: 700, w: 360,  h: 300 },
  { name: 'Library',     x: 620,  y: 720, w: 360,  h: 280 },
  { name: 'Engine Room', x: 1120, y: 700, w: 360,  h: 300 },
  { name: 'Great Hall',  x: 240,  y: 480, w: 1160, h: 140 },
];

export const CORRIDORS = [
  { x: 760,  y: 370, w: 80,  h: 120 }, // cafeteria -> hall
  { x: 240,  y: 310, w: 80,  h: 180 }, // vault -> hall
  { x: 1280, y: 310, w: 80,  h: 180 }, // lab -> hall
  { x: 260,  y: 610, w: 80,  h: 100 }, // hall -> casino
  { x: 760,  y: 610, w: 80,  h: 120 }, // hall -> library
  { x: 1260, y: 610, w: 80,  h: 100 }, // hall -> engine room
  { x: 430,  y: 180, w: 180, h: 70  }, // vault <-> cafeteria
  { x: 990,  y: 180, w: 180, h: 70  }, // cafeteria <-> lab
];

// kind: 'hold' = hold a button for a few seconds, 'sequence' = tap numbers in order
export const TASKS = [
  { id: 't1',  name: 'Count the chips',    kind: 'sequence', x: 200,  y: 790 },
  { id: 't2',  name: 'Shuffle the deck',   kind: 'hold',     x: 410,  y: 940 },
  { id: 't3',  name: 'Crack the safe',     kind: 'sequence', x: 190,  y: 140 },
  { id: 't4',  name: 'Weigh the gold',     kind: 'hold',     x: 380,  y: 270 },
  { id: 't5',  name: 'Calibrate scanner',  kind: 'sequence', x: 1230, y: 140 },
  { id: 't6',  name: 'Mix the serum',      kind: 'hold',     x: 1420, y: 270 },
  { id: 't7',  name: 'Restock snacks',     kind: 'hold',     x: 660,  y: 330 },
  { id: 't8',  name: 'Shelve rare books',  kind: 'hold',     x: 680,  y: 780 },
  { id: 't9',  name: 'Decode the ledger',  kind: 'sequence', x: 920,  y: 950 },
  { id: 't10', name: 'Fuel the generator', kind: 'hold',     x: 1180, y: 780 },
  { id: 't11', name: 'Fix the wiring',     kind: 'sequence', x: 1420, y: 940 },
  { id: 't12', name: 'Check the cameras',  kind: 'sequence', x: 1080, y: 545 },
];

export const BUTTON = { x: 800, y: 200 }; // emergency meeting button
export const SPAWN = { x: 800, y: 260 };

export const RULES = {
  speed: 180,            // px per second
  radius: 14,
  useRange: 55,
  killRange: 70,
  reportRange: 90,
  buttonRange: 70,
  firstKillCooldown: 15, // seconds
  killCooldown: 25,
  holdMs: 3000,          // how long a 'hold' task takes
  minTaskMs: 1500,       // server rejects tasks finished faster than this
  tasksEach: 4,
  meetingSecs: 90,
  resultSecs: 6,
  visionCrew: 260,
  visionDevil: 340,
  emergencyPerPlayer: 1,
  winBonus: 3,           // pieces for each player on the winning side
  doubleVoteCost: 2,     // pieces
  minPlayers: 3,
};

const RECTS = [...ROOMS, ...CORRIDORS];
const inAny = (px, py) => RECTS.some(r => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);

export function canStand(x, y, r = RULES.radius) {
  return inAny(x - r, y - r) && inAny(x + r, y - r) && inAny(x - r, y + r) && inAny(x + r, y + r);
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
