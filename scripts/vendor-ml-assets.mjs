#!/usr/bin/env node
/*
 * vendor-ml-assets.mjs — stage self-hosted ML runtime assets for @edu/toolbox.
 *
 * Rule #4 (no third-party CDN at runtime): the ML libraries are loaded from npm,
 * but MediaPipe's .wasm/.tflite/model files are fetched at runtime via locateFile.
 * This dev tool copies them out of node_modules into packages/toolbox/assets/
 * (git-ignored) so a host can serve them locally. coco-ssd weights are fetched by
 * the lib; pass a local `cocoModelUrl` to keep that offline too.
 *
 * Usage:  node scripts/vendor-ml-assets.mjs
 */
import { mkdir, readdir, copyFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const assetsDir = join(repoRoot, 'packages', 'toolbox', 'assets');

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyHolistic() {
  const src = join(repoRoot, 'node_modules', '@mediapipe', 'holistic');
  if (!(await exists(src))) {
    console.log('•  @mediapipe/holistic not installed — skipping.');
    console.log('   Install it where the host bundles (it is an optional peer dep), then re-run.');
    return;
  }
  const dest = join(assetsDir, 'mediapipe', 'holistic');
  await mkdir(dest, { recursive: true });
  const wanted = /\.(wasm|tflite|binarypb|data|js)$/i;
  const files = (await readdir(src)).filter((f) => wanted.test(f));
  for (const f of files) await copyFile(join(src, f), join(dest, f));
  console.log(`✓  Holistic: copied ${files.length} asset file(s) -> ${dest}`);
}

async function main() {
  console.log('Vendoring self-hosted ML assets (no CDN, rule #4)...\n');
  await mkdir(assetsDir, { recursive: true });
  await copyHolistic();
  console.log('\nNext (host wiring step):');
  console.log('  - serve packages/toolbox/assets/ and pass its base path as');
  console.log('    `holisticAssetBase` to createAIServices.');
  console.log('  - vendor coco-ssd weights locally and pass `cocoModelUrl`.');
}

main().catch((e) => {
  console.error('vendor-ml-assets failed:', e);
  process.exitCode = 1;
});
