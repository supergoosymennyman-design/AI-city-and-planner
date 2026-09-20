import { defineConfig } from '@playwright/test';
export default defineConfig({
  testMatch: 'games.spec.js',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1024, height: 768 },
  },
  outputDir: 'test-results',
});
