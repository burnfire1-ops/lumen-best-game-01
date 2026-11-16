// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The firefly: its x never changes, only its height. */
export const FIREFLY = {
  x: 280,
  radius: 14,
  flapVelocity: -380,
  gravity: 1100,
  /** Terminal fall speed, so a long fall stays readable. */
  maxFall: 640,
};

/** World scroll: base speed, growth per point, hard cap. */
export const SPEED = { base: 140, perPoint: 4, cap: 260 };

/** Mushroom gap: starting height, shrink per point, floor. */
export const GAP = { height: 170, shrinkPerPoint: 2, floor: 120, width: 74 };

/** Horizontal gap spacing per band: [min, max] px, rolled per gap with the
 * seeded RNG. The rhythm varies and tightens as the score rises; never below
 * 240 px. */
export const SPACING = [
  [320, 400], // 0-5: roomy, for learning
  [300, 360], // 5-10
  [280, 340], // 10-20
  [260, 320], // 20+: tightest
];

/** Light meter: 0..1. Full meter lasts LIGHT.fullSeconds without an orb. */
export const LIGHT = { fullSeconds: 25, orbRefill: 0.25, drain: 1 / 25 };

/** Score bands and their trap rules (guaranteed + random, user-approved). */
export const BANDS = [
  { from: 0, to: 5, traps: [] },
  { from: 5, to: 10, guarantee: ['drop'], extraChance: 0.3, extra: ['drop'] },
  { from: 10, to: 20, guarantee: ['snap', 'wind'], extraChance: 0.4, extra: ['drop', 'narrow', 'snap', 'wind', 'hidden'] },
  { from: 20, to: 9999, guarantee: [], extraChance: 0.65, extra: ['drop', 'narrow', 'snap', 'wind', 'hidden'] },
];

/** Hidden-in-dark trap: the distance at which the glow starts revealing it,
 * the collision radius, and the alpha when it is still far away. */
export const HIDDEN = { reveal: 280, radius: 20, dimAlpha: 0.12 };

/** Power-ups: how often one appears, and how long each lasts. */
export const POWER = {
  everyGaps: 13,
  shieldSeconds: 0, // shield lasts until it absorbs one hit
  magnetSeconds: 5,
  slowSeconds: 3,
  slowFactor: 0.5,
};

/** Win: reaching this score brings the Dawn. */
export const WIN_SCORE = 50;

/** Four forest palettes, one per 10 points, then they loop. */
export const PALETTES = [
  {
    name: 'Senja',
    sky: '#2a1b4a', deep: '#150d2b', fog: '#3b2a63',
    cap: '#2dd4bf', capGlow: '#5eead4', stem: '#1f9d8a',
    orb: '#f2c94c', text: '#fef9c3', panel: '#1e1533', muted: '#a89cc9',
  },
  {
    name: 'Malam Pekat',
    sky: '#0d1b3d', deep: '#050b1d', fog: '#16294f',
    cap: '#22d3ee', capGlow: '#67e8f9', stem: '#1899ad',
    orb: '#fbbf24', text: '#e0f2fe', panel: '#0a1226', muted: '#7d9cc4',
  },
  {
    name: 'Pra-Fajar',
    sky: '#0f3a3a', deep: '#062020', fog: '#14524f',
    cap: '#34d399', capGlow: '#6ee7b7', stem: '#1f9d6e',
    orb: '#fde047', text: '#ecfdf5', panel: '#082622', muted: '#7fb8a4',
  },
  {
    name: 'Fajar',
    sky: '#6b3a2e', deep: '#33200f', fog: '#8a5a3b',
    cap: '#fbbf24', capGlow: '#fde68a', stem: '#b45309',
    orb: '#fde047', text: '#fffbeb', panel: '#3d2412', muted: '#d8a878',
  },
];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumen.best';
