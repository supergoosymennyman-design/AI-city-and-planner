import { describe, it, expect, afterEach } from 'vitest';
import { createAIServices } from './ai.js';
import type { VisionTasksLib, MpLandmark } from './engine/joints.js';
import type { CocoSsdLib, TfLib } from './engine/recognition.js';

/* ------------------------------------------------------------------ fakes -- */

/** A 21-point hand the fake HandLandmarker reports. */
const HAND_21: MpLandmark[] = Array.from({ length: 21 }, (_, i) => ({ x: i / 21, y: 0.5, z: 0 }));

/**
 * A fake @mediapipe/tasks-vision module whose detectForVideo behaviour we control per test. The real
 * detectForVideo is synchronous, so there is no "never responds" failure mode — the rule #12 cases are
 * a throwing detector and a landmarker that fails to build.
 */
function makeFakeVisionTasks(opts: { hand?: MpLandmark[] | 'throw' | 'none'; failBuild?: boolean } = {}) {
  let closed = false;
  const hand = opts.hand === undefined ? HAND_21 : opts.hand;
  const landmarker = {
    detectForVideo: () => {
      if (hand === 'throw') throw new Error('detectForVideo boom');
      if (hand === 'none') return { landmarks: [], handedness: [] };
      return { landmarks: [hand], handedness: [[{ categoryName: 'Right' }]] };
    },
    close: () => {
      closed = true;
    },
  };
  const ctor = {
    createFromOptions: async () => {
      if (opts.failBuild) throw new Error('createFromOptions boom');
      return landmarker;
    },
  };
  const lib = {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    HandLandmarker: ctor,
    PoseLandmarker: ctor,
  } as unknown as VisionTasksLib;
  return { lib, wasClosed: () => closed };
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

/** Fake MobileNet feature extractor: infer(frame) → embedding echoing frame.__v (jsdom has no tfjs). */
const fakeMobilenet = () => ({
  load: async () => ({
    infer: (img: unknown) => ({ __v: (img as { __v?: number } | null)?.__v ?? 0, dispose() {} }),
    dispose() {},
  }),
});
/** Fake knn-classifier: nearest-neighbour over the scalar embeddings (same contract as the real lib). */
const fakeKnn = () => {
  const store: Record<string, number[]> = {};
  return {
    create: () => ({
      addExample: (ex: { __v?: number }, label: string) => {
        (store[label] ??= []).push(ex.__v ?? 0);
      },
      predictClass: async (input: { __v?: number }) => {
        const q = input.__v ?? 0;
        let best: string | null = null;
        let bestD = Infinity;
        for (const [label, vals] of Object.entries(store))
          for (const v of vals) if (Math.abs(v - q) < bestD) { bestD = Math.abs(v - q); best = label; }
        const confidences: Record<string, number> = {};
        for (const l of Object.keys(store)) confidences[l] = l === best ? 1 : 0;
        return { label: best, classIndex: 0, confidences };
      },
      getNumClasses: () => Object.keys(store).length,
      getClassExampleCount: () =>
        Object.fromEntries(Object.entries(store).map(([k, v]) => [k, v.length])),
      dispose() {},
    }),
  };
};

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

describe('createAIServices.detectPose (rule #12: never throws)', () => {
  it('returns the primary hand landmarks when a hand is detected', async () => {
    const ai = createAIServices({ visionTasks: makeFakeVisionTasks().lib });
    const lm = await ai.detectPose({} as HTMLVideoElement);
    expect(lm).toHaveLength(21);
    expect(lm[0]).toHaveProperty('x');
  });

  it('resolves [] when nothing is in frame', async () => {
    const ai = createAIServices({ visionTasks: makeFakeVisionTasks({ hand: 'none' }).lib });
    expect(await ai.detectPose({} as HTMLVideoElement)).toEqual([]);
  });

  it('resolves [] when detectForVideo throws', async () => {
    const ai = createAIServices({ visionTasks: makeFakeVisionTasks({ hand: 'throw' }).lib });
    expect(await ai.detectPose({} as HTMLVideoElement)).toEqual([]);
  });

  it('resolves [] when the landmarker fails to build', async () => {
    const ai = createAIServices({ visionTasks: makeFakeVisionTasks({ failBuild: true }).lib });
    expect(await ai.detectPose({} as HTMLVideoElement)).toEqual([]);
  });

  it('serializes concurrent calls without cross-talk', async () => {
    const ai = createAIServices({ visionTasks: makeFakeVisionTasks().lib });
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

  it('classifyImage returns a taught MobileNet+KNN class over the detector (the KG teach→test loop)', async () => {
    // Full adapter wiring: trainImageClass → RecognitionManager.addSample (MobileNet embedding → KNN),
    // then classifyImage → classifyFrame. coco-ssd is present but a *trained* class must win, mirroring
    // "teach AI → test AI". Frames carry __v so the injected fake extractor yields class-distinct embeddings.
    const ai = createAIServices({
      tf: fakeTf,
      cocoSsd: cocoReturning([{ class: 'dog', score: 0.95, bbox: [0, 0, 1, 1] }]),
      mobilenet: fakeMobilenet(),
      knnClassifier: fakeKnn(),
    });
    const bright = { __v: 220 } as unknown as HTMLCanvasElement;
    const dark = { __v: 30 } as unknown as HTMLCanvasElement;
    for (let i = 0; i < 4; i++) {
      await ai.trainImageClass('sun', bright);
      await ai.trainImageClass('night', dark);
    }
    expect(await ai.classifyImage(bright)).toEqual({ label: 'sun', confidence: expect.any(Number) });
    expect((await ai.classifyImage(dark)).label).toBe('night');
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
  it('dispose() frees the landmarker graph and later calls degrade to []', async () => {
    const f = makeFakeVisionTasks();
    const ai = createAIServices({ visionTasks: f.lib });
    expect(await ai.detectPose({} as HTMLVideoElement)).toHaveLength(21); // builds + detects
    await ai.dispose();
    expect(f.wasClosed()).toBe(true);
    const after = await ai.detectPose({} as HTMLVideoElement);
    expect(after).toEqual([]);
  });

  it('probe is honest per capability', async () => {
    const ai = createAIServices({ visionTasks: makeFakeVisionTasks().lib });
    expect(await ai.probe('recognizePose')).toBe(true);
    expect(await ai.probe('converse')).toBe(false);
    expect(await ai.probe('generateImage')).toBe(false);

    installFakeSpeech({ result: 'x' });
    expect(await ai.probe('listen')).toBe(true);
    (window as unknown as { speechSynthesis?: unknown }).speechSynthesis = { speak() {}, cancel() {} };
    expect(await ai.probe('speak')).toBe(true);
  });
});
