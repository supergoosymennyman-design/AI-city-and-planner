/**
 * ux-breaker PROBES — pacing, stalling, and feedback-honesty off-rail paths.
 *
 * Not crashes (game-breaker) and not static a11y (kid-ux-reviewer): these check whether the
 * EXPERIENCE holds up when a child stalls, refuses, or hits an edge score — dead air, missing
 * encouragement, or a message that doesn't match what happened. Driven at the `ctx` boundary.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

describe('ux-breaker: stalling / refusing in the teaching phase', () => {
  it('[GAP] a child who never picks a colour gets the SAME static prompt forever (no re-prompt)', async () => {
    render(<Game ctx={makeFakeContext({ catalog, ai: makeFakeAi({ canListen: false }).ai })} />);
    fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));

    // We're now on "Pick a colour, then drag to paint the shape!".
    await screen.findByText(catalog['teach.colorPrompt']!);

    // Snapshot the bot bubble line now (it currently reads "Pick a colour, then drag…").
    const before = (await screen.findByText(catalog['teach.colorPrompt']!)).textContent;

    // Child stalls — taps nothing. Wait a beat (a 5yo stares at the screen).
    await new Promise((r) => setTimeout(r, 1500));

    // [GAP] No timed encouragement or re-prompt fires. The bubble + prompt are STATIC: after a long
    // stall the bot says exactly what it said at t=0, with no escalating nudge ("Tap a crayon to
    // start!", a gentle chime, a wiggle). Recoverable (the palette is on screen), but a confused or
    // distracted child gets zero PROACTIVE guidance — dead air on a stall.
    const after = screen.getByText(catalog['teach.colorPrompt']!).textContent;
    expect(after).toBe(before); // unchanged — no time-based re-prompt
  });

  it('child taps the shape before picking a colour → gets a helpful nudge (handled WELL)', async () => {
    render(<Game ctx={makeFakeContext({ catalog, ai: makeFakeAi({ canListen: false }).ai })} />);
    fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
    // "Fill it!" is disabled until a colour is picked — so the out-of-order tap is prevented,
    // not silently ignored. This is the GOOD pattern (affordance disabled, not a dead no-op).
    const fill = await screen.findByRole('button', { name: catalog['teach.fillBtn']! });
    expect((fill as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ux-breaker: edge-score feedback honesty', () => {
  it('scoring 0 out of 5 surfaces the mistraining lesson, not flat "Great job!"', async () => {
    // Force every quiz pick to 'red' so we can deterministically answer WRONG every round.
    vi.spyOn(Math, 'random').mockReturnValue(0); // pickRound → 'red'; shuffle stable
    render(<Game ctx={makeFakeContext({ catalog, ai: makeFakeAi({ canListen: false }).ai })} />);
    await teachAllColours();

    // Answer wrong (blue) on all 5 rounds → final score 0/5.
    for (let i = 0; i < 5; i++) {
      await screen.findByText(new RegExp(`Round ${i + 1}`));
      fireEvent.click(await screen.findByRole('button', { name: catalog['colour.blue']! }));
      await new Promise((r) => setTimeout(r, 1800)); // 1600ms auto-advance
    }

    // Tiered (honest) result: 0/5 teaches the Big-Idea-3 lesson + nudges Re-teach — never "Great job!".
    await screen.findByText(catalog['result.low']!);
    expect(screen.queryByText(/Great job/)).toBeNull();
    vi.restoreAllMocks();
  }, 20000);
});
