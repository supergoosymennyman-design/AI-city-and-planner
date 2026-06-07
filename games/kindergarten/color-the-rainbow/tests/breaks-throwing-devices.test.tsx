/**
 * Adversarial — output/input DEVICES that THROW (not just hang).
 *
 * Charter §1 says explicitly: "Make play()/speak() throw — the game must not crash."
 * The existing adversarial.test.tsx only makes speak() HANG (never resolve). A *synchronous
 * throw* from a ctx device is a different failure mode: it propagates out of the React effect
 * and crashes the whole game tree. On a real tablet, a flaky audio backend (AudioContext in a
 * bad state, a vendor TTS shim that throws on cancel()) does exactly this.
 *
 * Inject the throw at the `ctx` boundary (ctx-only I/O, golden rule #2) and assert the game
 * still works (chime is best-effort; the lesson must not die).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makeFakeAi, makeFakeContext } from '@edu/testing';
import { Game } from '../Game.js';
import en from '../i18n/en.json';

const catalog = en as Record<string, string>;
afterEach(cleanup);

/** Teach all three colours by TAP (deterministic) → lands in the recognition quiz. */
async function teachAllColours(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
  for (const c of ['red', 'blue', 'yellow'] as const) {
    fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! }));
  }
}

describe('adversarial: a throwing audio device must not crash the game', () => {
  it('survives ctx.audio.play() throwing when a one-shot chime fires (teach "done" sound)', async () => {
    const ctx = makeFakeContext({ catalog, ai: makeFakeAi().ai });
    // A flaky audio backend that throws synchronously every time play() is called.
    ctx.audio.play = () => {
      throw new Error('AudioContext is closed');
    };
    render(<Game ctx={ctx} />);

    // Teach the first colour — ANSWER_COLOUR sets sound:'done' → the play() effect fires → throws.
    fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));

    // If play()'s throw escaped the effect, React unmounted the tree and this line never appears.
    await screen.findByText(/I'm learning!/);
  });

  it('survives ctx.audio.speak() throwing synchronously when the bubble changes', async () => {
    const ctx = makeFakeContext({ catalog, ai: makeFakeAi().ai });
    // speak() throws synchronously (not a rejected promise) — e.g. a TTS shim that throws on cancel().
    ctx.audio.speak = () => {
      throw new Error('speechSynthesis.cancel() threw');
    };
    render(<Game ctx={ctx} />);

    // The very first bubble ('intro') already calls speak() in the mount effect.
    // If it crashes, the intro Start button never renders.
    fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
    await screen.findByText(catalog['teach.colorPrompt']!);
  });

  it('still advances the quiz when speak() throws on the feedback bubble', async () => {
    const ctx = makeFakeContext({ catalog, ai: makeFakeAi().ai });
    let calls = 0;
    ctx.audio.speak = () => {
      calls += 1;
      throw new Error('TTS exploded');
    };
    render(<Game ctx={ctx} />);
    await teachAllColours();

    await screen.findByText(/Round 1/);
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));
    // The feedback bubble change calls speak() (throws). The TTS-independent timer must still
    // advance — but only if the throw didn't crash the effect first.
    await screen.findByText(/Round 2/, undefined, { timeout: 3000 });
    expect(calls).toBeGreaterThan(0);
  });

  it('does not leak an unhandled rejection when speak() REJECTS (async, not sync throw)', async () => {
    // Distinct from the existing adversarial test (which makes speak() HANG forever): a real TTS
    // backend can REJECT. Game.tsx line 72 does `void ctx.audio.speak(...)` with no `.catch`, so a
    // rejected promise becomes an unhandled rejection. Captured at the Node `process` level
    // (jsdom doesn't reliably fire the DOM `unhandledrejection` event → DOM listener = false pass).
    const leaked: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      leaked.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const ctx = makeFakeContext({ catalog, ai: makeFakeAi().ai });
      ctx.audio.speak = async () => {
        throw new Error('speechSynthesis rejected');
      };
      render(<Game ctx={ctx} />);
      // The mount bubble ('intro') already calls speak() → rejects.
      fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
      await screen.findByText(catalog['teach.colorPrompt']!);

      await new Promise((r) => setTimeout(r, 50)); // let the rejection surface
      expect(
        leaked.map(String),
        `speak() rejection leaked unhandled (add .catch on the speak call): ${leaked.map(String).join(', ')}`,
      ).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
