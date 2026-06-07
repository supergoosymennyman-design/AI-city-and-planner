/**
 * Adversarial — teardown leaks + teacher actions fired mid-async (charter §4, §10).
 *
 * The continuous listen loop and the TTS-independent advance timer both run OUTSIDE React's
 * render. If a child closes the game (unmount) or the teacher hits Reset/Replay WHILE a
 * `listenOnce` is in flight or the feedback timer is pending, the resolving async must NOT:
 *   - call setState / dispatch after unmount (React warns; on a real device = a console error
 *     storm + a possible leak), nor
 *   - act on a stale phase (double-advance, wrong-round dispatch).
 *
 * The existing voice.test.tsx never unmounts mid-listen and never fires a teacher action while
 * an async op is pending, so these are uncovered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AIServices, TeacherControls } from '@edu/contract';
import { makeFakeAi, makeFakeContext } from '@edu/testing';
import { Game } from '../Game.js';
import en from '../i18n/en.json';

const catalog = en as Record<string, string>;
afterEach(cleanup);

/** A teacher surface whose onChange we can fire on demand (the real overlay buttons). */
function makeDrivableTeacher(): { teacher: TeacherControls; fire: (a: 'reset' | 'replay' | 'back' | 'next' | 'skip') => void } {
  let cb: ((a: 'reset' | 'replay' | 'back' | 'next' | 'skip') => void) | null = null;
  const teacher: TeacherControls = {
    next: () => {}, back: () => {}, reset: () => {}, replay: () => {}, skip: () => {},
    onChange: (fn) => {
      cb = fn as typeof cb;
      return () => { cb = null; };
    },
  };
  return { teacher, fire: (a) => cb?.(a) };
}

async function reachAwaitingName(crayon = 'red'): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${crayon}`]! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
  fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
}

async function teachAllColours(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: catalog['intro.start']! }));
  for (const c of ['red', 'blue', 'yellow'] as const) {
    fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.fillBtn']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog['teach.teachBtn']! }));
    fireEvent.click(await screen.findByRole('button', { name: catalog[`colour.${c}`]! }));
  }
}

describe('adversarial: unmount mid-async must not setState/dispatch after unmount', () => {
  it('no React "update after unmount" error when unmounting while the listen loop awaits', async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a.join(' ')); });

    // A listen that never resolves while mounted, so the loop is parked in `await` at unmount.
    let resolve!: (v: string | null) => void;
    const ai: AIServices = {
      ...makeFakeAi().ai,
      listenOnce: () => new Promise<string | null>((r) => { resolve = r; }),
    };
    const { unmount } = render(<Game ctx={makeFakeContext({ catalog, ai })} />);
    await reachAwaitingName('red'); // mic auto-starts → loop is awaiting listenOnce

    unmount(); // child closes the game mid-listen
    // Now the awaited STT finally resolves with a real colour AFTER unmount.
    await act(async () => {
      resolve('red');
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 10));
    });

    const leaks = errors.filter((e) => /unmounted|update.*not.*reachable|memory leak/i.test(String(e)));
    expect(leaks, `setState-after-unmount leaked: ${leaks.join(' | ')}`).toHaveLength(0);
    spy.mockRestore();
  });
});

describe('adversarial: teacher Reset fired mid-async must not act on a stale phase', () => {
  it('Reset during the feedback timer does not double-advance / crash', async () => {
    const { teacher, fire } = makeDrivableTeacher();
    const ctx = makeFakeContext({ catalog, ai: makeFakeAi().ai });
    (ctx as { teacher: TeacherControls }).teacher = teacher;
    render(<Game ctx={ctx} />);
    await teachAllColours();

    await screen.findByText(/Round 1/);
    fireEvent.click(await screen.findByRole('button', { name: catalog['colour.red']! })); // feedback shows
    // Mid 1600ms feedback window, the teacher resets the whole game.
    act(() => fire('reset'));

    // Must land cleanly on the fresh intro — not crash, not jump to a phantom Round 2.
    await screen.findByText(catalog['intro.title']!);
    expect(screen.queryByText(/Round 2/)).toBeNull();
  });

  it('Reset while the listen loop awaits does not dispatch a stale ANSWER_COLOUR', async () => {
    const { teacher, fire } = makeDrivableTeacher();
    let resolve!: (v: string | null) => void;
    const ai: AIServices = {
      ...makeFakeAi().ai,
      listenOnce: () => new Promise<string | null>((r) => { resolve = r; }),
    };
    const ctx = makeFakeContext({ catalog, ai });
    (ctx as { teacher: TeacherControls }).teacher = teacher;
    render(<Game ctx={ctx} />);
    await reachAwaitingName('red'); // loop awaiting listenOnce

    act(() => fire('reset')); // teacher resets → back to intro
    await screen.findByText(catalog['intro.title']!);

    // The stale listen now resolves with "blue" AFTER the reset. It must be ignored — we're on
    // intro, nothing should be taught, no crash.
    await act(async () => {
      resolve('blue');
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByText(/Blue!/)).toBeNull();
    // Still cleanly on intro.
    await screen.findByText(catalog['intro.title']!);
  });
});
