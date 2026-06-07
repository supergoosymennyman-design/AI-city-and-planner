import { describe, it, expect, afterEach, vi } from 'vitest';
import { createAudioBus } from './audio.js';

/** Stub speechSynthesis + SpeechSynthesisUtterance; control whether onend fires. */
function installFakeSynth(fireEnd: boolean) {
  const spoken: string[] = [];
  let cancelled = 0;
  class FakeUtter {
    text: string;
    lang = '';
    rate = 1;
    pitch = 1;
    onend: () => void = () => {};
    onerror: () => void = () => {};
    constructor(t: string) {
      this.text = t;
    }
  }
  (globalThis as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = FakeUtter;
  (window as unknown as { speechSynthesis?: unknown }).speechSynthesis = {
    speak: (u: { text: string; onend: () => void }) => {
      spoken.push(u.text);
      if (fireEnd) setTimeout(() => u.onend(), 0);
    },
    cancel: () => {
      cancelled++;
    },
  };
  return { spoken, cancelled: () => cancelled };
}

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
  delete (globalThis as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
});

describe('createAudioBus.speak (rule #12: never hangs)', () => {
  it('resolves when onend fires', async () => {
    const { spoken } = installFakeSynth(/* fireEnd */ true);
    await createAudioBus().speak('hello there');
    expect(spoken).toEqual(['hello there']);
  });

  it('resolves via the failsafe timeout when onend never fires', async () => {
    installFakeSynth(/* fireEnd */ false);
    vi.useFakeTimers();
    const p = createAudioBus().speak('hi');
    // Failsafe is ~1000 + len*90 ms; advance well past it.
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves immediately when speechSynthesis is unavailable', async () => {
    await expect(createAudioBus().speak('anything')).resolves.toBeUndefined();
  });
});

describe('createAudioBus.play / stop', () => {
  it('play() is a noop (not a throw) without an AudioContext', () => {
    expect(() => createAudioBus().play('correct')).not.toThrow();
    expect(() => createAudioBus().play('unknown-sample')).not.toThrow();
  });

  it('stop() cancels speech when available', () => {
    const { cancelled } = installFakeSynth(true);
    createAudioBus().stop();
    expect(cancelled()).toBeGreaterThan(0);
  });
});
