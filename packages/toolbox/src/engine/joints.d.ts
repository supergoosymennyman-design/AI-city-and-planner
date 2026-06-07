/**
 * Hand-written types for joints.js (the typed boundary for the port). This .d.ts
 * sits beside joints.js so TypeScript uses it for types and does NOT synthesize a
 * declaration from the .js (avoids fragile declaration-from-JS under composite).
 */

/** A MediaPipe normalized landmark (image coords 0..1; z relative; visibility optional). */
export interface MpLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/** The results object MediaPipe Holistic hands to its onResults callback. */
export interface HolisticResults {
  leftHandLandmarks?: MpLandmark[];
  rightHandLandmarks?: MpLandmark[];
  poseLandmarks?: MpLandmark[];
  faceLandmarks?: MpLandmark[];
}

/** Minimal structural shape of a MediaPipe Holistic instance (we don't depend on upstream types). */
export interface HolisticInstance {
  setOptions(options: Record<string, unknown>): void;
  onResults(cb: (results: HolisticResults) => void): void;
  send(input: { image: unknown }): Promise<void> | void;
  close?(): void | Promise<void>;
}

/** Constructor for a Holistic instance — INJECTED (never a CDN global). */
export type HolisticCtor = new (config: { locateFile?: (file: string) => string }) => HolisticInstance;

export interface JointDetectionOptions {
  enableHands?: boolean;
  enablePose?: boolean;
  enableFace?: boolean;
  maxNumHands?: number;
  runningMode?: string;
  detectionInterval?: number;
  modelComplexity?: number;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  /** Injected MediaPipe Holistic constructor (no CDN). */
  HolisticCtor?: HolisticCtor | null;
  /** Local base path the host serves Holistic's asset files from. */
  holisticAssetBase?: string;
}

export interface HandResult {
  landmarks: MpLandmark[];
  handedness: string;
  score: number;
}

export interface GestureResult {
  type: string;
  hand: string;
  score: number;
  landmarks: MpLandmark[];
}

export declare class JointDetectionManager {
  constructor(options?: JointDetectionOptions);

  ready: boolean;
  cameraActive: boolean;
  detecting: boolean;

  onHandsDetected: ((hands: HandResult[]) => void) | null;
  onPoseDetected: ((pose: { landmarks: MpLandmark[]; score: number } | null) => void) | null;
  onFaceDetected: ((face: { landmarks: MpLandmark[]; score: number } | null) => void) | null;
  onGesture: ((g: GestureResult) => void) | null;
  onCameraReady: ((ready: boolean) => void) | null;
  onError: ((message: string) => void) | null;
  onReady: ((ready: boolean) => void) | null;

  /** Build the Holistic instance from the injected constructor. */
  initialize(): void;
  /** One-shot detection: push one frame, resolve with the next results (null if unavailable). */
  sendOnce(frame: unknown): Promise<HolisticResults | null>;
  /** Continuous detection loop (escape hatch for live tracking). */
  detectAll(videoElement: unknown, callbacks: Record<string, (arg: never) => void>): void;
  startCamera(videoElement: unknown, callback?: (ok: boolean) => void): void;
  stopCamera(): void;
  stop(): void;
  destroy(): void;

  isPointing(landmarks: MpLandmark[]): boolean;
  isHandOpen(landmarks: MpLandmark[]): boolean;
  countExtendedFingers(landmarks: MpLandmark[]): number;
  getHandDirection(landmarks: MpLandmark[]): { x: number; y: number };
  getState(): Record<string, unknown>;
}
