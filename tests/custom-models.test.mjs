import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_MODELS_KEY, MAX_CUSTOM_MODEL_BYTES, normalizeCustomManifest, resolveCustomOverride, validateGLB } from '../P5 Programme/buddy-kit/client/city-common/custom-models.js';
import { CF_KEYS, collectState } from '../P5 Programme/buddy-kit/client/city-common/champion-file.js';

function makeGlb(json) {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = (encoded.length + 3) & ~3;
  const glb = new Uint8Array(20 + padded);
  const view = new DataView(glb.buffer);
  glb.set([0x67,0x6c,0x54,0x46]);
  view.setUint32(4, 2, true); view.setUint32(8, glb.length, true);
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true);
  glb.fill(0x20, 20); glb.set(encoded, 20);
  return glb;
}
const glb = makeGlb({asset:{version:'2.0'},accessors:[{count:300}],meshes:[{primitives:[{attributes:{POSITION:0}}]}]});
test('custom model validation accepts GLB magic and rejects unsafe files', () => {
  assert.equal(validateGLB(glb.buffer).ok, true);
  assert.equal(validateGLB(new ArrayBuffer(20)).ok, false);
  assert.equal(validateGLB(new ArrayBuffer(MAX_CUSTOM_MODEL_BYTES + 1)).ok, false);
});
test('GLB validation rejects external dependencies and reports bounded performance stats', () => {
  const external=makeGlb({asset:{version:'2.0'},buffers:[{uri:'model.bin'}]});
  assert.equal(validateGLB(external).ok,false);
  const result=validateGLB(glb);
  assert.deepEqual(result.stats,{bytes:glb.byteLength,triangles:100,materials:0,textures:0});
});
test('manifest retains device-missing metadata but only resolves known overrides', () => {
  const manifest=normalizeCustomManifest({models:[{id:'owl',name:'My Owl'}],overrides:{school:'owl',hospital:'gone'}});
  assert.equal(resolveCustomOverride('school',manifest),'owl');
  assert.equal(resolveCustomOverride('hospital',manifest),null);
  assert.equal(manifest.models[0].name,'My Owl');
  assert.equal(manifest.version,2);
  assert.deepEqual(manifest.models[0].footprint,[1,1]);
});
test('Champion File includes custom metadata key, never model bytes', () => {
  assert.equal(CF_KEYS.customModels,CUSTOM_MODELS_KEY);
  const storage={getItem:key=>key===CUSTOM_MODELS_KEY?JSON.stringify({models:[{id:'owl',name:'Owl'}],overrides:{}}):null};
  const state=collectState(storage);
  assert.match(state.customModels,/Owl/);
  assert.doesNotMatch(state.customModels,/ArrayBuffer|bytes/);
});
