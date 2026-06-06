import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * host-standalone — runs ONE game full-screen (lesson mode, §2 apps/).
 * Static build, no CDN; consumes @edu/* workspace packages as TS source (Vite transpiles).
 */
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: { target: 'es2022' },
});
