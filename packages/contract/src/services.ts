import type { Capability } from './capability.js';

/**
 * The service interfaces injected via `GameContext`. These are the surfaces the
 * §3 note flagged as "named but undefined" — defined here so 4 devs build to one
 * shape. All are offline-first; anything network/permission-bound is capability-
 * gated (R21) and degrades gracefully rather than throwing into a child's face.
 */

/** Result of a teachable-image classification. */
export interface Classification {
  label: string;
  confidence: number; // 0..1
}

/** A detected hand/pose landmark set (normalized 0..1 coords). */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

/**
 * On-device AI. `probe(capability)` is the launch-time capability gate (R21):
 * if it resolves false, the game shows its non-ML / non-voice fallback path —
 * never a silent CPU fallback or a broken mic. Ported impls live in @edu/toolbox.
 */
export interface AIServices {
  /** Is this capability usable on this device+browser right now? (R21) */
  probe(capability: Capability): Promise<boolean>;

  // recognizeImage / teachable (MobileNet + knn-classifier, ported)
  trainImageClass(label: string, frame: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<void>;
  classifyImage(frame: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<Classification>;

  // recognizePose/gesture (MediaPipe Hands, ported; hardware-gated)
  detectPose(frame: HTMLVideoElement): Promise<Landmark[]>;

  // listen — STT (Android-Chrome-only, always skippable; resolves null if unavailable)
  listenOnce(opts?: { lang?: string; timeoutMs?: number }): Promise<string | null>;

  /** Release models/GPU contexts — one ML runtime per game, hard teardown (§8). */
  dispose(): Promise<void>;
}

/** Audio output. English-primary `speak`; recorded VO + samples by key. */
export interface AudioBus {
  speak(text: string, opts?: { interrupt?: boolean }): Promise<void>;
  /** Play a pre-recorded voice-over clip by catalog key (locale resolved internally). */
  playVO(key: string): Promise<void>;
  /** Play a short sample/sound effect (Howler-backed). */
  play(sampleId: string): void;
  stop(): void;
}

/** Namespaced KV (host keys it by (session.childId, manifest.id) — no bleed §5c). */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** UI-notification bus ONLY — never authoritative state (that's CityState §4d). */
export interface EventBus {
  emit(event: string, payload?: unknown): void;
  /** Subscribe; returns an unsubscribe function. */
  on(event: string, handler: (payload?: unknown) => void): () => void;
}

/** Teacher control surface; host renders the overlay. */
export interface TeacherControls {
  next(): void; // advance Part A/B/C
  back(): void;
  reset(): void; // e.g. reset learned classes
  replay(): void;
  skip(): void;
  onChange(handler: (action: 'next' | 'back' | 'reset' | 'replay' | 'skip') => void): () => void;
}

/** Shared-tablet identity (§5c). No typed login; childId may be absent (anon). */
export interface SessionInfo {
  childId?: string;
  deviceId: string;
  roster?: string[];
}

/** Privacy-safe, offline-by-default logging (thin stub for v1, R2). */
export interface Telemetry {
  log(event: string, data?: Record<string, unknown>): void;
}
