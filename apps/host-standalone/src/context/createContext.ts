import type {
  AIServices,
  AudioBus,
  Capability,
  EventBus,
  GameContext,
  KeyValueStore,
  SessionInfo,
  TeacherControls,
  Telemetry,
  TFunction,
} from '@edu/contract';

/**
 * The standalone host's concrete {@link GameContext} — the "platform" a game runs on.
 * Everything is offline-first and local: storage = localStorage, audio = Web Audio +
 * speechSynthesis, ai = a graceful stub (ML/voice land in @edu/toolbox later). This is
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

/** Audio: synthesized chimes (ported from the prototype) + speechSynthesis TTS. */
function createAudio(): AudioBus {
  let actx: AudioContext | null = null;
  const ensure = (): AudioContext | null => {
    if (!actx) {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        actx = Ctor ? new Ctor() : null;
      } catch {
        actx = null;
      }
    }
    return actx;
  };
  const tones = (freqs: number[], type: OscillatorType, dur: number, gap: number, gain: number) => {
    const a = ensure();
    if (!a) return;
    const t0 = a.currentTime;
    freqs.forEach((f, i) => {
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.frequency.value = f;
      osc.type = type;
      const t = t0 + i * gap;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(a.destination);
      osc.start(t);
      osc.stop(t + dur);
    });
  };
  const hasTTS = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
  return {
    speak: (text, opts) =>
      new Promise<void>((resolve) => {
        if (!hasTTS()) return resolve();
        if (opts?.interrupt) window.speechSynthesis.cancel();
        // ASCII-only so emoji/punctuation aren't read aloud awkwardly.
        const clean = text.replace(/[^\x20-\x7E\s]/g, '').trim();
        if (!clean) return resolve();
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = 'en-US';
        u.rate = 0.92;
        u.pitch = 1.15;
        // FAILSAFE: Chrome's speechSynthesis can silently never fire onend/onerror — especially
        // right after cancel() — leaving this promise pending forever and hanging any caller that
        // awaits it. Resolve once, whichever fires first: onend/onerror OR an estimated-duration
        // timeout (~90ms/char, capped). Belt-and-suspenders with the game's TTS-independent
        // advance timer; either layer alone prevents the freeze.
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(failsafe);
          resolve();
        };
        u.onend = finish;
        u.onerror = finish;
        const failsafe = setTimeout(finish, Math.min(15000, 1000 + clean.length * 90));
        window.speechSynthesis.speak(u);
      }),
    playVO: async () => {
      /* no recorded VO in the standalone host (English TTS covers it) */
    },
    play: (sampleId) => {
      if (sampleId === 'correct') tones([523, 659, 784], 'sine', 0.25, 0.1, 0.18);
      else if (sampleId === 'wrong') tones([150], 'square', 0.35, 0, 0.12);
      else if (sampleId === 'done') tones([880], 'sine', 0.2, 0, 0.15);
    },
    stop: () => {
      if (hasTTS()) window.speechSynthesis.cancel();
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

/**
 * On-device AI for the standalone host. Image/pose teachable models arrive via
 * @edu/toolbox later; today only `speak` (TTS) and `listen` (STT) are wired. `probe`
 * reports honestly so capability-gated games show their fallback (R21) — never a broken mic.
 */
const ai: AIServices = {
  probe: async (capability: Capability) => {
    if (capability === 'speak') return typeof window !== 'undefined' && 'speechSynthesis' in window;
    if (capability === 'listen') {
      const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
      return typeof window !== 'undefined' && !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
    }
    return false; // image/pose/generate/train not available in the standalone host (M1)
  },
  trainImageClass: async () => {
    throw new Error('teachable-image is not available in the standalone host (M1)');
  },
  classifyImage: async () => {
    throw new Error('teachable-image is not available in the standalone host (M1)');
  },
  detectPose: async () => [],
  /**
   * STT via Web Speech (Android-Chrome only; resolves null where unavailable or on error,
   * so callers fall back to tap — never a hung/broken mic, §5).
   * ⚠️ PRIVACY (§5c): Web Speech is cloud-backed — the child's voice leaves the device. In
   * production this MUST be consent/DPA-gated; a real host withholds `probe('listen')` until
   * consent exists. It is enabled here so the teach-by-voice mechanic is demonstrable.
   */
  listenOnce: ({ lang = 'en-US', timeoutMs = 6000 } = {}) =>
    new Promise<string | null>((resolve) => {
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
  dispose: async () => {},
};

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
    ai,
    t: createT(opts.catalog),
    audio: createAudio(),
    storage: createStorage(`${opts.childId ?? 'anon'}:${opts.manifestId}`),
    bus: createBus(),
    teacher: createTeacher(),
    telemetry,
    reducedMotion,
  };
}
