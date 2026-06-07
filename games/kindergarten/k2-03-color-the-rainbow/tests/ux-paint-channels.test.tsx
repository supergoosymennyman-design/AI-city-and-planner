/**
 * ux-breaker PROBES — two-channel coverage for the paint mechanic + threshold honesty.
 *
 * The "Fill it!" button is the accessible fallback for the DRAG, but the colouring PROGRESS
 * (how close am I to done? what counts as done?) is conveyed in ONE channel only. A child who
 * can't see a thin progress bar — or who has no idea 60% is the magic number — gets no spoken
 * or symbolic guidance. These probes assert the missing channel exists; they flip green once a
 * non-visual / age-appropriate completion cue is added. Driven at the `ctx` boundary.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makeFakeAi, makeFakeContext } from '@edu/testing';
import { Game } from '../Game.js';
import en from '../i18n/en.json';

const catalog = en as Record<string, string>;
afterEach(cleanup);

function ctx() {
  return makeFakeContext({ catalog, ai: makeFakeAi({ canListen: false }).ai });
}

async function reachTeaching(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
  await screen.findByText(catalog['teach.colorPrompt']!);
}

// OPEN GAP #3 — DESIGN DECISION pending (not yet chosen): the colouring PROGRESS is single-channel
// (visual progressbar only, no aria-live/chime twin) and the ~60% finish line is never stated in
// words. Both probes below are skipped (not deleted) so they flip green once a non-visual progress
// cue + goal language are added. Un-skip + implement when the cue design is chosen.
describe('ux-breaker: paint progress is single-channel + threshold uncommunicated', () => {
  it.skip('[OPEN/DESIGN] the coverage progressbar has NO spoken/symbol twin — progress is visual-only', async () => {
    render(<Game ctx={ctx()} />);
    await reachTeaching();
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));

    const progressbar = document.querySelector('[role="progressbar"]');
    expect(progressbar).toBeTruthy(); // the bar exists (good: it has aria-valuenow/label)

    // [GAP] But progress lives ONLY on this aria-progressbar + a thin visual fill. Unlike the
    // bot's bubble (aria-live="polite" → spoken twin via TTS, §6b), the percentage is NOT in
    // aria-live, so a screen-reader / audio-first child gets NO running "halfway there!" cue, and
    // there is no chime as coverage climbs. The instruction channel is two-channel; the PROGRESS
    // of the hero interaction is not. Assert a live region carries the progress → fails today.
    const liveProgress = Array.from(document.querySelectorAll('[aria-live]')).some((el) =>
      /\d+%|coloured|halfway|almost|filled/i.test(el.textContent ?? ''),
    );
    expect(liveProgress).toBe(true);
  });

  it.skip('[OPEN/DESIGN] the auto-fill threshold (~60%) is never communicated — child cannot know when "done" happens', async () => {
    render(<Game ctx={ctx()} />);
    await reachTeaching();
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));

    // Scan every visible string for any hint of "how full do I need to colour it?". The prompt is
    // "Colour the shape!" — no target. The progressbar announces the CURRENT pct but never the
    // GOAL. So the shape can snap to "done" at 60% mid-stroke with no forewarning (a jarring,
    // unexplained jump for a 5yo), and a perfectionist child colouring 100% never learns the
    // partial fill was enough.
    const allText = document.body.textContent ?? '';
    const communicatesGoal = /keep colouring|colour (it )?all|fill it up|until it'?s full|a little more/i.test(
      allText,
    );
    // [GAP] No goal/target language anywhere. DESIGN DECISION whether to add it, but flagged.
    expect(communicatesGoal).toBe(true);
  });
});

describe('ux-breaker: teach→quiz honesty when teaching is skipped via the instant fill', () => {
  it('"Fill it!" lets a child reach the quiz having drawn 0% — the draw mechanic is provably optional/cosmetic', async () => {
    render(<Game ctx={ctx()} />);
    await reachTeaching();

    // Teach all three using ONLY "Fill it!" + a name tap — never dragging once.
    for (const c of ['red', 'blue', 'yellow'] as const) {
      fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! }));
      const progressbar = document.querySelector('[role="progressbar"]');
      // Right before completing: coverage is 0 (no stroke drawn at all).
      expect(progressbar?.getAttribute('aria-valuenow')).toBe('0');
      fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
      fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
      fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! }));
    }

    // We reach the quiz with zero drawing. This is GOOD for accessibility (the fallback works),
    // but documents that the signature "draw-to-fill" interaction contributes nothing to the AI:
    // the AI learns the SWATCH HEX, not the strokes. The pedagogy ("colour the shape to teach the
    // colour") is symbolic, not literal. Kept as an explicit, asserted fact (NOT a failing gap):
    await screen.findByText(/Round 1/);
    expect(screen.getByText(/Round 1/)).toBeTruthy();
  });
});
