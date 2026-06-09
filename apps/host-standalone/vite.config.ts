import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * host-standalone — runs ONE game full-screen (lesson mode, §2 apps/).
 * Static build, no CDN; consumes @edu/* workspace packages as TS source (Vite transpiles).
 */
export default defineConfig({
  plugins: [react()],
  // base:'./' → all asset URLs are RELATIVE to index.html, so the built `dist/` is portable:
  // it runs the same whether served from a domain root, a sub-path, or `vite preview` — the
  // "click a link and play" deploy. (It still needs http(s)/localhost, NOT file://: browsers
  // block ES-module <script>s over file:// — see Vite "CORS error" troubleshooting.)
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2022' },
});
