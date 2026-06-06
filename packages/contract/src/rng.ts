/**
 * Deterministic seeded RNG (§4c). The sim threads this through every `tick`;
 * bare `Math.random()` is lint-banned in sim packages. Same seed + same inputs
 * → identical sequence on the pinned engine (determinism is a property devs can
 * reason about, not a hope). Serializable as a single uint32 (`state`), so a
 * paused/saved sim resumes the exact stream.
 *
 * `pure-rand` is the production option (shared with fast-check tests); this
 * Mulberry32 is the zero-dependency fallback used inside the sim core.
 */
export interface SeededRng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** Current internal state — serialize this to resume an identical stream. */
  readonly state: number;
}

/** Create a Mulberry32 RNG from a 32-bit seed (or restored `state`). */
export function makeRng(seed: number): SeededRng {
  let s = seed >>> 0;
  const rng: SeededRng = {
    next(): number {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    nextInt(maxExclusive: number): number {
      if (maxExclusive <= 0) return 0;
      return Math.floor(rng.next() * maxExclusive);
    },
    get state(): number {
      return s >>> 0;
    },
  };
  return rng;
}
