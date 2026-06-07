/**
 * ux-breaker REGRESSION — OFF-RAIL play, judged on EXPERIENCE (not crashes).
 *
 * These started as ux-breaker probes documenting a gap; they now assert the FIXED behaviour:
 * when a child says a real colour the AI doesn't support (green/purple/…), the bot reacts
 * HONESTLY ("that's not one of my colours — try red, blue, or yellow!") instead of dead air or
 * the misleading "I didn't catch that". Driven at the `ctx` boundary via @edu/testing.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makeFakeAi, makeFakeContext } from '@edu/testing';
import { Game } from '../Game.js';
import en from '../i18n/en.json';

const catalog = en as Record<string, string>;
afterEach(cleanup);

/** intro → teaching → painted → "Teach AI!" → awaiting the colour NAME (mic auto-on). */
async function reachAwaitingName(crayon = 'red'): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${crayon}`]! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
}

/** Teach all three (by tap) so we land in the recognition quiz. */
async function teachAllColours(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
  for (const c of ['red', 'blue', 'yellow'] as const) {
    fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! }));
  }
}

describe('ux: unsupported colour while TEACHING gets an honest reaction (not dead air)', () => {
  it('saying "green" makes the bot say it only knows red/blue/yellow, and it keeps listening', async () => {
    const fake = makeFakeAi();
    // The class chants "green!" — a real colour word, just not one the AI supports.
    fake.queueHeard('green', 'this is green', 'green please', 'green', 'green');
    render(<Game ctx={makeFakeContext({ catalog, ai: fake.ai })} />);
    await reachAwaitingName('red');

    // Honest, spoken (bubble + aria-live) reaction — NOT silence, NOT "I didn't catch that".
    await screen.findByText(catalog['teach.unsupported']!, undefined, { timeout: 3000 });
    expect(fake.listenCount).toBeGreaterThanOrEqual(1); // it heard the colour and kept listening
  });

  it('teach palette + name buttons intentionally offer only red/blue/yellow (the promise is scoped)', async () => {
    render(<Game ctx={makeFakeContext({ catalog, ai: makeFakeAi({ canListen: false }).ai })} />);
    await reachAwaitingName('red');

    // The intro promise names exactly three colours; the tap channel matches it (no false affordance).
    const nameButtons = screen
      .getAllByRole('button')
      .filter((b) => /^(Red|Blue|Yellow)$/.test(b.textContent ?? ''));
    expect(nameButtons).toHaveLength(3);
    for (const off of ['Green', 'Purple', 'Pink', 'Black', 'Orange']) {
      expect(screen.queryByRole('button', { name: off })).toBeNull();
    }
  });
});

describe('ux: answering the QUIZ with an unsupported colour by voice', () => {
  it('saying "purple" reacts honestly, leaves the mic re-tappable, and scores nothing false', async () => {
    const fake = makeFakeAi();
    render(<Game ctx={makeFakeContext({ catalog, ai: fake.ai })} />);
    await teachAllColours();
    await screen.findByText(/Round 1/);

    // Quiz is push-to-talk. Tap the mic and say "purple" (a colour, unsupported).
    fake.queueHeard('purple');
    fireEvent.click(await screen.findByRole('button', { name: catalog['mic.tap']! }));

    // Honest spoken reaction (not the misleading "I didn't catch that").
    await screen.findByText(catalog['teach.unsupported']!, undefined, { timeout: 3000 });
    // Mic returns to the tappable OFF state (push-to-talk); the round is neither scored nor advanced.
    await screen.findByRole('button', { name: catalog['mic.tap']! });
    expect(screen.getByText(/Round 1/)).toBeTruthy();
  });
});
