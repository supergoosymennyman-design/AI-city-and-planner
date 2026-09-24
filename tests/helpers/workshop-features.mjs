// tests/helpers/workshop-features.mjs
//
// Load the REAL curated TrashNet catalogue + its pinned MobileNet feature chunks
// in Node — exactly the 1024-dim unit vectors the browser feeds the recycling
// station. Used by the Stage 4 unit tests and the browser integration run so a
// mock can never stand in for the actual image-model assets.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LIBRARY_DIR = path.join(ROOT, 'P5 Programme', 'buddy-kit', 'client', 'workshop', 'assets', 'library');

export const PHOTO_PREPROCESSING = 'mobilenet-v3-small-224-squash-f32-unit-v1';
export const PHOTO_DIMENSION = 1024;

/** The TrashNet catalogue ({ photos, labels, source, license }). */
export function trashnetCatalogue() {
  return require(path.join(LIBRARY_DIR, 'catalogue.js')).trashnet;
}

const chunkCache = new Map();
/** Decode one features-NNN.js chunk → array of 1024-dim float arrays (row = offset). */
export function loadChunk(index) {
  if (chunkCache.has(index)) return chunkCache.get(index);
  const file = path.join(LIBRARY_DIR, `features-${String(index).padStart(3, '0')}.js`);
  const text = readFileSync(file, 'utf8');
  const m = text.match(/WorkshopLibraryChunks\[\d+\]\s*=\s*"([^"]+)"/);
  if (!m) throw new Error(`No feature payload in ${file}`);
  const buf = Buffer.from(m[1], 'base64');
  if (buf.byteLength % (PHOTO_DIMENSION * 4) !== 0) throw new Error(`Damaged feature payload in ${file}`);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const count = buf.byteLength / (PHOTO_DIMENSION * 4);
  const rows = [];
  for (let r = 0; r < count; r++) {
    const v = new Array(PHOTO_DIMENSION);
    for (let j = 0; j < PHOTO_DIMENSION; j++) v[j] = dv.getFloat32((r * PHOTO_DIMENSION + j) * 4, true);
    rows.push(v);
  }
  chunkCache.set(index, rows);
  return rows;
}

/** The 1024-dim UNIT feature vector for a catalogue photo row (the Workshop
 *  `register()` normalizes on load — raw chunks are not unit). */
export function vectorFor(row) {
  const rows = loadChunk(row.chunk);
  const v = rows[row.offset];
  if (!v) throw new Error(`No feature at chunk ${row.chunk} offset ${row.offset} (${row.id})`);
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

/** The first `perClass` rows of `labels` in the given split, with their vectors. */
export function examplesFor(labels, split, perClass) {
  const photos = trashnetCatalogue().photos;
  const out = [];
  for (const label of labels) {
    const picked = photos.filter((p) => p.label === label && p.split === split).slice(0, perClass);
    for (const row of picked) out.push({ row, label, vector: vectorFor(row) });
  }
  return out;
}
