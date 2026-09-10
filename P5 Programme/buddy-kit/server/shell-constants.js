// buddy-kit/server/shell-constants.js
/**
 * Constants the TWO gateway shells share. `server/gateway.js` (Node) and `worker/index.mjs`
 * (Cloudflare) are deliberate siblings; these three literals were duplicated in both, with a
 * "keep in sync" comment doing the work a single source should do (Gemini pass-3 architecture
 * review). Route MATCHING stays per-shell (the Worker additionally serves /api/save + /api/load),
 * but every value that must be byte-identical now lives here.
 *
 * The Worker imports this through its existing `../server/…` path (the deploy bundle copies
 * `server/` to `city-sim/buddy/server/`), so there is no second copy to drift.
 */

/** Body cap for /api/turn, /api/tidy-up and /api/load — an unauthenticated POST body should never
 *  need more than this. The save route may use a larger cap (worker MAX_SAVE_BYTES). */
export const MAX_BODY_BYTES = 256 * 1024;

/** NDJSON streaming headers — the one-terminal-frame transport contract. */
export const NDJSON_HEADERS = { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' };

/** Kid-voiced reply for a turn the DEPLOYMENT brake refused (brake.js — a runaway/curl loop, never a
 *  child: the browser's own day budget sits ~15× lower). The brake is per-DAY, so unlike the retired
 *  per-lesson cap message this one promises tomorrow, and still never promises that anything the
 *  child taps restores it. */
export const BRAKE_REPLY = "Our chat energy here is all used up for today! Your champion is safe and saved — we can keep building, and chat more tomorrow.";
