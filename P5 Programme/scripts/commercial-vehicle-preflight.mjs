#!/usr/bin/env node
/**
 * Reports the owner-vetted vehicle intake before conversion.  Raw files are
 * intentionally gitignored in `library/intake/commercial-vehicles/`; this
 * report is safe to commit and is useful when a download was not attached.
 */
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const library = join(root, 'buddy-kit/client/library');
const intake = JSON.parse(readFileSync(join(library, 'COMMERCIAL-VEHICLE-INTAKE.json'), 'utf8'));
const rawDir = join(library, 'intake/commercial-vehicles');
const files = existsSync(rawDir) ? readdirSync(rawDir).map((name) => ({ name, bytes: statSync(join(rawDir, name)).size })) : [];
const accepted = intake.records.filter((r) => r.status === 'accepted');

function glbFacts(path) {
  const bytes = readFileSync(path);
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  let offset = 12, json = null;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (type === 0x4e4f534a) json = JSON.parse(bytes.subarray(offset, offset + length).toString('utf8'));
    offset += length;
  }
  if (!json) throw new Error('missing JSON chunk');
  const triangles = (json.meshes || []).flatMap((mesh) => mesh.primitives || []).reduce((sum, primitive) => {
    const accessor = json.accessors?.[primitive.indices];
    return sum + (accessor ? Math.floor(accessor.count / 3) : 0);
  }, 0);
  const images = json.images || [];
  return { triangles, materials: (json.materials || []).length, embeddedImages: images.filter((image) => image.bufferView !== undefined).length,
    externalImages: images.filter((image) => image.uri).length };
}

console.log(`[commercial-vehicle-preflight] records=${intake.records.length} accepted=${accepted.length} rawFiles=${files.length}`);
for (const record of intake.records) {
  const output = record.glb ? join(library, record.glb.replace(/^library\//, '')) : null;
  let outputState = 'no GLB';
  if (output && existsSync(output)) {
    const facts = glbFacts(output);
    outputState = `${(statSync(output).size / 1048576).toFixed(2)}MiB, ${facts.triangles} triangles, ${facts.materials} materials, images embedded/external ${facts.embeddedImages}/${facts.externalImages}`;
  }
  console.log(`  ${record.status === 'accepted' ? '✓' : '○'} ${record.id}: ${record.status}; ${outputState}`);
}
for (const file of files) console.log(`  raw ${file.name}: ${(file.bytes / 1048576).toFixed(2)}MiB`);
if (!files.length) console.log(`  intake directory absent: ${rawDir}`);
