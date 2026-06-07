import { describe, it, expect, afterEach } from 'vitest';
import { createAIServices } from './ai.js';
import type { HolisticCtor } from './engine/joints.js';
import type { CocoSsdLib, TfLib } from './engine/recognition.js';

/* ------------------------------------------------------------------ fakes -- */

type Emit = 'hand' | 'none' | 'silent';

/** A fake MediaPipe Holistic whose behaviour we control per test. */
function makeFakeHolistic(emit: Emit = 'hand', throwOnNew = false) {
  let closed = false;
  class Fake {
    cb: ((r: unknown) => void) | null = null;
    constructor(_cfg: { locateFile?: (f: string) => string }) {
      if (throwOnNew) throw new Error('holistic ctor boom');
    }
    setOptions(_o: unknown) {}
    onResults(cb: (r: unknown) => void) {
      this.cb = cb;
    }
    send(_input: { image: unknown }) {
      if (emit === 'silent') return Promise.resolve(); // never calls onResults
      return Promise.resolve().then(() => {
        if (emit === 'none') this.cb?.({});
        else
          this.cb?.({
            rightHandLandmarks: Array.from({ length: 21 }, (_, i) => ({ x: i / 21, y: 0.5, z: 0 })),
          });
      });
    }
    close() {
      closed = true;
    }
  }
  return { Ctor: Fake as unknown as HolisticCtor, wasClosed: () => closed };
}

const fakeTf: TfLib = { ready: () => Promise.resolve() };
const cocoReturning = (preds: Array<{ class: string; score: number; bbox: number[] }>): CocoSsdLib => ({
  load: async () => ({ detect: async () => preds, dispose() {} }),
});
const cocoRejecting = (): CocoSsdLib => ({
  load: async () => ({
    detect: async () => {
      throw new Error('detect failed');
    },
    dispose() {},
  }),
});

/* ----------------------------------------------------------- speech stubs -- */

interface RecCfg {
  result?: string;
  silent?: boolean;
}
function installFakeSpeech(cfg: RecCfg) {
  class FakeRec {
    lang = '';
    interimResults = false;
    maxAlternatives = 1;
    onresult: (e: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void = () => {};
    onerror: () => void = () => {};
    onend: () => void = () => {};
    start() {
      if (cfg.silent) return; // never fires onresult/onend → must hit the timeout
      setTimeout(() => this.onresult({ results: [[{ transcript: cfg.result ?? '' }]] }), 0);
    }
    stop() {}
  }
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRec;
}

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
});

/* ------------------------------------------------------------------ tests -- */

describe('createAIServices.detectPose (rule #12: never hangs/throws)', () => {
  it('returns the primary hand landmarks when a hand is detected', async () => {
    const { Ctor } = makeFakeHolistic('hand');
    const ai = createAIServices({ holisticCtor: Ctor });
    const lm = await ai.detectPose({} as HTMLVideoElement);
    expect(lm).toHaveLength(21);
    expect(lm[0]).toHaveProperty('x');
  });

  it('resolves [] when the model never responds (timeout failsafe)', async () => {
    const { Ctor } = makeFakeHolistic('silent');
    const ai = createAIServices({ holisticCtor: Ctor, detectPoseTimeoutMs: 10 });
    const lm = await ai.detectPose({} as HTMLVideoElement);
    expect(lm).toEqual([]);
  });

  it('resolves [] when the Holistic constructor throws', async () => {
    const { Ctor } = makeFakeHolistic('hand', /* throwOnNew */ true);
    const ai = createAIServices({ holisticCtor: Ctor });
    const lm = await ai.detectPose({} as HTMLVideoElement);
    expect(lm).toEqual([]);
  });

  it('serializes concurrent calls without cross-talk', async () => {
    const { Ctor } = makeFakeHolistic('hand');
    const ai = createAIServices({ holisticCtor: Ctor });
    const [a, b] = await Promise.all([
      ai.detectPose({} as HTMLVideoElement),
      ai.detectPose({} as HTMLVideoElement),
    ]);
    expect(a).toHaveLength(21);
    expect(b).toHaveLength(21);
  });
});

describe('createAIServices.classifyImage / trainImageClass (rule #12)', () => {
  it('returns the detector best label', async () => {
    const ai = createAIServices({ tf: fakeTf, cocoSsd: cocoReturning([{ class: 'dog', score: 0.9, bbox: [0, 0, 1, 1] }]) });
    const r = await ai.classifyImage({} as HTMLVideoElement);
    expect(r).toEqual({ label: 'dog', confidence: 0.9 });
  });

  it('resolves a safe default when the detector rejects', async () => {
    const ai = createAIServices({ tf: fakeTf, cocoSsd: cocoRejecting() });
    const r = await ai.classifyImage({} as HTMLVideoElement);
    expect(r).toEqual({ label: 'unknown', confidence: 0 });
  });

  it('trainImageClass never throws (no canvas → swallowed)', async () => {
    const ai = createAIServices({ tf: fakeTf, cocoSsd: cocoReturning([]) });
    await expect(ai.trainImageClass('cat', {} as HTMLCanvasElement)).resolves.toBeUndefined();
  });
});

describe('createAIServices.listenOnce (rule #12)', () => {
  it('resolves the recognized transcript', async () => {
    installFakeSpeech({ result: 'red' });
    const ai = createAIServices({});
    const heard = await ai.listenOnce({ timeoutMs: 500 });
    expect(heard).toBe('red');
  });

  it('resolves null when speech never fires onresult/onend (timeout)', async () => {
    installFakeSpeech({ silent: true });
    const ai = createAIServices({});
    const heard = await ai.listenOnce({ timeoutMs: 10 });
    expect(heard).toBeNull();
  });

  it('resolves null when no recognizer exists', async () => {
    const ai = createAIServices({});
    const heard = await ai.listenOnce({ timeoutMs: 10 });
    expect(heard).toBeNull();
  });
});

describe('createAIServices.dispose + probe', () => {
  it('dispose() frees the Holistic graph and later calls degrade to []', async () => {
    const { Ctor, wasClosed } = makeFakeHolistic('hand');
    const ai = createAIServices({ holisticCtor: Ctor });
    await ai.detectPose({} as HTMLVideoElement); // builds the engine
    await ai.dispose();
    expect(wasClosed()).toBe(true);
    const after = await ai.detectPose({} as HTMLVideoElement);
    expect(after).toEqual([]);
  });

  it('probe is honest per capability', async () => {
    const { Ctor } = makeFakeHolistic('hand');
    const ai = createAIServices({ holisticCtor: Ctor });
    expect(await ai.probe('recognizePose')).toBe(true);
    expect(await ai.probe('converse')).toBe(false);
    expect(await ai.probe('generateImage')).toBe(false);

    installFakeSpeech({ result: 'x' });
    expect(await ai.probe('listen')).toBe(true);
    (window as unknown as { speechSynthesis?: unknown }).speechSynthesis = { speak() {}, cancel() {} };
    expect(await ai.probe('speak')).toBe(true);
  });
});
