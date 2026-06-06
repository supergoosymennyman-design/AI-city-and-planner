/**
 * Color the Rainbow — the pure game reducer (the FSM extracted from the prototype's
 * imperative `RainbowGame`). `reduce(data, action)` is a total, side-effect-free
 * function: same inputs → same output. Audio/TTS/timers are the view's job; this file
 * only moves state. That separation is what makes the FSM unit-testable (M4).
 */
import { assertNever } from '@edu/debug';
import type { Action, Colour, GameData, Shape } from './types.js';
import { COLOURS, SHAPES, TOTAL_ROUNDS, freshData, hexToRgb } from './data.js';

/** Apply one action. Guards on `state` so stray taps in the wrong phase are no-ops. */
export function reduce(data: GameData, action: Action): GameData {
  switch (action.type) {
    case 'START_TEACHING':
    case 'RETEACH': {
      // Bot forgets everything; child starts painting the first colour.
      return { ...freshData(), state: 'teaching', bubble: { k: 'teach.colorPrompt' } };
    }

    case 'RESET': {
      return { ...freshData(), bubble: { k: 'reset' } };
    }

    case 'SELECT_COLOUR': {
      if (data.state !== 'teaching') return data;
      return { ...data, selectedHex: action.hex, sound: null };
    }

    case 'TAP_SHAPE': {
      if (data.state !== 'teaching') return data;
      // Must pick a colour before painting — gentle nudge, no state change.
      if (!data.selectedHex) return { ...data, bubble: { k: 'teach.pickFirst' }, sound: null };
      return { ...data, shapeFilled: true, bubble: { k: 'teach.dontKnow' }, sound: null };
    }

    case 'TEACH_COLOR': {
      if (data.state !== 'teaching') return data;
      if (!data.shapeFilled || !data.selectedHex) {
        return { ...data, bubble: { k: 'teach.pickFirst' }, sound: null };
      }
      // Ask the child to NAME it. The AI has NO idea what colour it is — it will learn
      // whatever label the child gives, with no correction (honest teachable machine).
      return { ...data, awaitingColorName: true, bubble: { k: 'teach.whatColour' }, sound: null };
    }

    case 'ANSWER_COLOUR': {
      if (data.state !== 'teaching' || !data.awaitingColorName || !data.selectedHex) return data;
      const label = action.colour; // whatever the child SAYS/taps — this becomes the AI's truth
      // Already taught this label? Nudge toward an untaught one so all three get covered.
      // (Coverage guidance, NOT a truth-correction — the AI never judges the actual colour.)
      if (data.learned[label].rgb) {
        return { ...data, bubble: { k: 'teach.alreadyKnow', colour: label }, sound: null };
      }
      // The AI LEARNS this swatch as `label`, whatever colour it actually is. THIS is the
      // lesson: teach it a red circle is "blue" and it will call red things "blue" (§ Big Idea 3).
      const learned: Record<Colour, GameData['learned'][Colour]> = {
        ...data.learned,
        [label]: { ...data.learned[label], rgb: hexToRgb(data.selectedHex) },
      };
      const taughtCount = data.taughtCount + 1;
      const base: GameData = {
        ...data,
        learned,
        taughtCount,
        selectedHex: null,
        shapeFilled: false,
        awaitingColorName: false,
        sound: 'done',
        bubble: { k: 'teach.learned', colour: label },
      };
      // All three labels taught → into the recognition game (Part C); view rolls round 1.
      if (taughtCount >= COLOURS.length) {
        return { ...base, state: 'game', gameRound: 0, gameScore: 0, gamePick: null, gameShape: null };
      }
      return base;
    }

    case 'START_ROUND': {
      if (data.state !== 'game') return data;
      return {
        ...data,
        gamePick: action.pick,
        gameShape: action.shape,
        gameFeedback: null,
        bubble: { k: 'game.ask' },
        sound: null,
      };
    }

    case 'GAME_TAP': {
      // Ignore taps once feedback is showing (debounce) or before a round is set up.
      if (data.state !== 'game' || data.gameFeedback || !data.gamePick) return data;
      if (action.chosen === data.gamePick) {
        return {
          ...data,
          gameScore: data.gameScore + 1,
          gameFeedback: 'correct',
          sound: 'correct',
          bubble: { k: 'game.correct' },
        };
      }
      return {
        ...data,
        gameFeedback: 'wrong',
        sound: 'wrong',
        bubble: { k: 'game.wrong', phrase: data.phraseIndex, actual: data.gamePick },
        phraseIndex: data.phraseIndex + 1,
      };
    }

    case 'ADVANCE_AFTER_FEEDBACK': {
      if (data.state !== 'game' || !data.gameFeedback) return data;
      const gameRound = data.gameRound + 1;
      const cleared = { ...data, gameRound, gameFeedback: null, gamePick: null, gameShape: null, sound: null };
      if (gameRound >= TOTAL_ROUNDS) {
        return { ...cleared, state: 'result', bubble: { k: 'result', score: data.gameScore } };
      }
      return cleared; // gamePick null → the view rolls the next round
    }

    case 'PLAY_AGAIN': {
      if (data.state !== 'result') return data;
      return {
        ...data,
        state: 'game',
        gameRound: 0,
        gameScore: 0,
        gameFeedback: null,
        gamePick: null,
        gameShape: null,
        phraseIndex: 0,
        sound: null,
        bubble: { k: 'game.ask' },
      };
    }

    default:
      // Exhaustiveness guard: adding an Action without a case here is a compile error.
      return assertNever(action);
  }
}

/**
 * Roll the colour + shape for the next quiz round. Randomness lives here (not in
 * {@link reduce}) and is injectable, so the view uses `Math.random` while tests pin it.
 * Falls back to all colours if (defensively) none are learned yet.
 */
export function pickRound(
  data: GameData,
  rng: () => number = Math.random,
): { pick: Colour; shape: Shape } {
  const available = COLOURS.filter((c) => data.learned[c].rgb !== null);
  const pool = available.length ? available : COLOURS;
  const pick = pool[Math.floor(rng() * pool.length)]!;
  const shape = SHAPES[Math.floor(rng() * SHAPES.length)]!;
  return { pick, shape };
}
