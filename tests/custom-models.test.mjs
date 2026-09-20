import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_MODELS_KEY, MAX_CUSTOM_MODEL_BYTES, normalizeCustomManifest, resolveCustomOverride, validateGLB } from '../P5 Programme/buddy-kit/client/city-common/custom-models.js';
import { CF_KEYS, collectState } from '../P5 Programme/buddy-kit/client/city-common/champion-file.js';

const glb = new Uint8Array(20); glb.set([0x67,0x6c,0x54,0x46]);
test('custom model validation accepts GLB magic and rejects unsafe files', () => {
  assert.equal(validateGLB(glb.buffer).ok, true);
  assert.equal(validateGLB(new ArrayBuffer(20)).ok, false);
  assert.equal(validateGLB(new ArrayBuffer(MAX_CUSTOM_MODEL_BYTES + 1)).ok, false);
});
test('manifest retains device-missing metadata but only resolves known overrides', () => {
  const manifest=normalizeCustomManifest({models:[{id:'owl',name:'My Owl'}],overrides:{school:'owl',hospital:'gone'}});
  assert.equal(resolveCustomOverride('school',manifest),'owl');
  assert.equal(resolveCustomOverride('hospital',manifest),null);
  assert.equal(manifest.models[0].name,'My Owl');
});
test('Champion File includes custom metadata key, never model bytes', () => {
  assert.equal(CF_KEYS.customModels,CUSTOM_MODELS_KEY);
  const storage={getItem:key=>key===CUSTOM_MODELS_KEY?JSON.stringify({models:[{id:'owl',name:'Owl'}],overrides:{}}):null};
  const state=collectState(storage);
  assert.match(state.customModels,/Owl/);
  assert.doesNotMatch(state.customModels,/ArrayBuffer|bytes/);
});
