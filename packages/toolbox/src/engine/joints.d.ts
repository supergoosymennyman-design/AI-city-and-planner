/**
 * Hand-written types for joints.js (the typed boundary for the port). This .d.ts sits beside joints.js
 * so TypeScript uses it for types and does NOT synthesize a declaration from the .js.
 *
 * Backed by @mediapipe/tasks-vision (HandLandmarker / PoseLandmarker), injected — never a CDN global.
 */

/** A MediaPipe normalized landmark (image coords 0..1; z relative; visibility optional). */
export interface MpLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/** Normalised one-shot result (mirrors the old Holistic shape so ai.ts mapping is unchanged). */
export interface JointResults {
  rightHandLandmarks?: MpLandmark[] | null;
  leftHandLandmarks?: MpLandmark[] | null;
  poseLandmarks?: MpLandmark[] | null;
}

/** What a tasks-vision landmarker's detectForVideo() returns (the subset we read). */
export interface LandmarkerResult {
  landmarks?: MpLandmark[][];
  handedness?: Array<Array<{ categoryName?: string }>>;
}

/** A constructed HandLandmarker/PoseLandmarker instance (the subset we call). */
export interface VisionLandmarker {
  detectForVideo(frame: unknown, timestampMs: number): LandmarkerResult;
  close?(): void;
}

/** The HandLandmarker/PoseLandmarker classes' static `createFromOptions`. */
export interface VisionLandmarkerCtor {
  createFromOptions(fileset: unknown, options: Record<string, unknown>): Promise<VisionLandmarker>;
}

/** Minimal shape of the INJECTED @mediapipe/tasks-vision module. */
export interface VisionTasksLib {
  FilesetResolver: { forVisionTasks(wasmBase: string): Promise<unknown> };
  HandLandmarker?: VisionLandmarkerCtor;
  PoseLandmarker?: VisionLandmarkerCtor;
}

export interface JointDetectionOptions {
  enableHands?: boolean;
  enablePose?: boolean;
  numHands?: number;
  runningMode?: string;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  /** Injected @mediapipe/tasks-vision module (no CDN). */
  visionTasks?: VisionTasksLib | null;
  /** Host-served URL of the dir holding the tasks-vision wasm files. */
  wasmBase?: string;
  /** Host-served URL of the hand_landmarker .task model. */
  handModelUrl?: string;
  /** Host-served URL of the pose_landmarker .task model. */
  poseModelUrl?: string;
  /** Inference delegate: 'GPU' (WebGL) or 'CPU'. */
  delegate?: string;
}

export declare class JointDetectionManager {
  constructor(options?: JointDetectionOptions);

  ready: boolean;
  cameraActive: boolean;

  onHandsDetected: ((hand: MpLandmark[]) => void) | null;
  onPoseDetected: ((pose: MpLandmark[]) => void) | null;
  onGesture: ((gesture: string) => void) | null;
  onCameraReady: ((ready: boolean) => void) | null;
  onError: ((message: string) => void) | null;
  onReady: ((ready: boolean) => void) | null;

  /** Async-load the enabled landmarkers from the injected tasks-vision module, then fire onReady. */
  initialize(): void;
  /** One-shot detection: run enabled landmarkers on one frame; resolve normalised results (null if unavailable). */
  sendOnce(frame: unknown): Promise<JointResults | null>;
  startCamera(videoElement: unknown, callback?: (ok: boolean) => void): void;
  stopCamera(): void;

  /** Classify a 21-point hand-landmark array into a coarse gesture name. */
  classifyGesture(landmarks: MpLandmark[]): string;
  isHandOpen(landmarks: MpLandmark[]): boolean;
  countExtendedFingers(landmarks: MpLandmark[]): number;
  getHandDirection(landmarks: MpLandmark[]): { x: number; y: number };
  getState(): Record<string, unknown>;
  destroy(): void;
}
