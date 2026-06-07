/**
 * Adversarial — the AI/STT promises REJECT (not just resolve to null/"nothing").
 *
 * `makeFakeAi` only ever RESOLVES (a phrase, or `null` for silence). But the real Web Speech
 * path REJECTS: `listenOnce` rejects on a recognizer `onerror` (no-speech, network, not-allowed,
 * aborted) or a thrown `new SpeechRecognition()`; `probe('listen')` can reject if the capability
 * check throws. The existing voice.test.tsx never exercises a REJECTION, so this is uncovered.
 *
 * The continuous listen loop (Game.tsx ~146-168) does `await ctx.ai.listenOnce(...)` with NO
 * try/catch. A single rejection escapes the async IIFE → the loop dies and never re-arms →
 * the mic dead-ends (the exact class of bug the continuous loop was built to prevent). The
 * rejection also surfaces as an unhandled error (Vitest flags the run).
 *
 * NOTE: we assert OBSERVABLE behaviour (mic re-arms / listenCount climbs), not DOM
 * `unhandledrejection` events — jsdom does not reliably dispatch those, so listening for them
 * gives FALSE POSITIVES. On the buggy code these tests are RED because the recovery never
 * happens (and the leaked rejection independently fails the run).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AIServices } from '@edu/contract';
import { makeFakeAi, makeFakeContext } from '@edu/testing';
import { Game } from '../Game.js';
import en from '../i18n/en.json';

const catalog = en as Record<string, string>;
afterEach(cleanup);

async function reachAwaitingName(crayon = 'red'): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${crayon}`]! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
}

describe('adversarial: rejecting STT must not dead-end the mic', () => {
  it('re-arms the mic when listenOnce() REJECTS once, then hears a colour', async () => {
    // A real recognizer error (e.g. no-speech) rejects listenOnce. After recovering, the next
    // listen hears "blue" and the AI should learn it — proving the loop re-armed past the throw.
    let calls = 0;
    const ai: AIServices = {
      ...makeFakeAi().ai,
      listenOnce: async () => {
        calls += 1;
        if (calls === 1) throw new Error('no-speech'); // first listen rejects
        return 'blue'; // a re-armed loop calls again and hears blue
      },
    };
    render(<Game ctx={makeFakeContext({ catalog, ai })} />);
    await reachAwaitingName('red');

    // If the loop swallowed the rejection and re-armed, it heard "blue" on the 2nd call → learned.
    await screen.findByText(/Blue!/, undefined, { timeout: 3000 });
    expect(calls).toBeGreaterThanOrEqual(2); // proves it re-armed past the rejection
  });

  it('keeps re-arming when listenOnce() ALWAYS rejects (mic never dead-ends; tap still teaches)', async () => {
    let calls = 0;
    const ai: AIServices = {
      ...makeFakeAi().ai,
      listenOnce: async () => {
        calls += 1;
        throw new Error('network'); // STT permanently broken
      },
    };
    render(<Game ctx={makeFakeContext({ catalog, ai })} />);
    await reachAwaitingName('red');

    // A robust loop catches per-iteration and keeps retrying (paced) → calls climb past 1.
    // The buggy loop dies on the first rejection → calls stays at 1 → this is RED.
    await waitFor(() => expect(calls).toBeGreaterThan(1), { timeout: 2000 });

    // And the always-present tap fallback must still teach regardless.
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.blue']! }));
    await screen.findByText(/Blue!/);
  });
});

describe('adversarial: a rejecting probe() must not leak an unhandled rejection', () => {
  it('treats probe("listen") rejection as "no mic" and lets tap teach (no unhandled reject)', async () => {
    // Game.tsx ~108-116 does `void ctx.ai.probe('listen').then(...)` with NO `.catch`. If probe
    // rejects, the rejection is unhandled. We capture it at the Node `process` level — jsdom does
    // NOT reliably dispatch the DOM `unhandledrejection` event, so a DOM listener would give a
    // false positive (look green while the rejection actually leaked).
    const leaked: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      leaked.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const ai: AIServices = {
        ...makeFakeAi().ai,
        probe: async () => {
          throw new Error('probe blew up'); // capability check throws
        },
      };
      render(<Game ctx={makeFakeContext({ catalog, ai })} />);
      await reachAwaitingName('red');

      // Mic treated as unavailable (graceful R21 gating); tap still teaches.
      fireEvent.click(await screen.findByRole('button', { name: catalog['colour.blue']! }));
      await screen.findByText(/Blue!/);

      // Let any pending microtask → macrotask turn surface an unhandled rejection.
      await new Promise((r) => setTimeout(r, 50));
      expect(
        leaked.map(String),
        `probe() rejection leaked unhandled (add .catch on the probe call): ${leaked.map(String).join(', ')}`,
      ).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
