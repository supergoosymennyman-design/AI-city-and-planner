/**
 * Adversarial — rapid / racing input + reduced-motion & a11y rendering (charter §3, §6).
 *
 * Kids hammer buttons. We verify:
 *  - Double-tapping the SAME quiz answer before feedback paints does not double-score / skip a
 *    round (the reducer must debounce via gameFeedback).
 *  - Quiz voice is push-to-talk (tap the mic) and scores a round exactly once (Model A).
 *  - The reducedMotion path renders the full lesson (no motion-only gating).
 *  - The bot bubble has an aria-live twin (the audio/screen-reader channel, §6b).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AIServices } from '@edu/contract';
import { makeFakeAi, makeFakeContext } from '@edu/testing';
import { Game } from '../Game.js';
import en from '../i18n/en.json';

const catalog = en as Record<string, string>;
afterEach(cleanup);

async function teachAllColours(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
  for (const c of ['red', 'blue', 'yellow'] as const) {
    fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! }));
  }
}

describe('adversarial: rapid / racing input must not double-score or skip rounds', () => {
  it('double-tapping the correct answer scores exactly once', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // pickRound → 'red'
    render(<Game ctx={makeFakeContext({ catalog, ai: makeFakeAi({ canListen: false }).ai })} />);
    await teachAllColours();
    await screen.findByText(/Round 1/);

    const red = await screen.findByRole('button', { name: catalog['colour.red']! });
    // Hammer the same answer 3x before feedback can settle.
    fireEvent.click(red);
    fireEvent.click(red);
    fireEvent.click(red);
    await screen.findByText(catalog['game.correct']!);
    // Exactly one point — the disabled-during-feedback + reducer guard must debounce.
    await screen.findByLabelText(catalog['score.label']!.replace('{{score}}', '1').replace('{{total}}', '5'));
    vi.restoreAllMocks();
  });

  it('quiz voice is push-to-talk and scores the round exactly once', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // pickRound → 'red'
    const fake = makeFakeAi();
    render(<Game ctx={makeFakeContext({ catalog, ai: fake.ai })} />);
    await teachAllColours();
    await screen.findByText(/Round 1/);

    // Model A: the quiz is tap-to-talk (the mic does NOT auto-listen). Queue the answer NOW (so the
    // continuous teaching mic above doesn't eat it), then tap the mic → it hears "red" once →
    // exactly one point (the reducer's gameFeedback guard prevents any double-score).
    fake.queueHeard('red');
    fireEvent.click(await screen.findByRole('button', { name: catalog['mic.tap']! }));
    await screen.findByText(catalog['game.correct']!);
    await screen.findByLabelText(catalog['score.label']!.replace('{{score}}', '1').replace('{{total}}', '5'));
    vi.restoreAllMocks();
  });
});

describe('a11y: reduced-motion + aria-live channels render (two-channel rule, §6)', () => {
  it('plays the full lesson with reducedMotion:true', async () => {
    render(<Game ctx={makeFakeContext({ catalog, reducedMotion: true, ai: makeFakeAi({ canListen: false }).ai })} />);
    fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
    await screen.findByText(catalog['teach.dontKnow']!); // teaching proceeds without motion
  });

  it('the bot bubble is announced via an aria-live region', async () => {
    render(<Game ctx={makeFakeContext({ catalog, ai: makeFakeAi({ canListen: false }).ai })} />);
    const bubble = await screen.findByText(catalog['intro']!);
    // Walk up to the closest aria-live ancestor (the bubble <p> itself carries it).
    const live = bubble.closest('[aria-live]');
    expect(live, 'bot bubble must be in an aria-live region (audio twin, §6b)').not.toBeNull();
  });
});
