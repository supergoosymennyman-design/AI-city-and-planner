/**
 * Color the Rainbow — constants + pure helpers (ported from the prototype's `data.js`).
 * No user-facing English lives here (that's the i18n catalog); only colour data + math.
 */
import type { Colour, GameData, Learned, Rgb, Shape } from './types.js';

/** Palette swatches the child paints with — exactly the three teachable colours. */
export const PALETTE: ReadonlyArray<{ name: Colour; hex: string }> = [
  { name: 'red', hex: '#FF4444' },
  { name: 'blue', hex: '#4488FF' },
  { name: 'yellow', hex: '#F5D742' },
];

export const COLOURS: readonly Colour[] = ['red', 'blue', 'yellow'];
export const SHAPES: readonly Shape[] = ['circle', 'square', 'triangle'];

export const TOTAL_ROUNDS = 5;
/** Number of rotating "wrong" encouragement phrases in the i18n catalog (feedback.wrong.0..N-1). */
export const WRONG_PHRASE_COUNT = 8;

/** Fisher–Yates shuffle. `rng` injected so callers (and tests) control randomness. */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    // non-null: i,j are valid indices into a non-empty slice
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** '#RRGGBB' → [r,g,b]. Assumes a valid 7-char hex (our palette always is). */
export function hexToRgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** [r,g,b] → '#RRGGBB'. */
export function rgbToHex(rgb: Rgb): string {
  return (
    '#' +
    rgb
      .map((n) => {
        const h = n.toString(16);
        return h.length < 2 ? '0' + h : h;
      })
      .join('')
  );
}

/** A clean starting state: bot knows nothing, sitting on the intro screen. */
export function freshData(): GameData {
  const learned = {} as Record<Colour, Learned>;
  COLOURS.forEach((c, i) => {
    // shape is just visual variety; cycle through the three so taught colours differ
    learned[c] = { rgb: null, shape: SHAPES[i % SHAPES.length]!, label: c };
  });
  return {
    state: 'intro',
    learned,
    selectedHex: null,
    shapeFilled: false,
    taughtCount: 0,
    awaitingColorName: false,
    gameRound: 0,
    gameScore: 0,
    gameFeedback: null,
    gamePick: null,
    gameShape: null,
    phraseIndex: 0,
    bubble: { k: 'intro' },
    sound: null,
  };
}
