/**
 * RecognitionManager — the teachable-image camera engine.
 *
 * METHOD: MobileNet feature embeddings → @tensorflow-models/knn-classifier (the real Teachable
 * Machine approach), with coco-ssd object detection as the no-training fallback.
 *
 * These tests prove the WIRING (infer → addExample → predictClass → {label,confidence}) with INJECTED
 * fakes, because jsdom has no WebGL/tfjs backend so the real MobileNet/KNN can't run here. Real-world
 * accuracy (the whole point of switching off the old pixel-downsample features) is a browser/webcam
 * concern, verified live — not in jsdom. The fakes model the contract precisely: `infer` returns an
 * embedding carrying a scalar derived from the frame; the fake KNN does nearest-neighbour on it, just
 * like the real one does on 1280-d vectors.
 */
import { describe, it, expect } from 'vitest';
import { RecognitionManager } from './recognition.js';
import type {
  CocoSsdLib,
  TfLib,
  MobilenetLib,
  KnnClassifierLib,
  EmbeddingTensor,
} from './recognition.js';

/* ------------------------------------------------------------------ fakes -- */

/** A synthetic camera frame carrying a scalar the fake MobileNet turns into an embedding. */
const frame = (v: number): unknown => ({ __v: v });

const fakeTf: TfLib = { ready: () => Promise.resolve() };

/** Fake MobileNet: `infer(frame)` → a 1-d embedding echoing `frame.__v`; tracks dispose() calls. */
function fakeMobilenet() {
  let disposed = 0;
  let inferred = 0;
  const lib: MobilenetLib = {
    load: async () => ({
      infer: (img: unknown): EmbeddingTensor => {
        inferred++;
        const v = (img as { __v?: number } | null)?.__v ?? 0;
        return { __v: v, dispose: () => { disposed++; } } as EmbeddingTensor & { __v: number };
      },
      dispose: () => {},
    }),
  };
  return { lib, disposedCount: () => disposed, inferredCount: () => inferred };
}

/** Fake knn-classifier: nearest-neighbour over the scalar embeddings — same contract as the real lib. */
function fakeKnn() {
  const store: Record<string, number[]> = {};
  let disposed = false;
  const lib: KnnClassifierLib = {
    create: () => ({
      addExample: (ex: EmbeddingTensor, label: string) => {
        const v = (ex as { __v?: number }).__v ?? 0;
        (store[label] ??= []).push(v);
      },
      predictClass: async (input: EmbeddingTensor, _k?: number) => {
        const q = (input as { __v?: number }).__v ?? 0;
        let best: string | null = null;
        let bestD = Infinity;
        for (const [label, vals] of Object.entries(store)) {
          for (const v of vals) {
            const d = Math.abs(v - q);
            if (d < bestD) { bestD = d; best = label; }
          }
        }
        const confidences: Record<string, number> = {};
        for (const label of Object.keys(store)) confidences[label] = label === best ? 1 : 0;
        return { label: best, classIndex: 0, confidences };
      },
      getNumClasses: () => Object.keys(store).length,
      getClassExampleCount: () =>
        Object.fromEntries(Object.entries(store).map(([k, v]) => [k, v.length])),
      clearAllClasses: () => { for (const k of Object.keys(store)) delete store[k]; },
      dispose: () => { disposed = true; },
    }),
  };
  return { lib, wasDisposed: () => disposed };
}

/** coco-ssd that always returns the given predictions; tracks whether its model was disposed. */
function cocoReturning(preds: Array<{ class: string; score: number; bbox: number[] }>) {
  let disposed = false;
  const lib: CocoSsdLib = {
    load: async () => ({
      detect: async () => preds,
      dispose() { disposed = true; },
    }),
  };
  return { lib, wasDisposed: () => disposed };
}

/** Resolve once the manager signals ready (after async model loads). */
function initAndReady(mgr: RecognitionManager): Promise<void> {
  return new Promise<void>((resolve) => {
    mgr.onReady = () => resolve();
    mgr.initialize();
  });
}

/* ------------------------------------------------ MobileNet+KNN teach→test -- */

describe('RecognitionManager — MobileNet + KNN teachable loop (the KG camera mechanic)', () => {
  it('classifies a taught class from later frames of the same kind', async () => {
    const net = fakeMobilenet();
    const mgr = new RecognitionManager({
      tf: fakeTf,
      mobilenet: net.lib,
      knnClassifier: fakeKnn().lib,
      enableTeaching: true,
    });
    await initAndReady(mgr);

    for (let i = 0; i < 4; i++) {
      expect(mgr.addSample('circle', frame(210))).toBe(true);
      expect(mgr.addSample('square', frame(40))).toBe(true);
    }

    const bright = await mgr.classifyFrame(frame(205));
    expect(bright.label).toBe('circle');
    expect(bright.confidence).toBeGreaterThan(0.5);

    const dark = await mgr.classifyFrame(frame(45));
    expect(dark.label).toBe('square');
  });

  it('disposes every embedding it infers (no GPU tensor leak)', async () => {
    const net = fakeMobilenet();
    const mgr = new RecognitionManager({
      tf: fakeTf,
      mobilenet: net.lib,
      knnClassifier: fakeKnn().lib,
      enableTeaching: true,
    });
    await initAndReady(mgr);
    mgr.addSample('a', frame(10)); // 1 infer
    await mgr.classifyFrame(frame(10)); // 1 infer
    // Every inferred embedding must be disposed (knn-classifier copies internally).
    expect(net.disposedCount()).toBe(net.inferredCount());
    expect(net.inferredCount()).toBe(2);
  });

  it('reports taught classes/counts and rejects empty label/frame', async () => {
    const mgr = new RecognitionManager({
      tf: fakeTf,
      mobilenet: fakeMobilenet().lib,
      knnClassifier: fakeKnn().lib,
      enableTeaching: true,
    });
    await initAndReady(mgr);

    expect(mgr.addSample('', frame(1))).toBe(false);
    expect(mgr.addSample('cat', null)).toBe(false);
    mgr.addSample('cat', frame(100));
    mgr.addSample('cat', frame(100));
    mgr.addSample('dog', frame(200));

    expect(mgr.getKnownClasses()).toEqual(
      expect.arrayContaining([
        { label: 'cat', sampleCount: 2 },
        { label: 'dog', sampleCount: 1 },
      ]),
    );
    const state = mgr.getState();
    expect(state.numClasses).toBe(2);
    expect(state.knnSamples).toBe(3);
    expect(state.extractor).toBe('mobilenet');
  });

  it('returns {unknown,0} when nothing taught and no detector; never rejects on null frame', async () => {
    const mgr = new RecognitionManager({
      tf: fakeTf,
      mobilenet: fakeMobilenet().lib,
      knnClassifier: fakeKnn().lib,
      enableTeaching: true,
    });
    await initAndReady(mgr);
    expect(await mgr.classifyFrame(frame(123))).toEqual({ label: 'unknown', confidence: 0 });
    await expect(mgr.classifyFrame(null)).resolves.toEqual({ label: 'unknown', confidence: 0 });
  });
});

/* --------------------------------------------------- coco-ssd fallback -- */

describe('RecognitionManager — coco-ssd fallback (no taught classes)', () => {
  it('falls back to object detection when teachable is empty', async () => {
    const coco = cocoReturning([{ class: 'banana', score: 0.88, bbox: [0, 0, 1, 1] }]);
    const mgr = new RecognitionManager({ tf: fakeTf, cocoSsd: coco.lib });
    await initAndReady(mgr);

    const r = await mgr.classifyFrame(frame(150));
    expect(r.label).toBe('banana');
    expect(r.confidence).toBeCloseTo(0.88);
  });

  it('taught classes take priority over the detector', async () => {
    const coco = cocoReturning([{ class: 'banana', score: 0.99, bbox: [0, 0, 1, 1] }]);
    const mgr = new RecognitionManager({
      tf: fakeTf,
      cocoSsd: coco.lib,
      mobilenet: fakeMobilenet().lib,
      knnClassifier: fakeKnn().lib,
      enableTeaching: true,
    });
    await initAndReady(mgr);

    for (let i = 0; i < 4; i++) mgr.addSample('my-toy', frame(70));
    const r = await mgr.classifyFrame(frame(70));
    expect(r.label).toBe('my-toy'); // not 'banana' — taught classes win
  });
});

/* ------------------------------------------------------------- teardown -- */

describe('RecognitionManager — destroy()', () => {
  it('disposes the KNN store + coco detector and clears callbacks', async () => {
    const coco = cocoReturning([{ class: 'cup', score: 0.7, bbox: [0, 0, 1, 1] }]);
    const knn = fakeKnn();
    const mgr = new RecognitionManager({
      tf: fakeTf,
      cocoSsd: coco.lib,
      mobilenet: fakeMobilenet().lib,
      knnClassifier: knn.lib,
      enableTeaching: true,
    });
    await initAndReady(mgr);

    mgr.destroy();
    expect(knn.wasDisposed()).toBe(true);
    expect(coco.wasDisposed()).toBe(true);
    expect(mgr.ready).toBe(false);
    expect(mgr.onReady).toBeNull();
  });
});
