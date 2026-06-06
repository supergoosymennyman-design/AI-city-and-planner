/**
 * setup-hooks.mjs — install this repo's git hooks by pointing git at `.githooks/`.
 *
 * WHY `core.hooksPath` instead of Husky: zero new dependencies (offline-first, no-CDN,
 * "no new heavy deps" — AGENTS.md), the hooks are plain scripts that version with the
 * code, and a single git-config line installs them. Runs automatically on `npm install`
 * via the package.json "prepare" script, so a fresh clone is push-gated with no manual
 * step (the deterministic clone → green `validate` onboarding goal, plan §6).
 *
 * TOLERANT BY DESIGN: a missing `.git` or missing git binary (source tarball, some CI
 * images) must NOT fail `npm install`. We warn and continue — the hook is a convenience;
 * CI is the hard gate. Failing here would block install for a non-critical nicety.
 */
import { execFileSync } from 'node:child_process';

try {
  // Point git at our committed hooks dir. Replaces the default .git/hooks lookup.
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  console.log('[setup-hooks] core.hooksPath → .githooks (pre-push runs `npm run validate`)');
} catch {
  // No git here (tarball install / CI without a checkout). Hooks just aren't installed.
  console.warn('[setup-hooks] skipped — git not available here; CI remains the hard gate');
}
