// Regression coverage for the Champion Hub's 3D-only header artwork.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

test('Champion Hub never ships or reveals a 2D fallback image', () => {
  const html = read('P5 Programme/buddy-kit/client/home/index.html');
  const css = read('P5 Programme/buddy-kit/client/home/home.css');
  const script = read('P5 Programme/buddy-kit/client/home/champion.js');
  const build = read('P5 Programme/deploy/scripts/deploy-city-apps.sh');

  assert.doesNotMatch(html, /champion-illustration|champion-fallback/i);
  assert.match(html, /<div class="hub-champion"[^>]*><\/div>/);
  assert.doesNotMatch(script, /querySelector\(['"]img|using illustration/i);
  assert.doesNotMatch(build, /cp .*champion-illustration\.svg/);
  assert.match(css, /\.hub-champion canvas\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.hub-champion\.has3d canvas\s*\{\s*display:\s*block/s);
  assert.match(script, /renderer\.render\(scene, camera\);\s*host\.classList\.add\('has3d'\)/s);
});
