/**
 * ux-breaker REGRESSION — heard-but-UNMATCHED speech must never be dead air (the live miss).
 *
 * Distinct from ux-unsupported-colour.test.tsx (which only covered words in the hardcoded
 * OTHER_COLOUR_WORDS list): these drive the BRANCH NEXT TO IT — gibberish, and a real colour
 * word OUTSIDE that list — and assert the child gets VISIBLE, honest feedback in the actual mic
 * mode. The original bug: during continuous TEACHING the "say it again" hint was structurally
 * unreachable (the line always rendered "🎤 Listening…"), so saying anything the AI didn't match
 * produced silence — exactly the off-rail dead-air a human tester hit. Driven at the ctx boundary.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makeFakeAi, makeFakeContext } from '@edu/testing';
import { Game } from '../Game.js';
import en from '../i18n/en.json';

const catalog = en as Record<string, string>;
afterEach(cleanup);

/** intro → teaching → painted → "Teach AI!" → awaiting the colour NAME (mic auto-on, continuous). */
async function reachAwaitingName(crayon = 'red'): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${crayon}`]! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
}

describe('ux: heard-but-unmatched speech during TEACHING is never dead air', () => {
  it('gibberish ("banana") shows a visible "say it again" nudge even while the mic stays on', async () => {
    const fake = makeFakeAi();
    fake.queueHeard('banana', 'banana', 'banana'); // a child babbles; never a colour
    render(<Game ctx={makeFakeContext({ catalog, ai: fake.ai })} />);
    await reachAwaitingName('red');

    // The bot must SAY SOMETHING visible — the "I didn't catch that" hint — not just sit on the
    // permanent "🎤 Listening…" label. Before the fix this never rendered (continuous mode hid it).
    await screen.findByText(catalog['mic.again']!, undefined, { timeout: 3000 });
  });

  it('a real colour OUTSIDE the known list ("violet") gets an honest reaction, not silence', async () => {
    const fake = makeFakeAi();
    fake.queueHeard('violet', 'this is violet', 'violet', 'violet');
    render(<Game ctx={makeFakeContext({ catalog, ai: fake.ai })} />);
    await reachAwaitingName('red');

    // "violet" is a colour the AI doesn't support — the child should hear the honest
    // "that's not one of my colours — try red/blue/yellow" reaction, not dead air. This requires
    // the supported-vs-unsupported colour vocabulary to be broad enough to recognise it AS a colour.
    await screen.findByText(catalog['teach.unsupported']!, undefined, { timeout: 3000 });
  });
});
