// Guards the two places a child can provide their fitted Champion GLB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../P5 Programme/buddy-kit/client/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('custom Champion upload remains available before starting a city', () => {
  const entry = read('city-builder/index.html');
  const focusedCss = read('city-builder/my-work.css');
  assert.match(entry, /id="entry-skin"[\s\S]*for="skin-input"/);
  assert.match(entry, /id="skin-input"[^>]*accept="\.glb,model\/gltf-binary"/);
  assert.doesNotMatch(focusedCss, /#entry-skin[^\n]*display\s*:\s*none/);
});

test('in-city wardrobe can upload or replace a fitted Champion', () => {
  const skins = read('champion-city/skins.js');
  const city = read('city-builder/city-builder.js');
  assert.match(skins, /opts\.onUploadCustom/);
  assert.match(skins, /skins\.uploadCustom/);
  assert.match(city, /onUploadCustom:\s*async \(file\)/);
  assert.match(city, /importCustomChampion\(file\)/);
});
