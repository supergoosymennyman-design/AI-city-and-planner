import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_ROOT = path.join(ROOT, 'P5 Programme/buddy-kit/client/city-builder/assets/models/gateways');
const CITY_SOURCE = fs.readFileSync(path.join(ROOT, 'P5 Programme/buddy-kit/client/city-builder/city-builder.js'), 'utf8');
const LIBRARY_SOURCE = fs.readFileSync(path.join(ROOT, 'P5 Programme/buddy-kit/client/city-common/library.js'), 'utf8');

function readGlb(name) {
  const file = path.join(MODEL_ROOT, name);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${name}: GLB magic`);
  let offset = 12, json, bin;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'JSON') json = JSON.parse(data.toString('utf8').replace(/\0+$/g, '').trim());
    if (type.startsWith('BIN')) bin = data;
    offset += 8 + length;
  }
  assert.ok(json && bin, `${name}: embedded JSON and BIN chunks`);
  return { file, bytes, json, bin };
}

function pngDimensions(data) {
  assert.deepEqual([...data.subarray(0, 8)], [137,80,78,71,13,10,26,10], 'embedded texture is PNG');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

for (const [kind, name, triangles] of [
  ['workshop', 'passiona-ai-workshop-gateway.glb', 34508],
  ['studio', 'passiona-fit-studio-gateway.glb', 34704],
]) {
  test(`${kind} flagship gateway GLB meets the shipping budget`, () => {
    const { bytes, json, bin } = readGlb(name);
    assert.ok(bytes.length < 8 * 1024 * 1024, `${name}: under 8 MiB`);
    assert.ok(json.extensionsUsed?.includes('EXT_meshopt_compression'), `${name}: Meshopt used`);
    assert.ok(json.extensionsRequired?.includes('EXT_meshopt_compression'), `${name}: Meshopt required`);
    const actualTriangles = json.meshes.flatMap(mesh => mesh.primitives)
      .reduce((sum, primitive) => sum + json.accessors[primitive.indices].count / 3, 0);
    assert.equal(actualTriangles, triangles);
    assert.ok(actualTriangles <= 35000, `${name}: no more than 35k triangles`);
    assert.equal(json.materials.length, 1, `${name}: one PBR material`);
    assert.equal(json.images.length, 3, `${name}: base colour, normal and metallic/roughness maps`);
    for (const image of json.images) {
      assert.equal(image.uri, undefined, `${name}: texture is embedded`);
      assert.equal(image.mimeType, 'image/png');
      const view = json.bufferViews[image.bufferView];
      const texture = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
      assert.deepEqual(pngDimensions(texture), [1024, 1024], `${name}: embedded texture is 1K`);
    }
  });
}

test('gateways are protected City-owned appearances, not picker objects', () => {
  assert.match(CITY_SOURCE, /protected:true/);
  assert.match(CITY_SOURCE, /createGLTFLoader\(\)\.loadAsync\(spec\.model\.file\)/);
  assert.match(CITY_SOURCE, /passiona-ai-workshop-gateway\.glb/);
  assert.match(CITY_SOURCE, /passiona-fit-studio-gateway\.glb/);
  assert.doesNotMatch(LIBRARY_SOURCE, /passiona-(?:ai-workshop|fit-studio)-gateway/);
});
