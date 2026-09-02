/**
 * The deployment-scoped runaway brake — deliberately the ONLY module in server/ allowed to hold
 * mutable state (tests/scope-law.test.js pins this). It is NOT a per-child or per-lesson cap: the
 * child's own budget lives in their browser (the client Lesson store, spec §7.1) and the wallet
 * ceiling lives at the provider (spec §7.3). This exists so a curl loop or a leaked URL hits a
 * bounded daily ceiling instead of the deployer's bill. Day-bucketed so a tripped brake never
 * bricks the deployment for good — the bucket is the UTC date, which is fine for a deployment-scope
 * limit (contrast the client's spend key, which uses the LOCAL date because a school day is local).
 * On serverless the brake is per-instance; the docs say so (spec §7.2).
 */

/** Tokens/day/instance when the deployer says nothing at all. */
const DEFAULT_CEILING = 2_000_000;

/**
 * Resolves the brake ceiling from the environment — the ONE place `BUDDY_DAILY_BRAKE` is parsed.
 *
 * WHY this is a function and not an inline `Number(env.X ?? default)`: `.env` templates ship their
 * keys as BLANK lines (`BUDDY_DAILY_BRAKE=`), and `Number('')` is `0`, which `makeBrake` reads as the
 * deliberate "disabled" opt-out. A deployer who copies `.env.example` and fills in only what they have
 * would therefore have silently switched OFF the only server-side spend protection there is. Blank now
 * means DEFAULT; an explicit `'0'` is still the honest opt-out; garbage (`'abc'`) still becomes `NaN`
 * and flows to `makeBrake`'s loud boot throw rather than being papered over here.
 * @param {NodeJS.ProcessEnv|object} env - typically `process.env`; injected for testability.
 * @returns {number} the ceiling to hand `makeBrake` — `2_000_000` when unset/blank, else `Number(raw)`.
 */
export function brakeCeilingFrom(env) {
  const raw = env.BUDDY_DAILY_BRAKE;
  return raw === undefined || String(raw).trim() === '' ? DEFAULT_CEILING : Number(raw);
}

/**
 * @param {object} cfg
 * @param {number} cfg.ceiling - tokens/day/instance. `0` disables the brake (a deliberate deployer
 *   choice, documented in .env.example). Anything else must be a finite number >= 0 — a malformed
 *   value throws at boot, because a deploy misconfiguration must never silently mean "unlimited".
 * @param {() => number} cfg.now - millisecond clock, injected for testability (`Date.now` in prod).
 * @returns {{check: () => {ok: boolean}, add: (usageTotal: number|undefined) => number}}
 */
export function makeBrake({ ceiling, now }) {
  if (typeof ceiling !== 'number' || !Number.isFinite(ceiling) || ceiling < 0) {
    throw new Error(`makeBrake: ceiling must be a finite number >= 0 (0 = disabled), got ${JSON.stringify(ceiling)}`);
  }
  if (typeof now !== 'function') {
    throw new Error('makeBrake: now must be a function returning epoch milliseconds');
  }
  const disabled = ceiling === 0;
  let dayKey = null;
  let total = 0;
  /** Resets the running total when the UTC date changes since the last call. */
  function roll() {
    const key = new Date(now()).toISOString().slice(0, 10);
    if (key !== dayKey) { dayKey = key; total = 0; }
  }
  return {
    /** @returns {{ok: boolean}} false once today's total has reached the ceiling. */
    check() { roll(); return { ok: disabled || total < ceiling }; },
    /**
     * Accumulates a turn's `totalUsage.totalTokens`. Garbage input adds 0 (a missing usage object
     * must never throw or NaN the total — same tolerance the old spend cap had).
     * @returns {number} today's new running total.
     */
    add(usageTotal) {
      roll();
      const n = Number(usageTotal);
      total += Number.isFinite(n) ? n : 0;
      return total;
    },
  };
}
