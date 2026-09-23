import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const plannerHtml = read('P5 Programme/buddy-kit/client/city-planner/index.html');
const plannerJs = read('P5 Programme/buddy-kit/client/city-planner/planner.js');
const cityHtml = read('P5 Programme/buddy-kit/client/city-builder/index.html');
const cityJs = read('P5 Programme/buddy-kit/client/city-builder/city-builder.js');
const cityI18n = read('P5 Programme/buddy-kit/client/city-builder/i18n.js');

test('planner exposes the isolated 3D example route and flushes work first', () => {
  assert.match(plannerHtml, /id="btn-example"/);
  assert.match(plannerJs, /getElementById\('btn-example'\)[\s\S]*?flushAutosave\(\);[\s\S]*?\/city-builder\/\?example=1/);
});

test('city exposes example access at entry and in the running-city menu', () => {
  assert.match(cityHtml, /id="entry-example"/);
  assert.match(cityHtml, /id="more-example"/);
  assert.match(cityJs, /entry-example/);
  assert.match(cityJs, /more-example[\s\S]*?\/city-builder\/\?example=1/);
});

test('example session offers a localized, non-destructive return route', () => {
  assert.match(cityHtml, /id="example-session-banner"[^>]*hidden/);
  assert.match(cityJs, /validateLayout\(JSON\.parse\(raw\)\)\.ok/);
  assert.match(cityJs, /\/city-builder\/\?resume=1/);
  for (const key of ['entry.example', 'example.viewing', 'example.backCity', 'example.backPlanner']) {
    assert.equal(cityI18n.match(new RegExp(`['"]${key.replace('.', '\\.') }['"]`, 'g'))?.length, 2, `${key} is translated in both languages`);
  }
});
