import type {
  AIServices,
  AudioBus,
  EventBus,
  KeyValueStore,
  SessionInfo,
  TeacherControls,
  Telemetry,
} from './services.js';

/**
 * Minimal translation function (react-i18next's TFunction is assignable to this).
 * Kept structural so @edu/contract doesn't depend on i18next.
 */
export type TFunction = (key: string, vars?: Record<string, unknown>) => string;

/**
 * The single I/O surface every game receives (§3). Games touch the platform
 * ONLY through `ctx` — no direct globals, no `window.*`. This is what makes a
 * game self-contained and the City a matter of assembly, not integration.
 */
export interface GameContext {
  mode: 'standalone' | 'city';
  ageBand: string;
  session: SessionInfo; // shared-tablet identity (§5c)
  ai: AIServices; // offline-first; capability-gated (R21)
  t: TFunction; // text locale (English-primary; strings externalized)
  audio: AudioBus; // English-primary TTS + recorded VO + samples
  storage: KeyValueStore; // keyed by (session.childId, manifest.id) — no bleed
  bus: EventBus; // UI notifications only (NOT authoritative state)
  teacher: TeacherControls; // step/reset/replay/skip
  telemetry: Telemetry; // privacy-safe, offline-by-default (thin stub v1)
}
