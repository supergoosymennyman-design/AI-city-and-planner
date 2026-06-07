/**
 * A controllable stand-in for the browser's (webkit-prefixed) Web Speech `SpeechRecognition`.
 *
 * WHY: real STT streams the child's audio to Google's servers — non-deterministic, network-
 * bound, and absent on the dev machine / iPad (§5). So we never try to pipe real audio. To
 * TEST or DEMO the teach-by-voice mechanic we swap the global for this fake and drive it by
 * hand: `controller.say('blue')`, `controller.silence()`, `controller.error()`. It exercises
 * the REAL `listenOnce` code path (start → onresult/onerror/onend → timeout race) unchanged —
 * in jsdom (Vitest) and in the live dev browser (the host's voice-sim panel).
 */

/** The subset of the result-event shape that `listenOnce` reads (`e.results[0][0].transcript`). */
type ResultEvent = { results?: ArrayLike<ArrayLike<{ transcript?: string }>> };

/** Globals object onto which the (non-standard) recognition constructors are installed. */
interface RecognitionGlobal {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
}

/**
 * Hand control over whatever recognizer is currently "listening".
 * The host's dev panel and Vitest tests both drive voice through this one object.
 */
export interface VoiceSimController {
  /** Feed a spoken phrase — fires `onresult` (so `listenOnce` resolves it) then `onend`. */
  say(transcript: string): void;
  /** Mic opened but caught nothing — fires only `onend`, so `listenOnce` resolves `null`. */
  silence(): void;
  /** Recognizer error (e.g. `no-speech`) — fires `onerror` then `onend` → resolves `null`. */
  error(): void;
  /** True while a recognizer is mid-listen (drives the dev panel's enabled state). */
  readonly active: boolean;
}

// The recognizer that most-recently `.start()`ed and hasn't finished. Module-scoped so the
// constructor handed to the app and the controller handed to the test share one target.
let current: FakeSpeechRecognition | null = null;

/** Minimal, hand-driven implementation of the Web Speech recognition object. */
class FakeSpeechRecognition {
  lang = '';
  interimResults = false;
  maxAlternatives = 1;
  onresult: (e: ResultEvent) => void = () => {};
  onerror: () => void = () => {};
  onend: () => void = () => {};
  private ended = false;

  start(): void {
    this.ended = false;
    current = this; // become the active recognizer the controller drives
  }

  stop(): void {
    this.finishWithEnd();
  }

  /** Deliver a transcript (then end), as the browser does on a successful capture. */
  deliver(transcript: string): void {
    if (this.ended) return;
    this.onresult({ results: [[{ transcript }]] });
    this.finishWithEnd();
  }

  /** Deliver an error (then end), as the browser does on `no-speech`/`aborted`/etc. */
  fail(): void {
    if (this.ended) return;
    this.onerror();
    this.finishWithEnd();
  }

  private finishWithEnd(): void {
    if (this.ended) return;
    this.ended = true;
    if (current === this) current = null;
    this.onend(); // `listenOnce`'s done-guard makes this a no-op after a result/error
  }
}

/** The single controller the app + tests share (acts on whichever recognizer is active). */
const controller: VoiceSimController = {
  say: (transcript) => current?.deliver(transcript),
  silence: () => current?.stop(),
  error: () => current?.fail(),
  get active() {
    return current !== null;
  },
};

/**
 * Install the fake as `window.SpeechRecognition` + `webkitSpeechRecognition` so the host's
 * `probe('listen')` reports available and `listenOnce` uses it. Returns the controller.
 * Pass a target for jsdom/global (defaults to `globalThis`).
 */
export function installFakeSpeechRecognition(
  target: RecognitionGlobal = globalThis as unknown as RecognitionGlobal,
): VoiceSimController {
  target.SpeechRecognition = FakeSpeechRecognition;
  target.webkitSpeechRecognition = FakeSpeechRecognition;
  return controller;
}

/** Remove the fake and clear any active recognizer (test teardown / opt back into real STT). */
export function uninstallFakeSpeechRecognition(
  target: RecognitionGlobal = globalThis as unknown as RecognitionGlobal,
): void {
  delete target.SpeechRecognition;
  delete target.webkitSpeechRecognition;
  current = null;
}
