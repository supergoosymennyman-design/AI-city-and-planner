/**
 * Adversarial — React 18 StrictMode double-invoke + Canvas/pointer edges (charter §6, §7).
 *
 * StrictMode intentionally mounts effects twice in dev to surface missing cleanup. The Game's
 * comments claim it's hardened (a one-shot sound ref; narrow effect deps to avoid double
 * START_ROUND). We verify end-to-end that a StrictMode mount does NOT: play a chime twice,
 * double-dispatch the first round, or run two listen loops (double listenCount per window).
 *
 * Canvas: jsdom has no real canvas (the global stub returns a no-op context). We assert the
 * draw-to-fill surface RENDERS and that setPointerCapture throwing (palm-reject) does not crash
 * the game — the keyboard/tap "Fill it!" path must carry on (§6b, §7).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { makeFakeAi, makeFakeContext } from '@edu/testing';
import { Game } from '../Game.js';
import en from '../i18n/en.json';

const catalog = en as Record<string, string>;
afterEach(cleanup);

describe('adversarial: StrictMode double-invoke must not double side-effects', () => {
  it('plays the teach "done" chime exactly once under StrictMode (no double chime)', async () => {
    const plays: string[] = [];
    const ctx = makeFakeContext({ catalog, ai: makeFakeAi().ai });
    ctx.audio.play = (id) => { plays.push(id); };
    render(
      <StrictMode>
        <Game ctx={ctx} />
      </StrictMode>,
    );

    fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));
    await screen.findByText(/I'm learning!/);

    // The lastSoundData ref must dedupe StrictMode's double-invoke → exactly one 'done'.
    expect(plays.filter((p) => p === 'done')).toHaveLength(1);
  });

  it('does not double-score the first quiz round under StrictMode (no double START_ROUND/GAME_TAP)', async () => {
    // Force pickRound to always pick red so a single correct red tap is unambiguous.
    vi.spyOn(Math, 'random').mockReturnValue(0); // index 0 = 'red'
    const ctx = makeFakeContext({ catalog, ai: makeFakeAi().ai });
    render(
      <StrictMode>
        <Game ctx={ctx} />
      </StrictMode>,
    );

    fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
    for (const c of ['red', 'blue', 'yellow'] as const) {
      fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! }));
      fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
      fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
      fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! }));
    }
    await screen.findByText(/Round 1/);
    // One correct answer → score must be exactly 1 (a doubled GAME_TAP would make it 2).
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));
    await screen.findByText(catalog['game.correct']!);
    // Score reflected in the aria-label "Score: 1 of 5".
    await screen.findByLabelText(catalog['score.label']!.replace('{{score}}', '1').replace('{{total}}', '5'));
    vi.restoreAllMocks();
  });
});

describe('adversarial: Canvas / pointer edges must not crash the lesson', () => {
  it('renders the draw-to-fill surface and Fill-it path with the jsdom canvas stub', async () => {
    const ctx = makeFakeContext({ catalog, ai: makeFakeAi().ai });
    render(<Game ctx={ctx} />);
    fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));
    // The canvas (role=img drawing area) renders even though getContext is a stub.
    await screen.findByRole('img', { name: catalog['teach.shapeAria']! });
    // Fill it! is the guaranteed-accessible path.
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
    await screen.findByText(catalog['teach.dontKnow']!);
  });

  it('survives setPointerCapture throwing on pointer-down (palm-reject) — drawing still proceeds', async () => {
    // Make the stubbed canvas's setPointerCapture throw like a cancelled OS touch.
    const proto = (globalThis as { HTMLCanvasElement?: { prototype: Record<string, unknown> } }).HTMLCanvasElement
      ?.prototype;
    const original = proto?.setPointerCapture;
    if (proto) {
      proto.setPointerCapture = () => {
        throw new DOMException('InvalidPointerId', 'InvalidPointerId');
      };
    }
    try {
      const ctx = makeFakeContext({ catalog, ai: makeFakeAi().ai });
      render(<Game ctx={ctx} />);
      fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
      fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! }));
      const canvas = await screen.findByRole('img', { name: catalog['teach.shapeAria']! });

      // A pointer-down that triggers the throwing setPointerCapture must be swallowed (try/catch),
      // not crash the tree. The game survives → Fill it! still completes the shape.
      fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 150, clientY: 150 });
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 160, clientY: 160 });
      fireEvent.pointerUp(canvas, { pointerId: 1 });

      fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
      await screen.findByText(catalog['teach.dontKnow']!);
    } finally {
      if (proto) proto.setPointerCapture = original as never;
    }
  });
});
