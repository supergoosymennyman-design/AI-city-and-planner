import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CITY_LOOKS, DEFAULT_CITY_LOOK, readCityLook, validCityLook, legacyTimeForLook } from '../P5 Programme/buddy-kit/client/city-builder/city-looks.js';
import { DAY_SKIES, DEFAULT_DAY_SKY, readDaySky, validDaySky } from '../P5 Programme/buddy-kit/client/city-builder/day-skies.js';
import { GROUND_TEXTURES, validGroundTexture } from '../P5 Programme/buddy-kit/client/city-builder/ground-textures.js';
import { EXAMPLE_APPEARANCE, applyExampleAppearance } from '../P5 Programme/buddy-kit/client/city-builder/example-appearance.js';
import { CF_KEYS, collectState, writeState } from '../P5 Programme/buddy-kit/client/city-common/champion-file.js';

test('example appearance overwrites all four existing preferences', () => {
  const data = new Map([
    ['p5_city_look_v1', 'future'], ['p5_city_day_sky_v1', 'calm-overcast'],
    ['p5_city_ground_texture_v1', 'withered'], ['p5_city_time_v1', 'night'],
  ]);
  const writes = [];
  const storage = { setItem(key, value) { writes.push([key, value]); data.set(key, value); } };
  assert.equal(applyExampleAppearance(storage), true);
  assert.deepEqual(EXAMPLE_APPEARANCE, {
    cityLook: 'natural', daySky: 'natural-blue', groundTexture: 'asphalt', timeOfDay: 'sunset',
  });
  assert.deepEqual(writes, [
    ['p5_city_look_v1', 'natural'], ['p5_city_day_sky_v1', 'natural-blue'],
    ['p5_city_ground_texture_v1', 'asphalt'], ['p5_city_time_v1', 'sunset'],
  ]);
});

test('City Style has four distinct worlds and maps legacy sky choices safely', () => {
  assert.equal(DEFAULT_CITY_LOOK, 'natural');
  assert.equal(validCityLook('missing-look'), 'natural');
  assert.equal(readCityLook({ getItem: () => null }), 'natural');
  assert.deepEqual(Object.keys(CITY_LOOKS), ['natural', 'toy-town', 'storybook', 'future']);
  assert.equal(validCityLook('golden'), 'natural');
  assert.equal(validCityLook('moonlit'), 'natural');
  assert.equal(legacyTimeForLook('golden'), 'sunset');
  assert.equal(legacyTimeForLook('moonlit'), 'night');
});

test('City Look travels in the Champion File state', () => {
  const data = new Map([[CF_KEYS.cityLook, 'future'], [CF_KEYS.daySky, 'bright-clouds'], [CF_KEYS.timeOfDay, 'night']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const state = collectState(storage);
  assert.equal(state.cityLook, 'future');
  assert.equal(state.daySky, 'bright-clouds');
  assert.equal(state.timeOfDay, 'night');
  const restored = new Map();
  writeState(state, { setItem: (key, value) => restored.set(key, value) });
  assert.equal(restored.get(CF_KEYS.cityLook), 'future');
  assert.equal(restored.get(CF_KEYS.daySky), 'bright-clouds');
  assert.equal(restored.get(CF_KEYS.timeOfDay), 'night');
});

test('Natural City keeps its current day sky and offers three sharp alternatives', () => {
  assert.equal(DEFAULT_DAY_SKY, 'natural-blue');
  assert.equal(readDaySky({ getItem: () => null }), 'natural-blue');
  assert.equal(validDaySky('missing'), 'natural-blue');
  assert.deepEqual(Object.keys(DAY_SKIES), ['natural-blue', 'clear-blue', 'bright-clouds', 'calm-overcast']);
  assert.equal(DAY_SKIES['natural-blue'].desktopSkyFile, 'assets/environment/kloppenheim-03-sky-4k.jpg');
  assert.equal(DAY_SKIES['clear-blue'].desktopSkyFile, 'assets/environment/qwantani-clear-sky-4k.jpg');
});

test('one Appearance control groups style, ground and time away from the minimap', () => {
  const presentation = readFileSync(new URL('../P5 Programme/buddy-kit/client/city-builder/presentation.css', import.meta.url), 'utf8');
  assert.match(presentation, /\.appearance-toggle\{position:fixed;top:66px;left:16px/);
  assert.match(presentation, /\.appearance-panel\{position:fixed;[^}]*left:16px/);
});

test('realistic City Look options reuse shipped 4K desktop and 2K tablet panorama derivatives', () => {
  const manifest = JSON.parse(readFileSync(new URL('../P5 Programme/buddy-kit/client/city-builder/assets/environment-manifest.json', import.meta.url), 'utf8'));
  const skies = manifest.assets.find(asset => asset.id === 'city-look-sky-previews').processed;
  const desktop = skies.filter(asset => asset.role === 'equirectangular-background-desktop');
  const tablet = skies.filter(asset => asset.role === 'equirectangular-background-tablet');
  assert.equal(desktop.length, 7); assert.equal(tablet.length, 7);
  for (const sky of desktop) assert.deepEqual([sky.width, sky.height], [4096, 2048]);
  for (const sky of tablet) assert.deepEqual([sky.width, sky.height], [2048, 1024]);
  const source = manifest.assets.find(asset => asset.id === 'city-look-sky-previews').sourceUrls;
  assert.ok(source.includes('https://polyhaven.com/a/qwantani_puresky'));
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

test('Natural City samples time-matched panorama JPEGs directly on the sky dome', () => {
  const source = readFileSync(new URL('../P5 Programme/buddy-kit/client/city-builder/city-builder.js', import.meta.url), 'utf8');
  assert.match(source, /uniform sampler2D equirectMap/);
  assert.match(source, /desktopSkies\?\.\[time\]/);
  assert.match(source, /duskSky\.material\.uniforms\.equirectMap\.value = texture/);
  assert.match(source, /equirectHorizonBlend/);
  assert.match(source, /smoothstep\(equirectHorizonBlend\.x,equirectHorizonBlend\.y,d\.y\)/);
  assert.match(source, /useEquirect\*skyOnly/);
  assert.doesNotMatch(source, /scene\.background = texture/);
});
