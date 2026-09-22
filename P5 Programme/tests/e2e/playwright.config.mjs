// playwright.config.mjs — P5 e2e suite.
//
// Serves buddy-kit/client via a tiny static server (no deploy needed) and runs
// the specs with a SwiftShader launch (tablet-GPU proxy, same as the old
// ad-hoc scripts). Run from the repo root:
//   npm run test:e2e
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 8377);
// SwiftShader rendering plus the per-test `Emulation.setCPUThrottlingRate`
// makes these specs CPU- and GPU-bound. One City can consume the headless
// SwiftShader budget; parallel City boots make unrelated tests time out after
// command-buffer failures. Keep release verification serial; E2E_WORKERS can
// opt into deliberate concurrency stress.
const WORKERS = Number(process.env.E2E_WORKERS) || 1;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  timeout: 120000,
  expect: { timeout: 30000 },
  retries: process.env.CI ? 2 : 0,
  workers: WORKERS,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    // Without this, a single un-clickable/off-screen control burns the whole
    // 120s test timeout and hides which interaction actually failed.
    actionTimeout: 30000,
    navigationTimeout: 60000,
    launchOptions: {
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    },
  },
  webServer: {
    // Runs with cwd = this config's directory (P5 Programme/tests/e2e/).
    command: `node static-server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/city-builder/`,
    // ALWAYS start our own server: a stale dev server on the same port may
    // serve the wrong docroot (e.g. client source without /planner/), which
    // silently 404s the journey spec. Start fresh every run.
    reuseExistingServer: false,
    timeout: 30000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
