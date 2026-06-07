/**
 * Hand-written types for recognition.js (typed boundary; sits beside the .js so TS
 * does not synthesize a declaration from it).
 */

export interface CocoPrediction {
  class: string;
  score: number;
  bbox: number[];
}

/** Minimal structural shape of a coco-ssd model (we don't depend on upstream types). */
export interface CocoModel {
  detect(img: unknown, maxBoxes?: number, minScore?: number): Promise<CocoPrediction[]>;
  dispose?(): void;
}

/** Minimal coco-ssd module shape — INJECTED (no CDN global). */
export interface CocoSsdLib {
  load(config?: { base?: string; modelUrl?: string }): Promise<CocoModel>;
}

/** Minimal tfjs shape we touch. */
export interface TfLib {
  ready?(): Promise<void>;
}

export interface RecognitionOptions {
  modelType?: string;
  scoreThreshold?: number;
  cameraFacingMode?: string;
  maxTeachSamples?: number;
  width?: number;
  height?: number;
  knnTopK?: number;
  enableTeaching?: boolean;
  /** Injected TensorFlow.js (no CDN). */
  tf?: TfLib | null;
  /** Injected coco-ssd module (no CDN). */
  cocoSsd?: CocoSsdLib | null;
  /** Local (host-served) coco-ssd model graph URL. */
  cocoModelUrl?: string;
}

export interface ClassifyResult {
  label: string;
  confidence: number;
}

export declare class RecognitionManager {
  constructor(options?: RecognitionOptions);

  ready: boolean;
  cameraActive: boolean;

  onClassification: ((r: ClassifyResult) => void) | null;
  onCameraReady: ((ready: boolean) => void) | null;
  onError: ((message: string) => void) | null;
  onReady: ((ready: boolean) => void) | null;
  onClassTaught: ((info: { label: string; sampleCount: number }) => void) | null;

  /** Load the injected coco-ssd model (or go KNN-only if none injected). */
  initialize(): void;
  /** Add one labeled KNN sample from a single frame. */
  addSample(label: string, frame: unknown): boolean;
  /** Classify one frame → {label, confidence}; never rejects. */
  classifyFrame(frame: unknown): Promise<ClassifyResult>;

  startCamera(videoElement: unknown, facingMode?: string, callback?: (ok: boolean) => void): void;
  stopCamera(): void;
  getKnownClasses(): Array<{ label: string; sampleCount: number }>;
  getState(): Record<string, unknown>;
  destroy(): void;
}
