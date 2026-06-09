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
import { debug } from '@edu/debug';
import { JointDetectionManager } from './engine/joints.js';
import type { VisionTasksLib, JointResults, MpLandmark } from './engine/joints.js';
import { RecognitionManager } from './engine/recognition.js';
import type { CocoSsdLib, TfLib, MobilenetLib, KnnClassifierLib } from './engine/recognition.js';

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
  /** Inject the @mediapipe/tasks-vision module (tests/DI). Omit → dynamic-import the peer dep. */
  visionTasks?: VisionTasksLib;
  /** Inject tfjs + coco-ssd (tests/DI). Omit → dynamic-import the peer deps. */
  tf?: TfLib;
  cocoSsd?: CocoSsdLib;
  /** Inject MobileNet + knn-classifier (the teachable image extractor; tests/DI). */
  mobilenet?: MobilenetLib;
  knnClassifier?: KnnClassifierLib;
  /** Host-served URL of the tasks-vision wasm dir + .task models (omit → official CDN, online-only). */
  mpWasmBase?: string;
  handModelUrl?: string;
  poseModelUrl?: string;
  /** Local (host-served) coco-ssd model graph URL. */
  cocoModelUrl?: string;
  /** Local (host-served) MobileNet model graph URL — keeps the teachable extractor offline. */
  mobilenetUrl?: string;
  /** Max ms to wait for one detectPose frame before resolving `[]` (default 1500). */
  detectPoseTimeoutMs?: number;
}

/**
 * Lazily import an OPTIONAL peer module via a LITERAL specifier so the bundler (Vite/Rollup) can
 * statically resolve + code-split it. The previous approach used a *variable* specifier with
 * `@vite-ignore`, which Vite leaves as a bare runtime `import('@tensorflow-models/...')` the browser
 * cannot resolve — so tfjs/MobileNet/coco never actually loaded (the teachable image path silently
 * died). Resolves `null` if the module is absent (best-effort, rule #12); tests inject fakes and never
 * reach here. No CDN — the host bundles these from npm.
 */
const optionalImport = async <T>(loader: () => Promise<unknown>): Promise<T | null> => {
  try {
    return (await loader()) as T;
  } catch {
    return null;
  }
};

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

// Official MediaPipe Tasks Vision assets (online-only fallback when the host doesn't self-host).
// Self-host for offline/rule-#4: serve node_modules/@mediapipe/tasks-vision/wasm + the .task models
// and pass mpWasmBase/handModelUrl/poseModelUrl.
const MP_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const HAND_MODEL_CDN =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const POSE_MODEL_CDN =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/** Map joint results → contract Landmarks: primary hand, else pose, else none. */
function resultsToLandmarks(r: JointResults | null): Landmark[] {
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

  async function loadVisionTasks(): Promise<VisionTasksLib | null> {
    if (opts.visionTasks) return opts.visionTasks;
    // The module namespace IS { FilesetResolver, HandLandmarker, PoseLandmarker }.
    return optionalImport<VisionTasksLib>(() => import('@mediapipe/tasks-vision'));
  }

  /**
   * Resolve the vision libs the teachable-image path needs: tfjs + MobileNet + knn-classifier
   * (the feature-extractor + classifier), plus coco-ssd as the no-training fallback. Each is
   * best-effort — a missing peer dep just disables that capability, never throws (rule #12).
   */
  async function loadVision(): Promise<{
    tf: TfLib | null;
    cocoSsd: CocoSsdLib | null;
    mobilenet: MobilenetLib | null;
    knnClassifier: KnnClassifierLib | null;
  } | null> {
    // Injected (tests/DI): use exactly what was provided, no dynamic import.
    if (opts.tf || opts.cocoSsd || opts.mobilenet || opts.knnClassifier) {
      return {
        tf: opts.tf ?? null,
        cocoSsd: opts.cocoSsd ?? null,
        mobilenet: opts.mobilenet ?? null,
        knnClassifier: opts.knnClassifier ?? null,
      };
    }
    // Literal specifiers so Vite/Rollup resolve + code-split each lib (see optionalImport).
    const tf = await optionalImport<TfLib>(() => import('@tensorflow/tfjs'));
    if (!tf) return null; // no tfjs → no image ML at all
    const [cocoSsd, mobilenet, knnClassifier] = await Promise.all([
      optionalImport<CocoSsdLib>(() => import('@tensorflow-models/coco-ssd')),
      optionalImport<MobilenetLib>(() => import('@tensorflow-models/mobilenet')),
      optionalImport<KnnClassifierLib>(() => import('@tensorflow-models/knn-classifier')),
    ]);
    return { tf, cocoSsd, mobilenet, knnClassifier };
  }

  /** Lazily build the pose engine once; null if the tasks-vision lib is unavailable. */
  async function ensureJoints(): Promise<JointDetectionManager | null> {
    if (disposed) return null;
    if (jointsAttempted) return jointsReady ? joints : null;
    jointsAttempted = true;
    const vt = await loadVisionTasks();
    if (!vt || !vt.FilesetResolver) return null;
    // Hands only by default — the gesture games' need, and one model (lighter than +pose, §8).
    const mgr = new JointDetectionManager({
      enableHands: true,
      enablePose: false,
      visionTasks: vt,
      wasmBase: opts.mpWasmBase ?? MP_WASM_CDN,
      handModelUrl: opts.handModelUrl ?? HAND_MODEL_CDN,
      poseModelUrl: opts.poseModelUrl ?? POSE_MODEL_CDN,
    });
    mgr.onError = (m: string) => debug('toolbox:joints')(m);
    // initialize() loads the model asynchronously — await readiness, bounded so a hung/slow load
    // can't wedge the adapter (rule #12); on timeout we proceed (not-yet-ready landmarker → []).
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 15000);
      mgr.onReady = done;
      mgr.initialize();
    });
    joints = mgr;
    jointsReady = true;
    return mgr;
  }

  /** Lazily build the recognition engine; MobileNet+KNN teachable works even without coco-ssd. */
  async function ensureRecognition(): Promise<RecognitionManager | null> {
    if (disposed) return null;
    if (recognitionAttempted) return recognition;
    recognitionAttempted = true;
    const libs = await loadVision();
    const mgr = new RecognitionManager({
      tf: libs?.tf ?? null,
      cocoSsd: libs?.cocoSsd ?? null,
      mobilenet: libs?.mobilenet ?? null,
      knnClassifier: libs?.knnClassifier ?? null,
      cocoModelUrl: opts.cocoModelUrl ?? '',
      mobilenetUrl: opts.mobilenetUrl ?? '',
      enableTeaching: true,
    });
    // Surface engine errors (model load / infer / predict) to the debug channel instead of
    // swallowing them. A swallowed load failure is exactly what hid the broken dynamic-import:
    // teaching silently no-op'd and classify returned 'unknown' with no signal. Gated off in prod.
    mgr.onError = (m: string) => debug('toolbox:recognition')(m);
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
