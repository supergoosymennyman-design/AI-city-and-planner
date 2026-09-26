import { defineConfig } from 'vite';
import { autoRigDev } from './auto-rig-dev.mjs';

export default defineConfig({
  base: './',
  plugins: [autoRigDev()],
  build: {
    // Two pages: the main Studio (`index.html`) and the City hand-off editor
    // (`model.html`) the City's "Edit model in Fit Studio" opens at the same
    // origin. Without this the City's link 404s and the round-trip is dead.
    rollupOptions: {
      input: { index: 'index.html', model: 'model.html' },
    },
  },
});
