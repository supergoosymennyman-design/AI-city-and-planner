/**
 * Adversarial tests — deliberately trying to BREAK the game (the "game-breaker" mandate).
 * These reproduce real failure modes a happy-path test misses: flaky browser APIs, junk voice
 * input, rapid input, and phase changes mid-async. Each is simulated at the `ctx` boundary
 * via @edu/testing, so they're deterministic and run with no browser.
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
    fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! })); // crayon
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! })); // Fill it!
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! })); // Teach AI!
    fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! })); // name it
  }
}

describe('adversarial: the quiz must never freeze on feedback', () => {
  it('advances past feedback even when speechSynthesis never fires onend (Chrome hang)', async () => {
    const ctx = makeFakeContext({ catalog, ai: makeFakeAi().ai });
    // Simulate the real Chrome bug: speak() resolves NEVER (onend/onerror don't fire after cancel()).
    ctx.audio.speak = () => new Promise<void>(() => {});
    render(<Game ctx={ctx} />);
    await teachAllColours();

    await screen.findByText(/Round 1/); // quiz started
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! })); // answer
    // If progression depends on speak() resolving, the game is now frozen on feedback forever.
    await screen.findByText(/Round 2/, undefined, { timeout: 3000 });
  });
});
