import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Root Vitest config (R1 testing infra — the repo's first test runner).
 *
 * - `jsdom` so React Testing Library can mount games headlessly (Canvas calls return null and
 *   are null-guarded in components, so logic/voice tests run without a real canvas).
 * - `@vitejs/plugin-react` transpiles TSX + the `.js`-suffixed imports the codebase uses.
 * - `passWithNoTests` so `npm run validate` never fails just because a package has no tests yet.
 * CSS imports (e.g. `import './styles.css'`) are left unprocessed by default → harmless no-ops.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    passWithNoTests: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['{games,packages,apps}/**/*.{test,spec}.{ts,tsx}'],
  },
});
