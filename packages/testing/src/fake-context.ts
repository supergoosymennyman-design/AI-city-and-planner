/**
 * A complete in-memory {@link GameContext} for render tests — the platform a game runs on,
 * with every side-effect stubbed to a no-op so a test can mount `<Game ctx={…} />` and drive
 * the real FSM + effects without a browser, audio, mic, or storage. Swap in a real catalog
 * (the game's `en.json`) so `ctx.t(...)` returns the same strings the child sees.
 */
import type {
  AIServices,
  AudioBus,
  EventBus,
  GameContext,
  KeyValueStore,
  TeacherControls,
  TFunction,
} from '@edu/contract';
import { makeFakeAi } from './fake-ai.js';

/** Catalog lookup + `{{var}}` substitution — mirrors the host's `createT` (createContext.ts). */
function makeT(catalog: Record<string, string>): TFunction {
  return (key, vars) => {
    let s = catalog[key] ?? key; // fall back to the key so a missing string is visible
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{{${k}}}`).join(String(v));
    return s;
  };
}

/** A do-nothing teacher surface whose `onChange` returns an unsubscribe, like the real one. */
function makeTeacher(): TeacherControls {
  return {
    next: () => {},
    back: () => {},
    reset: () => {},
    replay: () => {},
    skip: () => {},
    onChange: () => () => {},
  };
}

/** Options for {@link makeFakeContext}. */
export interface FakeContextOptions {
  /** i18n catalog (pass the game's `en.json`); defaults to empty (keys echo back). */
  catalog?: Record<string, string>;
  /** Override the AI double (e.g. a {@link makeFakeAi} you hold a handle to). */
  ai?: AIServices;
  /** Value for `ctx.reducedMotion` (default false). */
  reducedMotion?: boolean;
}

/** Assemble a fully-stubbed {@link GameContext} for tests. */
export function makeFakeContext(opts: FakeContextOptions = {}): GameContext {
  const { catalog = {}, ai = makeFakeAi().ai, reducedMotion = false } = opts;

  const audio: AudioBus = {
    speak: async () => {}, // resolves immediately so the Game's await-then-advance proceeds
    playVO: async () => {},
    play: () => {},
    stop: () => {},
  };

  const store = new Map<string, unknown>();
  const storage: KeyValueStore = {
    get: async <T>(key: string) => store.get(key) as T | undefined,
    set: async <T>(key: string, value: T) => {
      store.set(key, value);
    },
    remove: async (key: string) => {
      store.delete(key);
    },
    keys: async () => [...store.keys()],
  };

  const bus: EventBus = {
    emit: () => {},
    on: () => () => {},
  };

  return {
    mode: 'standalone',
    ageBand: 'K2-K3',
    session: { deviceId: 'test' },
    ai,
    t: makeT(catalog),
    audio,
    storage,
    bus,
    teacher: makeTeacher(),
    telemetry: { log: () => {} },
    reducedMotion,
  };
}
