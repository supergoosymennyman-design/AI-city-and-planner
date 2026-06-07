/**
 * Color the Rainbow — domain types for the pure game logic.
 *
 * The original prototype mixed state with DOM rendering and audio side-effects in one
 * object. Here the *state* is a plain serializable record and the *bot's speech* is a
 * semantic descriptor ({@link BubbleMsg}) — NOT a baked English string — so all
 * user-facing text stays externalized (golden rule #3) and the component owns i18n.
 */

/** The four phases of the lesson. */
export type GameState = 'intro' | 'teaching' | 'game' | 'result';

/** The three primary colours the child teaches the bot. */
export type Colour = 'red' | 'blue' | 'yellow';

/** Shapes the bot's swatch can take (purely visual variety). */
export type Shape = 'circle' | 'square' | 'triangle';

/** RGB triple, 0–255 per channel. */
export type Rgb = readonly [number, number, number];

/** One-shot audio feedback request; the view plays it via `ctx.audio.play` then clears. */
export type SoundId = 'correct' | 'wrong' | 'done';

/** What the bot "knows" about one colour. `rgb === null` until the child teaches it. */
export interface Learned {
  rgb: Rgb | null;
  shape: Shape;
  label: Colour;
}

/**
 * The bot's current line, as a semantic message the view maps to `ctx.t(...)`.
 * Discriminated union → exhaustively translatable + unit-testable without strings.
 */
export type BubbleMsg =
  | { k: 'intro' }
  | { k: 'reset' }
  | { k: 'teach.colorPrompt' }
  | { k: 'teach.pickFirst' }
  | { k: 'teach.dontKnow' }
  | { k: 'teach.whatColour' }
  | { k: 'teach.alreadyKnow'; colour: Colour }
  | { k: 'teach.learned'; colour: Colour }
  | { k: 'teach.unsupported' } // child said a real colour the AI doesn't support yet (red/blue/yellow only)
  | { k: 'game.ask' }
  | { k: 'game.correct' }
  | { k: 'game.wrong'; phrase: number; actual: Colour }
  | { k: 'result'; score: number };

/**
 * Whole game state. JSON-serializable (no DOM/closures) so it could be persisted or
 * snapshotted later. `bubble`/`sound` are presentation intents the view consumes.
 */
export interface GameData {
  state: GameState;
  learned: Record<Colour, Learned>;
  /** Currently selected palette colour (hex), or null. Teaching phase only. */
  selectedHex: string | null;
  shapeFilled: boolean;
  taughtCount: number;
  /** True after "Teach AI!" — the bot is waiting for the child to NAME the colour. */
  awaitingColorName: boolean;
  gameRound: number;
  gameScore: number;
  gameFeedback: 'correct' | 'wrong' | null;
  gamePick: Colour | null;
  gameShape: Shape | null;
  /** Rotates through the "wrong" encouragement phrases so they don't repeat. */
  phraseIndex: number;
  bubble: BubbleMsg;
  sound: SoundId | null;
}

/**
 * All state transitions. Randomness for the game round is INJECTED via `START_ROUND`
 * (the view rolls it), keeping {@link reduce} pure → deterministic, testable transitions.
 */
export type Action =
  | { type: 'START_TEACHING' }
  | { type: 'SELECT_COLOUR'; hex: string }
  | { type: 'TAP_SHAPE' }
  | { type: 'TEACH_COLOR' }
  | { type: 'ANSWER_COLOUR'; colour: Colour }
  | { type: 'HEARD_UNSUPPORTED' } // heard a colour word outside red/blue/yellow → honest reaction
  | { type: 'START_ROUND'; pick: Colour; shape: Shape }
  | { type: 'GAME_TAP'; chosen: Colour }
  | { type: 'ADVANCE_AFTER_FEEDBACK' }
  | { type: 'PLAY_AGAIN' }
  | { type: 'RETEACH' }
  | { type: 'RESET' };
