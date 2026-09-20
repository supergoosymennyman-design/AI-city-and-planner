import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CITY_LOOKS, validCityLook } from '../P5 Programme/buddy-kit/client/city-builder/city-looks.js';
import { GROUND_TEXTURES, validGroundTexture } from '../P5 Programme/buddy-kit/client/city-builder/ground-textures.js';
import { CF_KEYS, collectState, writeState } from '../P5 Programme/buddy-kit/client/city-common/champion-file.js';

test('City Look gallery has a stable toy fallback and eight realistic alternatives', () => {
  assert.equal(validCityLook('missing-look'), 'toy-town');
  assert.equal(validCityLook('golden'), 'golden');
  assert.equal(validCityLook('azure'), 'azure');
  assert.equal(validCityLook('bluebird'), 'bluebird');
  assert.equal(Object.keys(CITY_LOOKS).length, 9);
  assert.equal(Object.values(CITY_LOOKS).filter(look => look.realistic).length, 8);
});

test('City Look travels in the Champion File state', () => {
  const data = new Map([[CF_KEYS.cityLook, 'moonlit']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const state = collectState(storage);
  assert.equal(state.cityLook, 'moonlit');
  const restored = new Map();
  writeState(state, { setItem: (key, value) => restored.set(key, value) });
  assert.equal(restored.get(CF_KEYS.cityLook), 'moonlit');
});

test('City Look controls use the loaded presentation stylesheet and do not cover the minimap', () => {
  const presentation = readFileSync(new URL('../P5 Programme/buddy-kit/client/city-builder/presentation.css', import.meta.url), 'utf8');
  assert.match(presentation, /\.city-look\{position:fixed;top:66px;left:16px/);
  assert.match(presentation, /\.city-look-panel\{position:fixed;[^}]*left:16px/);
});

test('realistic City Look options reuse shipped 4K desktop and 2K tablet panorama derivatives', () => {
  const manifest = JSON.parse(readFileSync(new URL('../P5 Programme/buddy-kit/client/city-builder/assets/environment-manifest.json', import.meta.url), 'utf8'));
  const skies = manifest.assets.find(asset => asset.id === 'city-look-sky-previews').processed;
  const desktop = skies.filter(asset => asset.role === 'equirectangular-background-desktop');
  const tablet = skies.filter(asset => asset.role === 'equirectangular-background-tablet');
  assert.equal(desktop.length, 6); assert.equal(tablet.length, 6);
  for (const sky of desktop) assert.deepEqual([sky.width, sky.height], [4096, 2048]);
  for (const sky of tablet) assert.deepEqual([sky.width, sky.height], [2048, 1024]);
});

test('ground texture choice has five CC0 PBR options and survives a Champion File', () => {
  assert.equal(validGroundTexture('missing'), 'leafy');
  assert.deepEqual(Object.keys(GROUND_TEXTURES), ['leafy', 'sparse', 'withered', 'pavers', 'asphalt']);
  assert.deepEqual(GROUND_TEXTURES.pavers.files, ['gravel_floor_03_diff_1k.jpg', 'gravel_floor_03_nor_gl_1k.jpg', 'gravel_floor_03_rough_1k.jpg']);
  assert.deepEqual(GROUND_TEXTURES.asphalt.files, ['ground-asphalt.jpg', 'aerial_asphalt_01_nor_gl_1k.jpg', 'aerial_asphalt_01_rough_1k.jpg']);
  for (const id of Object.keys(GROUND_TEXTURES)) {
    assert.equal(validGroundTexture(id), id);
    assert.equal(GROUND_TEXTURES[id].files.length, 3);
  }
  const state = collectState({ getItem: key => key === CF_KEYS.groundTexture ? 'asphalt' : null });
  assert.equal(state.groundTexture, 'asphalt');
  const restored = new Map(); writeState(state, { setItem: (key, value) => restored.set(key, value) });
  assert.equal(restored.get(CF_KEYS.groundTexture), 'asphalt');
});

test('realistic terrain uses the selected triplet while parks keep Leafy Grass', () => {
  const source = readFileSync(new URL('../P5 Programme/buddy-kit/client/city-builder/city-builder.js', import.meta.url), 'utf8');
  assert.match(source, /const terrainChoice = GROUND_TEXTURES\[_groundTexture\]/);
  assert.match(source, /const parkChoice = GROUND_TEXTURES\.leafy/);
  assert.match(source, /const albedo = park \? parkAlbedo : terrainAlbedo/);
  assert.match(source, /const normal = park \? parkNormal : terrainNormal/);
  assert.match(source, /const roughness = park \? parkRoughness : terrainRoughness/);
  assert.match(source, /Toy Town is intentionally map-free for both open terrain and park lawns/);
});

test('city samples panorama JPEGs directly on the sky dome instead of scene.background cubemaps', () => {
  const source = readFileSync(new URL('../P5 Programme/buddy-kit/client/city-builder/city-builder.js', import.meta.url), 'utf8');
  assert.match(source, /uniform sampler2D equirectMap/);
  assert.match(source, /skyDesktopFile/);
  assert.match(source, /duskSky\.material\.uniforms\.equirectMap\.value = texture/);
  assert.match(source, /equirectHorizonBlend/);
  assert.match(source, /smoothstep\(equirectHorizonBlend\.x,equirectHorizonBlend\.y,d\.y\)/);
  assert.match(source, /useEquirect\*skyOnly/);
  assert.doesNotMatch(source, /scene\.background = texture/);
});
