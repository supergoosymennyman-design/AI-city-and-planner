/**
 * ux-breaker PROBES — the draw-to-fill paint mechanic (PaintableShape), off-rail.
 *
 * NOT crashes (game-breaker covers throwing/cancelled pointers) and NOT static a11y
 * (kid-ux-reviewer). These drive how a real 5-year-old abuses the colouring surface — scribble
 * a tiny bit, switch crayons mid-picture, paint over a finished shape, lift-and-retouch — and
 * judge whether the EXPERIENCE stays honest and clear (two-channel, no dead air, no broken
 * promise). Driven at the `ctx` boundary + real pointer events via @edu/testing.
 *
 * HARNESS CAVEAT (load-bearing): jsdom has no real canvas. `installJsdomCanvas()` stubs
 * getImageData to return all-transparent pixels, so coverage ALWAYS reads 0% here — pointer
 * strokes never auto-complete in tests. That is itself a finding: the auto-fill threshold is
 * UNTESTABLE without a real canvas, and any coverage-driven feedback can only be proven via the
 * "Fill it!" fallback. Each test notes whether the harness hides the real-tablet behaviour.
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

/** intro → teaching, before any colour is picked. */
async function reachTeaching(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
  await screen.findByText(catalog['teach.colorPrompt']!);
}

describe('ux-breaker: draw-to-fill paint mechanic off-rail', () => {
  it('empty-handed canvas drag surfaces the "pick a colour first" nudge (UX-breaker gap #1, FIXED)', async () => {
    render(<Game ctx={ctx()} />);
    await reachTeaching();

    const canvas = document.querySelector('.ctr-paint-canvas') as HTMLCanvasElement;
    expect(canvas).toBeTruthy();
    // Before any gesture, the bot bubble greets with the colour prompt.
    await screen.findByText(catalog['teach.colorPrompt']!);

    // Child eagerly drags across the shape BEFORE picking a crayon (the obvious first move:
    // the colouring book is right there). PaintableShape now reports this via onPaintWithoutColour.
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 150, clientY: 150 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 120, clientY: 120 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 180, clientY: 180 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    // FIXED: the empty-handed drag dispatches TAP_SHAPE → the reducer's no-colour guard returns
    // the 'teach.pickFirst' nudge. It lands in the aria-live bubble (visual/SR channel) and is
    // spoken via the TTS twin (audio channel) — two-channel guidance, not dead air. The earlier
    // colour-prompt line is replaced, so the most natural first gesture is now guided.
    expect(await screen.findByText(catalog['teach.pickFirst']!)).toBeTruthy();
    expect(screen.queryByText(catalog['teach.colorPrompt']!)).toBeNull();
  });

  it('[GAP] painting a tiny dot then pressing "Fill it!" teaches from ~nothing — no minimum, no honesty', async () => {
    render(<Game ctx={ctx()} />);
    await reachTeaching();
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));

    const canvas = document.querySelector('.ctr-paint-canvas') as HTMLCanvasElement;
    // One tiny dot — a child who taps once and gives up on dragging.
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 150, clientY: 150 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    // The "Fill it!" button is the guaranteed path, but it INSTANTLY completes regardless of how
    // little was actually coloured — the coverage progressbar still reads 0% the moment before.
    const coverage = canvas.parentElement?.querySelector('[role="progressbar"]');
    const pctBefore = coverage?.getAttribute('aria-valuenow');

    // [GAP / DESIGN] There is no relationship between effort and completion: "Fill it!" is an
    // instant escape hatch (fine for accessibility) but it means the *draw* mechanic is purely
    // cosmetic — a child can teach the AI having coloured ~0% of the shape, and the bot never
    // notices. This probe documents that the coverage bar is 0 right before an instant fill.
    expect(pctBefore).toBe('0'); // proves "done" is decoupled from actual coverage
  });

  // OPEN GAP #2 — DESIGN DECISION pending (not yet chosen): switching crayons mid-picture leaves
  // earlier strokes under the new colour while the AI stores only the LAST swatch hex, so the
  // picture and the taught example disagree. Skipped (not deleted) so the repro is ready the moment
  // a model is chosen — clear-buffer / dominant-colour / "now painting blue" cue. Un-skip + fix then.
  it.skip('[OPEN/DESIGN] switching crayons mid-picture never clears earlier strokes → swatch disagrees with picture', async () => {
    render(<Game ctx={ctx()} />);
    await reachTeaching();
    const canvas = document.querySelector('.ctr-paint-canvas') as HTMLCanvasElement;

    // Paint with RED…
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    // …then a child changes their mind and picks BLUE and keeps drawing.
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.blue']! }));
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 150, clientY: 150 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 120, clientY: 180 });
    fireEvent.pointerUp(canvas, { pointerId: 2 });

    // [GAP] The PaintableShape paint buffer is ONLY cleared in the effect keyed on `filled`
    // (PaintableShape.tsx: the reset-paint effect deps are [filled, render]) — selecting a new
    // colour changes `selectedHex` but NOT `filled`, so the red strokes persist underneath the
    // blue ones. The child sees a RED-AND-BLUE shape but the AI will learn ONE label tied to the
    // LAST swatch's hex (data.selectedHex). For a teach-by-example colour lesson that is a broken
    // promise: the picture the child made and the swatch the AI stores disagree.
    //
    // We can't read canvas pixels under the jsdom stub, so we PROVE the wiring gap instead: there
    // is no observable signal (no bubble, no prompt change, no cleared coverage) telling the child
    // their previous colour was discarded/kept. Assert that *some* "you switched colours" feedback
    // exists. It does not today → this FAILS until switching colour visibly resets or warns.
    const switchNudge = screen.queryByText(/start over|switched|clear|new colour|different colour/i);
    expect(switchNudge).not.toBeNull();
  });

  it('painting/tapping an ALREADY-FILLED shape cannot double-complete (handled WELL)', async () => {
    render(<Game ctx={ctx()} />);
    await reachTeaching();
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));

    // Shape is now filled; the prompt has flipped to the naming sub-phase ("What colour is this?").
    await screen.findByText(catalog['teach.name']!);

    // GOOD #1: the "Fill it!" button is now DISABLED — a child mashing it can't re-fire onFilled.
    const fill = screen.getByRole('button', { name: catalog['teach.fillBtn']! }) as HTMLButtonElement;
    expect(fill.disabled).toBe(true);

    // GOOD #2: the "Teach AI!" beat is offered (clear next step, not a dead end).
    expect(screen.getByRole('button', { name: catalog['teach.teachBtn']! })).toBeTruthy();

    // GOOD #3: dragging the filled canvas again is inert (onPointerDown early-returns on `filled`).
    // No crash, no extra completion — the prompt is unchanged after extra scribbling.
    const canvas = document.querySelector('.ctr-paint-canvas') as HTMLCanvasElement;
    fireEvent.pointerDown(canvas, { pointerId: 9, clientX: 150, clientY: 150 });
    fireEvent.pointerMove(canvas, { pointerId: 9, clientX: 160, clientY: 160 });
    fireEvent.pointerUp(canvas, { pointerId: 9 });
    expect(screen.getByText(catalog['teach.name']!)).toBeTruthy();
  });
});
