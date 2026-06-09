import type {
  EventBus,
  GameContext,
  KeyValueStore,
  SessionInfo,
  TeacherControls,
  Telemetry,
  TFunction,
} from '@edu/contract';
import { createAIServices, createAudioBus } from '@edu/toolbox';

/**
 * The standalone host's concrete {@link GameContext} — the "platform" a game runs on.
 * Everything is offline-first and local: storage = localStorage; audio (TTS + chimes)
 * and ai (teachable image / pose / Web-Speech STT) are provided by @edu/toolbox. This is
 * the reference implementation each game's `ctx` is built against (§3, §5).
 */
export interface HostOptions {
  manifestId: string;
  ageBand: string;
  /** The game's i18n catalog (English-primary); `t` interpolates against it. */
  catalog: Record<string, string>;
  childId?: string;
}

/** Tiny interpolating translator: catalog lookup + `{{var}}` substitution. */
function createT(catalog: Record<string, string>): TFunction {
  return (key, vars) => {
    let s = catalog[key] ?? key; // fall back to the key so missing strings are visible
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{{${k}}}`).join(String(v));
    return s;
  };
}

/** KV over localStorage, namespaced by (child, game) so nothing bleeds between kids (§5c). */
function createStorage(ns: string): KeyValueStore {
  const k = (key: string) => `edu:${ns}:${key}`;
  return {
    get: async <T>(key: string) => {
      try {
        const raw = localStorage.getItem(k(key));
        return raw == null ? undefined : (JSON.parse(raw) as T);
      } catch {
        return undefined; // blocked/corrupt storage → behave as "not set", never throw
      }
    },
    set: async <T>(key: string, value: T) => {
      try {
        localStorage.setItem(k(key), JSON.stringify(value));
      } catch {
        /* storage full/blocked — non-fatal for a game */
      }
    },
    remove: async (key: string) => {
      try {
        localStorage.removeItem(k(key));
      } catch {
        /* ignore */
      }
    },
    keys: async () => {
      const prefix = `edu:${ns}:`;
      const out: string[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const full = localStorage.key(i);
          if (full?.startsWith(prefix)) out.push(full.slice(prefix.length));
        }
      } catch {
        /* ignore */
      }
      return out;
    },
  };
}

/** UI-notification bus only (never authoritative state — that's CityState §4d). */
function createBus(): EventBus {
  const handlers = new Map<string, Set<(payload?: unknown) => void>>();
  return {
    emit: (event, payload) => handlers.get(event)?.forEach((h) => h(payload)),
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
      return () => set.delete(handler);
    },
  };
}

/** Teacher controls (R3): host UI calls these; the game subscribes via `onChange`. */
function createTeacher(): TeacherControls {
  const handlers = new Set<(a: 'next' | 'back' | 'reset' | 'replay' | 'skip') => void>();
  const fire = (a: 'next' | 'back' | 'reset' | 'replay' | 'skip') => handlers.forEach((h) => h(a));
  return {
    next: () => fire('next'),
    back: () => fire('back'),
    reset: () => fire('reset'),
    replay: () => fire('replay'),
    skip: () => fire('skip'),
    onChange: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}

/** Assemble the full context a standalone game receives. */
export function createContext(opts: HostOptions): GameContext {
  const session: SessionInfo = { deviceId: 'standalone', childId: opts.childId };
  const telemetry: Telemetry = {
    log: (event, data) => {
      // Dev-only, no PII (§5c). Distinct from @edu/debug; this is the product telemetry seam.
      if (import.meta.env.DEV) console.debug('[telemetry]', event, data ?? {});
    },
  };
  // The platform reads the OS reduce-motion preference here, so games never touch window.* (§6b).
  const reducedMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    mode: 'standalone',
    ageBand: opts.ageBand,
    session,
    // ai + audio are the canonical @edu/toolbox implementations (was an inline stub).
    // SELF-HOSTED ML (rule #4 / offline): point the teachable-image extractor + hand tracker at the
    // host-served assets under /ml/ (vendored by `npm run vendor-ml`), so nothing fetches from a CDN.
    // BASE_URL respects the deploy base (base:'./'). coco-ssd fallback is left off (no cocoModelUrl).
    // PRIVACY (§5c): listenOnce uses cloud-backed Web Speech — the child's voice leaves the device.
    // A production host MUST consent/DPA-gate `listen` (withhold its probe) before enabling it for
    // children; it is on here so the teach-by-voice demo works.
    ai: createAIServices({
      mobilenetUrl: `${import.meta.env.BASE_URL}ml/mobilenet/model.json`,
      mpWasmBase: `${import.meta.env.BASE_URL}ml/tasks-vision/wasm`,
      handModelUrl: `${import.meta.env.BASE_URL}ml/tasks-vision/hand_landmarker.task`,
    }),
    t: createT(opts.catalog),
    audio: createAudioBus(),
    storage: createStorage(`${opts.childId ?? 'anon'}:${opts.manifestId}`),
    bus: createBus(),
    teacher: createTeacher(),
    telemetry,
    reducedMotion,
  };
}
