/**
 * A scriptable {@link AIServices} double for fast, browser-free logic tests.
 *
 * Because every game touches STT/ML only through `ctx.ai` (golden rule #2, ctx-only I/O),
 * faking this one object gives 100%-deterministic voice/ML tests with no `window`, no mic,
 * no network. Queue what the next `listenOnce()` will "hear"; read `listenCount` to prove
 * the game re-armed the mic after a miss (the bug this was built to catch).
 */
import type { AIServices, Capability, Classification } from '@edu/contract';

/** A fake `AIServices` plus the controls a test drives it with. */
export interface FakeAi {
  /** The double to put on `ctx.ai`. */
  ai: AIServices;
  /** Script the upcoming `listenOnce()` results, in order (`null` = heard nothing). */
  queueHeard(...phrases: Array<string | null>): void;
  /** How many times `listenOnce()` has been called (a re-arm bumps this). */
  readonly listenCount: number;
}

/** Build a fake `AIServices`. `canListen` toggles `probe('listen')` for gating tests (R21). */
export function makeFakeAi(opts: { canListen?: boolean } = {}): FakeAi {
  const { canListen = true } = opts;
  const queue: Array<string | null> = [];
  let listenCount = 0;

  const ai: AIServices = {
    // Voice gating (R21): 'listen' follows `canListen`; 'speak' is always fine in tests.
    probe: async (cap: Capability) => (cap === 'listen' ? canListen : cap === 'speak'),
    // Returns the next scripted phrase; defaults to `null` ("heard nothing") when drained —
    // exactly the miss case that must leave the mic re-tappable.
    listenOnce: async () => {
      listenCount += 1;
      return queue.length ? (queue.shift() as string | null) : null;
    },
    // Image/pose aren't exercised by KG voice tests — minimal honest stubs.
    trainImageClass: async () => {},
    classifyImage: async (): Promise<Classification> => ({ label: '', confidence: 0 }),
    detectPose: async () => [],
    dispose: async () => {},
  };

  return {
    ai,
    queueHeard: (...phrases) => {
      queue.push(...phrases);
    },
    get listenCount() {
      return listenCount;
    },
  };
}
