/**
 * Voice-input tests for Color the Rainbow — simulated at the `ctx.ai` boundary (no mic, no
 * browser, no network) via @edu/testing's `makeFakeAi` (queues what each `listenOnce()` "hears").
 *
 * Model A — these all exercise the TEACHING phase, which is CONTINUOUS: after "Teach AI!" the mic
 * auto-listens and STAYS on; a miss / silence / non-colour word is never a dead end; the mic button
 * toggles Stop/Start; the AI learns whatever label it's told (honest teachable machine). (The quiz
 * is push-to-talk — see breaks-rapid-input-a11y.test.tsx.)
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makeFakeAi, makeFakeContext } from '@edu/testing';
import { Game } from '../Game.js';
import en from '../i18n/en.json';

const catalog = en as Record<string, string>;
afterEach(cleanup);

/** Drive intro → teaching → "awaiting the colour name" (the mic auto-starts here). */
async function reachAwaitingName(crayon = 'red'): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${crayon}`]! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
}

describe('Color the Rainbow — voice input (continuous)', () => {
  it('keeps listening through a non-colour, then learns the spoken label as-given (honest)', async () => {
    const fake = makeFakeAi();
    // What the mic will "hear", in order: a non-colour (must NOT dead-end), then "blue".
    fake.queueHeard('banana', 'this is blue');
    render(<Game ctx={makeFakeContext({ catalog, ai: fake.ai })} />);
    await reachAwaitingName('red'); // teaching a RED-painted shape; mic auto-starts

    // The AI learns BLUE (a red swatch told "blue" → it believes blue — Big Idea 3 / §5b).
    await screen.findByText(/Blue!/); // "Blue! Like the sky! I'm learning!"
    expect(fake.listenCount).toBeGreaterThanOrEqual(2); // it kept listening past the non-colour
  });

  it('Stop button turns the mic off and it stays off', async () => {
    const fake = makeFakeAi(); // empty queue → only ever "hears nothing" → stays listening
    render(<Game ctx={makeFakeContext({ catalog, ai: fake.ai })} />);
    await reachAwaitingName('red');

    // Auto-started → the button is a "Stop". Tap it → it becomes "Say the colour" (off, stays off).
    fireEvent.click(await screen.findByRole('button', { name: catalog['mic.stop']! }));
    await screen.findByRole('button', { name: catalog['mic.tap']! });
  });

  it('hides the mic when STT is unavailable — tap still teaches (R21 graceful gating)', async () => {
    const fake = makeFakeAi({ canListen: false }); // probe('listen') === false
    render(<Game ctx={makeFakeContext({ catalog, ai: fake.ai })} />);
    await reachAwaitingName('red');

    const blue = await screen.findByRole('button', { name: catalog['colour.blue']! });
    expect(screen.queryByRole('button', { name: catalog['mic.tap']! })).toBeNull();
    expect(screen.queryByRole('button', { name: catalog['mic.stop']! })).toBeNull();
    fireEvent.click(blue); // the always-present tap fallback still teaches
    await screen.findByText(/Blue!/);
    expect(fake.listenCount).toBe(0); // voice was never attempted
  });
});
