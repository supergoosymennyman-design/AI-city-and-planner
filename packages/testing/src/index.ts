/**
 * @edu/testing — shared test doubles for @edu games. Dev-only (never shipped in a game).
 *
 * - {@link makeFakeContext} / {@link makeFakeAi}: a browser-free `ctx` for render + logic tests.
 * - {@link installFakeSpeechRecognition}: simulate Web Speech STT in jsdom OR the live browser
 *   (the host's dev voice-sim panel), driving the REAL `listenOnce` code path by hand.
 */
export { makeFakeAi } from './fake-ai.js';
export type { FakeAi } from './fake-ai.js';
export { makeFakeContext } from './fake-context.js';
export type { FakeContextOptions } from './fake-context.js';
export {
  installFakeSpeechRecognition,
  uninstallFakeSpeechRecognition,
} from './fake-speech-recognition.js';
export type { VoiceSimController } from './fake-speech-recognition.js';
export { installJsdomCanvas } from './jsdom-canvas.js';
