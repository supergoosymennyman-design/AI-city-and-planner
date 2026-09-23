/**
 * gen-flow.js — the "Make it real" / "Make from words" flow as a pure state machine (design doc §3).
 *
 * The panel renders `state.view` and runs `state.effect`; buttons only dispatch events. No DOM, no
 * network — tested in Node.
 *   Views:   settings · check (route A) · words (route B) · running · result · adding · error
 *   Effects: capture · run · add · sample · close   (null = nothing to do)
 *
 * Route A also owns the framing of the four snapshots — `turn`/`tilt` (the angle all four cameras
 * are set to) and `wholeBuild` (send everything, rather than just what the child has selected).
 * Each of those is held here rather than in the panel so that changing one re-captures through the
 * same single path as Retake, instead of a second way to reach the renderer.
 */
import { normaliseTurn, clampTilt } from './gen-angles.js';
export const FIRST_STEP = { A: 'edit', B: 'picture' };
export const SECOND_STEP = { A: 'views3d', B: 'picture3d' };
export const TEXTURE_STEP = 'texture';

const startView = (route) => (route === 'A' ? 'check' : 'words');

/**
 * The state when the panel opens.
 * @param {'A'|'B'} route
 * @param {boolean} ready whether an adult has saved the keys (gen-config isRouteReady)
 * @param {boolean} [textureEnabled] whether the optional post-shape model is not `none`
 * @param {'low'|'standard'|'high'|null} [detailLevel] child-facing model preset, or a custom adult value
 */
export function initialState(route, ready, textureEnabled = false, detailLevel = 'standard') {
  if (route !== 'A' && route !== 'B') throw new Error(`initialState: unknown route "${route}"`);
  return {
    route,
    view: ready ? startView(route) : 'settings',
    effect: ready && route === 'A' ? 'capture' : null,
    step: null,
    snapshot: null,
    words: '',
    prompt: '',
    promptEdited: false,
    result: null,
    firstResult: null,
    sample: false,
    error: null,
    notice: ready ? null : 'no-key',
    textureEnabled: !!textureEnabled,
    shapeResult: null,
    turn: 0,
    tilt: 0,
    wholeBuild: false,
    detailLevel,
  };
}

/** The snapshot framing, kept across a settings trip so an adult saving a key does not undo it. */
const framing = (s) => ({ turn: s.turn || 0, tilt: s.tilt || 0, wholeBuild: !!s.wholeBuild });

/**
 * The next state for an event. Returns a new object; never mutates `state`.
 * @param {object} state
 * @param {{type: string}} event
 */
export function reduce(state, event) {
  const s = { ...state, effect: null };
  if (s.view === 'adding' && !['added', 'failed', 'cancelled'].includes(event.type)) return s;
  switch (event.type) {
    case 'open-settings':
      return { ...s, view: 'settings', notice: null };
    case 'settings-saved':
      return event.ready
        ? { ...initialState(s.route, true, event.textureEnabled, event.detailLevel ?? s.detailLevel), ...framing(s) }
        : { ...s, view: 'settings', notice: 'no-key' };
    case 'captured':
      return { ...s, view: 'check', snapshot: event.snapshot, error: null };
    case 'retake':
      return { ...s, snapshot: null, effect: 'capture' };
    // The three below all mean "the next snapshot should look different", so they all clear the
    // current one and re-capture. Dropping the snapshot matters: leaving the old pictures on screen
    // while new ones render is how a child sends a sheet they never actually looked at.
    case 'set-angles':
      if (s.route !== 'A') return s;
      return { ...s, turn: normaliseTurn(event.turn), tilt: clampTilt(event.tilt),
        snapshot: null, effect: 'capture', error: null };
    case 'reset-angles':
      if (s.route !== 'A') return s;
      return { ...s, turn: 0, tilt: 0, snapshot: null, effect: 'capture', error: null };
    case 'set-scope':
      if (s.route !== 'A') return s;
      return { ...s, wholeBuild: !!event.wholeBuild, snapshot: null, effect: 'capture', error: null };
    case 'set-detail':
      if (!['low', 'standard', 'high'].includes(event.level)) return s;
      return { ...s, detailLevel: event.level, error: null };
    case 'words':
      return { ...s, words: event.words, prompt: s.promptEdited ? s.prompt : event.prompt, error: null };
    case 'prompt-edited':
      return { ...s, prompt: event.prompt, promptEdited: true };
    case 'prompt-reset':
      return { ...s, prompt: event.prompt, promptEdited: false };
    case 'send':
      if (!String(s.words).trim()) return { ...s, error: 'words-required' };
      if (s.route === 'A' && !s.snapshot) return { ...s, effect: 'capture' };
      return { ...s, view: 'running', step: FIRST_STEP[s.route], effect: 'run', error: null, sample: false };
    case 'step-done':
      if (s.step === SECOND_STEP[s.route] && s.textureEnabled) {
        return { ...s, view: 'running', step: TEXTURE_STEP, shapeResult: event.result, result: null,
          effect: 'run', error: null };
      }
      return { ...s, view: 'result', result: event.result, warning: event.warning || null, error: null };
    case 'use-this':
      if (s.view !== 'result') return s;
      if (s.step === FIRST_STEP[s.route]) {
        return { ...s, view: 'running', step: SECOND_STEP[s.route], firstResult: s.result, result: null, effect: 'run' };
      }
      return { ...s, view: 'adding', effect: 'add' };
    case 'try-again':
      if (!s.step) return s;
      return { ...s, view: 'running', effect: 'run', error: null, sample: false };
    case 'back':
      if (s.view === 'result' && [SECOND_STEP[s.route], TEXTURE_STEP].includes(s.step) && s.firstResult && !s.sample) {
        return { ...s, step: FIRST_STEP[s.route], result: s.firstResult, firstResult: null, shapeResult: null };
      }
      return {
        ...s,
        view: startView(s.route),
        step: null,
        result: null,
        firstResult: null,
        shapeResult: null,
        sample: false,
        error: null,
        effect: s.route === 'A' && !s.snapshot ? 'capture' : null,
        ...framing(s),
      };
    case 'failed':
      return { ...s, view: 'error', error: event.error };
    case 'cancelled':
      return { ...s, view: startView(s.route), step: null, result: null, firstResult: null, shapeResult: null, error: null };
    case 'show-sample':
      return { ...s, effect: 'sample' };
    case 'sample-loaded':
      return { ...s, view: 'result', step: SECOND_STEP[s.route], result: event.model, firstResult: event.picture, sample: true, error: null };
    case 'added':
      return { ...s, effect: 'close' };
    default:
      throw new Error(`reduce: unknown event "${event.type}"`);
  }
}
