#!/usr/bin/env node
/*
 * vendor-ml-assets.mjs — stage self-hosted ML model + runtime assets for the host (rule #4: no
 * third-party CDN at runtime; offline-first). Writes into apps/host-standalone/public/ml/ so Vite
 * serves them at /ml/ and (later) the PWA service worker precaches them. The dir is git-ignored —
 * run this once after `npm install` (and it's wired as a pre(dev|build) step). Idempotent: existing,
 * non-empty files are skipped, so re-runs need no network.
 *
 *   public/ml/mobilenet/model.json + shards      — teachable-image feature extractor (createAIServices mobilenetUrl)
 *   public/ml/tasks-vision/wasm/*                — MediaPipe Tasks Vision runtime (FilesetResolver / mpWasmBase)
 *   public/ml/tasks-vision/hand_landmarker.task  — hand landmark model (handModelUrl)
 *
 * Usage:  npm run vendor-ml   (or: node scripts/vendor-ml-assets.mjs)
 */
import { mkdir, readdir, copyFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const mlDir = join(repoRoot, 'apps', 'host-standalone', 'public', 'ml');

// MobileNet v2, alpha 1.0 (224) — matches the createAIServices default (version 2, alpha 1.0).
// Served by TF Hub; ?tfjs-format=file redirects to the real (signed) storage object, which fetch follows.
const MOBILENET_TFHUB = 'https://tfhub.dev/google/imagenet/mobilenet_v2_100_224/classification/2';
// MediaPipe hand landmarker (float16) — the official model bundle.
const HAND_TASK_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

async function nonEmpty(p) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

/** Download a URL to `dest` (skipped if already present). Follows redirects (TF Hub → signed storage). */
async function download(url, dest, label) {
  if (await nonEmpty(dest)) {
    console.log(`•  ${label}: already present — skip`);
    return;
  }
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(`✓  ${label}: ${(buf.length / 1e6).toFixed(1)} MB -> ${dest}`);
}

/** Vendor a tfjs graph model (model.json + its weight shards) from a TF Hub base URL. */
async function vendorTfHubModel(base, destDir, label) {
  await mkdir(destDir, { recursive: true });
  const modelJsonDest = join(destDir, 'model.json');
  let manifest;
  if (await nonEmpty(modelJsonDest)) {
    console.log(`•  ${label} model.json: already present — skip`);
    const { readFile } = await import('node:fs/promises');
    manifest = JSON.parse(await readFile(modelJsonDest, 'utf8'));
  } else {
    const res = await fetch(`${base}/model.json?tfjs-format=file`);
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status} for model.json`);
    manifest = await res.json();
    await writeFile(modelJsonDest, JSON.stringify(manifest));
    console.log(`✓  ${label} model.json -> ${modelJsonDest}`);
  }
  // Weight shards are listed relative in weightsManifest[].paths; fetch each via the same TF Hub base.
  const paths = (manifest.weightsManifest || []).flatMap((g) => g.paths || []);
  for (const p of paths) {
    await download(`${base}/${p}?tfjs-format=file`, join(destDir, p), `${label} ${p}`);
  }
}

/** Copy the tasks-vision wasm runtime out of node_modules (no download needed). */
async function copyTasksVisionWasm(destDir) {
  const src = join(repoRoot, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
  if (!(await nonEmpty(join(src, 'vision_wasm_internal.wasm')))) {
    console.log('•  @mediapipe/tasks-vision not installed — skipping wasm copy.');
    return;
  }
  await mkdir(destDir, { recursive: true });
  const files = await readdir(src);
  for (const f of files) await copyFile(join(src, f), join(destDir, f));
  console.log(`✓  tasks-vision wasm: copied ${files.length} file(s) -> ${destDir}`);
}

async function main() {
  console.log('Vendoring self-hosted ML assets into public/ml/ (no CDN at runtime, rule #4)...\n');
  await mkdir(mlDir, { recursive: true });
  await vendorTfHubModel(MOBILENET_TFHUB, join(mlDir, 'mobilenet'), 'MobileNet v2');
  await copyTasksVisionWasm(join(mlDir, 'tasks-vision', 'wasm'));
  await download(HAND_TASK_URL, join(mlDir, 'tasks-vision', 'hand_landmarker.task'), 'hand_landmarker.task');
  console.log('\n✓ Done. The host serves these at /ml/** and createContext points the toolbox at them.');
}

main().catch((e) => {
  console.error('vendor-ml-assets failed:', e.message);
  process.exitCode = 1;
});
