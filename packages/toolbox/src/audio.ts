/**
 * `createAudioBus` — the canonical {@link AudioBus} implementation: English-primary
 * `speak` (speechSynthesis) with a hard failsafe, synthesized chimes for `play`,
 * and an optional voice-over catalog for `playVO`.
 *
 * The `speak` failsafe is the load-bearing detail (rule #12): Chrome's
 * speechSynthesis can silently never fire onend/onerror — especially right after
 * cancel() — which would leave an awaited `speak()` pending forever and hang the
 * caller. We resolve once, whichever fires first: onend/onerror OR an
 * estimated-duration timeout.
 *
 * The `: AudioBus` return annotation is the structural conformance gate.
 */
import type { AudioBus } from '@edu/contract';

export interface ToolboxAudioOptions {
  /** Optional map of VO key → host-served audio URL. Absent keys resolve as a noop. */
  voCatalog?: Record<string, string>;
}

export function createAudioBus(_opts: ToolboxAudioOptions = {}): AudioBus {
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
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(failsafe);
          resolve();
        };
        u.onend = finish;
        u.onerror = finish;
        // ~90ms/char estimate, capped — resolves even if onend/onerror never fire.
        const failsafe = setTimeout(finish, Math.min(15000, 1000 + clean.length * 90));
        window.speechSynthesis.speak(u);
      }),
    playVO: async (key: string) => {
      // No bundled VO by default (English TTS covers it). A host can supply
      // `voCatalog`; if a key is missing this stays a graceful noop.
      const url = _opts.voCatalog?.[key];
      if (!url || typeof Audio === 'undefined') return;
      try {
        await new Promise<void>((resolve) => {
          const a = new Audio(url);
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          a.onended = done;
          a.onerror = done;
          void a.play().catch(done);
        });
      } catch {
        /* non-fatal */
      }
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
