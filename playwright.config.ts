import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — tablet-viewport browser smoke tests (plan §8/§11.3).
 *
 * WHY this exists alongside Vitest: jsdom has NO real canvas, so the draw-to-fill coverage
 * math in `PaintableShape` (getImageData over real pixels) is UNTESTABLE in unit tests — the
 * coverage always reads 0% there. These specs drive a REAL Chromium canvas so the ~60% auto-snap
 * threshold and the pointer→paint path are actually exercised (UX-breaker harness caveat).
 *
 * Deliberately NOT chained into `npm run validate` — it needs a downloaded browser binary
 * (`npx playwright install chromium`) and a running dev server, which the unit gate must not
 * require. Run explicitly with `npm run test:e2e`. CI wires it as a separate job.
 */
export default defineConfig({
  testDir: './e2e',
  // Each spec drives a multi-step drag; give the browser room but fail fast on a hang.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      // A landscape tablet with touch — the target form factor (plan §0a min spec).
      name: 'tablet-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
      },
    },
  ],
  // Boot the standalone host (it mounts this one game full-screen) and wait for it.
  // Dev server resolves the workspace TS source directly — no pre-build needed.
  webServer: {
    command: 'npm run dev --workspace @edu/host-standalone',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
