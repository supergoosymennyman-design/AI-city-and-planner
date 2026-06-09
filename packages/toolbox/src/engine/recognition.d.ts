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

/** A feature embedding tensor — we only ever pass it to the KNN then dispose it. */
export interface EmbeddingTensor {
  dispose?(): void;
}

/** Minimal MobileNet model shape: turn a frame into a feature embedding. */
export interface MobilenetModel {
  /** `embedding=true` returns the penultimate-layer activation (the feature vector), not class logits. */
  infer(img: unknown, embedding?: boolean): EmbeddingTensor;
  dispose?(): void;
}

/** Minimal MobileNet module shape — INJECTED (no CDN global). */
export interface MobilenetLib {
  load(config?: {
    version?: number;
    alpha?: number;
    modelUrl?: string;
    inputRange?: [number, number];
  }): Promise<MobilenetModel>;
}

/** Result of knn-classifier predictClass: label + per-label confidence map. */
export interface KnnPrediction {
  label: string | null;
  classIndex: number;
  confidences: Record<string, number>;
}

/** Minimal knn-classifier instance shape (the subset we use). */
export interface KnnClassifier {
  addExample(example: EmbeddingTensor, label: string): void;
  predictClass(input: EmbeddingTensor, k?: number): Promise<KnnPrediction>;
  getNumClasses(): number;
  getClassExampleCount(): Record<string, number>;
  clearAllClasses?(): void;
  dispose(): void;
}

/** Minimal knn-classifier module shape — INJECTED (no CDN global). */
export interface KnnClassifierLib {
  create(): KnnClassifier;
}

export interface RecognitionOptions {
  scoreThreshold?: number;
  cameraFacingMode?: string;
  maxTeachSamples?: number;
  knnTopK?: number;
  enableTeaching?: boolean;
  /** Injected TensorFlow.js (no CDN). */
  tf?: TfLib | null;
  /** Injected coco-ssd module (no CDN) — the no-training fallback. */
  cocoSsd?: CocoSsdLib | null;
  /** Injected MobileNet module (no CDN) — the teachable feature extractor. */
  mobilenet?: MobilenetLib | null;
  /** Injected knn-classifier module (no CDN). */
  knnClassifier?: KnnClassifierLib | null;
  /** Local (host-served) coco-ssd model graph URL. */
  cocoModelUrl?: string;
  /** Local (host-served) MobileNet model graph URL. */
  mobilenetUrl?: string;
  /** MobileNet version (1|2) — default 2. */
  mobilenetVersion?: number;
  /** MobileNet width multiplier (0.25/0.5/0.75/1.0) — default 1.0 (best accuracy). */
  mobilenetAlpha?: number;
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

  /** Load the MobileNet extractor + KNN (and optional coco-ssd), then fire onReady. */
  initialize(): void;
  /** Add one labeled MobileNet-embedding sample from a single frame. */
  addSample(label: string, frame: unknown): boolean;
  /** Classify one frame → {label, confidence}; never rejects. */
  classifyFrame(frame: unknown): Promise<ClassifyResult>;

  startCamera(videoElement: unknown, facingMode?: string, callback?: (ok: boolean) => void): void;
  stopCamera(): void;
  classifyImage(videoElement: unknown, callback?: (r: ClassifyResult) => void): void;
  teachClass(label: string, videoElement: unknown, numSamples?: number, callback?: (ok: boolean) => void): void;
  getKnownClasses(): Array<{ label: string; sampleCount: number }>;
  getState(): Record<string, unknown>;
  destroy(): void;
}
