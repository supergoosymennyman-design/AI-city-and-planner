/**
 * Voice-input tests for Color the Rainbow — simulated at the `ctx.ai` boundary (no mic, no
 * browser, no network). Catches the reported bug: after the STT failed to capture, the mic
 * went dead. With push-to-talk it must re-arm on every tap. Also asserts honest learning over
 * voice (the AI learns the spoken label as-given) and graceful gating when STT is absent (R21).
 *
 * The simulator lives in @edu/testing (`makeFakeAi` queues what each `listenOnce()` "hears").
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makeFakeAi, makeFakeContext } from '@edu/testing';
import { Game } from '../Game.js';
import en from '../i18n/en.json';

const catalog = en as Record<string, string>;

afterEach(cleanup);

/** Drive the FSM intro → teaching → "awaiting the colour name", where the mic appears. */
async function reachAwaitingName(crayon = 'red'): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${crayon}`]! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
}

describe('Color the Rainbow — voice input', () => {
  it('re-arms the mic after a missed capture, then learns the spoken label (honest)', async () => {
    const fake = makeFakeAi(); // queue empty → the first listen "hears nothing" (a miss)
    render(<Game ctx={makeFakeContext({ catalog, ai: fake.ai })} />);
    await reachAwaitingName('red'); // teaching a RED-painted shape...

    const micName = catalog['mic.tap']!; // stable aria-label ("Say the colour out loud")
    const mic = await screen.findByRole('button', { name: micName });

    // 1st tap → miss. THE BUG: previously the mic never listened again. It must stay alive.
    fireEvent.click(mic);
    await screen.findByText(catalog['mic.again']!); // "didn't catch that — try again" appears
    expect(fake.listenCount).toBe(1);
    expect((screen.getByRole('button', { name: micName }) as HTMLButtonElement).disabled).toBe(false);

    // 2nd tap → now it hears "blue". A RED swatch taught the label "blue" → the AI learns BLUE
    // (no correction — the teachable-machine truth, Big Idea 3 / §5b).
    fake.queueHeard('this is blue');
    fireEvent.click(screen.getByRole('button', { name: micName }));
    await screen.findByText(/Blue!/); // bot: "Blue! Like the sky! I'm learning!"
    expect(fake.listenCount).toBe(2); // proves the mic re-armed for the second attempt
  });

  it('hides the mic when STT is unavailable — tap still teaches (R21 graceful gating)', async () => {
    const fake = makeFakeAi({ canListen: false }); // probe('listen') === false
    render(<Game ctx={makeFakeContext({ catalog, ai: fake.ai })} />);
    await reachAwaitingName('red');

    const blue = await screen.findByRole('button', { name: catalog['colour.blue']! });
    expect(screen.queryByRole('button', { name: catalog['mic.tap']! })).toBeNull(); // no mic
    fireEvent.click(blue); // the always-present tap fallback still teaches
    await screen.findByText(/Blue!/);
    expect(fake.listenCount).toBe(0); // voice was never attempted
  });
});
