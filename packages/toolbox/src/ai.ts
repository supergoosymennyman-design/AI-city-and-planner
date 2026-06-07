/**
 * `createAIServices` — the canonical {@link AIServices} implementation (§3/§5).
 *
 * Wraps the salvaged engines behind the FROZEN contract as crash-proof, one-shot
 * promises (rule #12): every method resolves a safe default rather than throwing,
 * rejecting, or hanging — a device that never responds must degrade to the tap
 * path, never dead-end a child's loop.
 *
 * The function's `: AIServices` return annotation is the structural conformance
 * gate — if a method is missing or mistyped, `tsc --build` fails here (the
 * contracts gate does not scan this package).
 */
import type { AIServices, Capability, Classification, Landmark } from '@edu/contract';
import { JointDetectionManager } from './engine/joints.js';
import type { HolisticCtor, HolisticResults, MpLandmark } from './engine/joints.js';
import { RecognitionManager } from './engine/recognition.js';
import type { CocoSsdLib, TfLib } from './engine/recognition.js';

/** Minimal shape of the (non-standard, webkit-prefixed) Web Speech recognition object. */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: (e: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

export interface ToolboxAIOptions {
  /** Inject a MediaPipe Holistic constructor (tests/DI). Omit → dynamic-import the peer dep. */
  holisticCtor?: HolisticCtor;
  /** Inject tfjs + coco-ssd (tests/DI). Omit → dynamic-import the peer deps. */
  tf?: TfLib;
  cocoSsd?: CocoSsdLib;
  /** Local (host-served) base path for MediaPipe asset files — never remote. */
  holisticAssetBase?: string;
  /** Local (host-served) coco-ssd model graph URL. */
  cocoModelUrl?: string;
  /** Max ms to wait for one detectPose frame before resolving `[]` (default 1500). */
  detectPoseTimeoutMs?: number;
}

/**
 * Runtime-only dynamic import via a *variable* specifier: `tsc` does not try to
 * resolve the (optional peer) module at build time, and tests never reach it
 * (they inject fakes). The consuming host bundles the package from npm — no CDN.
 */
const dynamicImport = (specifier: string): Promise<unknown> =>
  import(/* @vite-ignore */ specifier);

/** Resolve `promise`, but resolve `fallback` if it doesn't settle within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const done = (v: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => done(fallback), ms);
    promise.then(done, () => done(fallback));
  });
}

/** Map Holistic results → contract Landmarks: primary hand, else pose, else none. */
function resultsToLandmarks(r: HolisticResults | null): Landmark[] {
  if (!r) return [];
  const hand =
    r.rightHandLandmarks && r.rightHandLandmarks.length
      ? r.rightHandLandmarks
      : r.leftHandLandmarks && r.leftHandLandmarks.length
        ? r.leftHandLandmarks
        : null;
  const src = hand ?? (r.poseLandmarks && r.poseLandmarks.length ? r.poseLandmarks : null);
  if (!src) return [];
  return src.map((p: MpLandmark): Landmark => ({ x: p.x, y: p.y, z: p.z }));
}

export function createAIServices(opts: ToolboxAIOptions = {}): AIServices {
  let joints: JointDetectionManager | null = null;
  let jointsAttempted = false;
  let jointsReady = false;
  let recognition: RecognitionManager | null = null;
  let recognitionAttempted = false;
  let disposed = false;
  // Serialize detectPose so a one-shot call never races another's onResults.
  let poseQueue: Promise<unknown> = Promise.resolve();

  async function loadHolistic(): Promise<HolisticCtor | null> {
    if (opts.holisticCtor) return opts.holisticCtor;
    try {
      const mod = (await dynamicImport('@mediapipe/holistic')) as { Holistic?: HolisticCtor };
      return mod?.Holistic ?? null;
    } catch {
      return null;
    }
  }

  async function loadCoco(): Promise<{ tf: TfLib; cocoSsd: CocoSsdLib } | null> {
    if (opts.tf && opts.cocoSsd) return { tf: opts.tf, cocoSsd: opts.cocoSsd };
    try {
      const tf = (await dynamicImport('@tensorflow/tfjs')) as TfLib;
      const cocoSsd = (await dynamicImport('@tensorflow-models/coco-ssd')) as unknown as CocoSsdLib;
      return { tf, cocoSsd };
    } catch {
      return null;
    }
  }

  /** Lazily build the pose engine once; null if the lib is unavailable or it errored at setup. */
  async function ensureJoints(): Promise<JointDetectionManager | null> {
    if (disposed) return null;
    if (jointsAttempted) return jointsReady ? joints : null;
    jointsAttempted = true;
    const Ctor = await loadHolistic();
    if (!Ctor) return null;
    let buildError = false;
    const mgr = new JointDetectionManager({
      enableHands: true,
      enablePose: true,
      HolisticCtor: Ctor,
      holisticAssetBase: opts.holisticAssetBase ?? '',
    });
    mgr.onError = () => {
      buildError = true;
    };
    mgr.initialize(); // injection-only path is synchronous
    joints = mgr;
    jointsReady = !buildError;
    return jointsReady ? mgr : null;
  }

  /** Lazily build the recognition engine; KNN-teachable works even without coco-ssd. */
  async function ensureRecognition(): Promise<RecognitionManager | null> {
    if (disposed) return null;
    if (recognitionAttempted) return recognition;
    recognitionAttempted = true;
    const libs = await loadCoco();
    const mgr = new RecognitionManager({
      tf: libs?.tf ?? null,
      cocoSsd: libs?.cocoSsd ?? null,
      cocoModelUrl: opts.cocoModelUrl ?? '',
      enableTeaching: true,
    });
    // Await model readiness — coco-ssd loads asynchronously, so classifyImage must
    // not run before _detector exists. Bounded by a timeout so a hung load can't
    // wedge the adapter (rule #12); on timeout we proceed (detector-less = KNN-only).
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 10000);
      mgr.onReady = done;
      mgr.initialize();
    });
    recognition = mgr;
    return mgr;
  }

  return {
    probe: async (capability: Capability): Promise<boolean> => {
      if (disposed) return false;
      switch (capability) {
        case 'speak':
          return typeof window !== 'undefined' && 'speechSynthesis' in window;
        case 'listen': {
          if (typeof window === 'undefined') return false;
          const w = window as unknown as {
            SpeechRecognition?: unknown;
            webkitSpeechRecognition?: unknown;
          };
          return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
        }
        case 'recognizeImage':
        case 'trainModel':
          // Teachable KNN needs only a canvas; coco-ssd object detection is best-effort on top.
          return typeof document !== 'undefined' && typeof document.createElement === 'function';
        case 'recognizePose':
          return (await ensureJoints()) !== null;
        default:
          // converse / generateImage / generateAudio: no AIServices method exists yet.
          return false;
      }
    },

    trainImageClass: async (label, frame) => {
      try {
        const mgr = await ensureRecognition();
        if (!mgr || disposed) return;
        mgr.addSample(label, frame);
      } catch {
        /* best-effort: never throw teaching errors into the game */
      }
    },

    classifyImage: async (frame): Promise<Classification> => {
      try {
        const mgr = await ensureRecognition();
        if (!mgr || disposed) return { label: 'unknown', confidence: 0 };
        return await mgr.classifyFrame(frame);
      } catch {
        return { label: 'unknown', confidence: 0 };
      }
    },

    detectPose: (frame): Promise<Landmark[]> => {
      const run = async (): Promise<Landmark[]> => {
        try {
          const mgr = await ensureJoints();
          if (!mgr || disposed) return [];
          const timeoutMs = opts.detectPoseTimeoutMs ?? 1500;
          const results = await withTimeout(mgr.sendOnce(frame), timeoutMs, null);
          return resultsToLandmarks(results);
        } catch {
          return [];
        }
      };
      // Chain so concurrent detectPose calls run one-at-a-time (no onResults cross-talk).
      const p = poseQueue.then(run, run);
      poseQueue = p.catch(() => undefined);
      return p;
    },

    listenOnce: ({ lang = 'en-US', timeoutMs = 6000 } = {}): Promise<string | null> =>
      new Promise<string | null>((resolve) => {
        if (typeof window === 'undefined') return resolve(null);
        const w = window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        };
        const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition;
        if (!Rec) return resolve(null);
        let done = false;
        let rec: SpeechRecognitionLike | null = null;
        const finish = (result: string | null) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          try {
            rec?.stop();
          } catch {
            /* ignore */
          }
          resolve(result);
        };
        // FAILSAFE: Web Speech can silently never fire onend/onerror — timeout guarantees settle.
        const timer = setTimeout(() => finish(null), timeoutMs);
        try {
          rec = new Rec();
          rec.lang = lang;
          rec.interimResults = false;
          rec.maxAlternatives = 1;
          rec.onresult = (e) => finish(e.results?.[0]?.[0]?.transcript ?? null);
          rec.onerror = () => finish(null);
          rec.onend = () => finish(null);
          rec.start();
        } catch {
          finish(null);
        }
      }),

    dispose: async (): Promise<void> => {
      // Idempotent + null-safe. destroy() settles any in-flight sendOnce (resolves
      // null → detectPose resolves []) BEFORE freeing the graph, so nothing hangs.
      disposed = true;
      try {
        joints?.destroy();
      } catch {
        /* ignore */
      }
      try {
        recognition?.destroy();
      } catch {
        /* ignore */
      }
      joints = null;
      recognition = null;
    },
  };
}
