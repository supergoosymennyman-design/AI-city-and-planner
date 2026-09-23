import { defineConfig } from 'vite';
import { autoRigDev } from './auto-rig-dev.mjs';

export default defineConfig({
  base: './',
  plugins: [autoRigDev()],
});
