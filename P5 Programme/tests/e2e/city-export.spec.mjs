import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const names = ['four-legged','six-legged','legless-rig','unrigged'];
const fixture = name => readFileSync(new URL(`../../docs/workshop-studio-demo/city-export-fixtures/${name}-champion.glb`, import.meta.url));

test('City runtime keeps each exported movement mode, scale and grounding through model swaps', async ({ page }) => {
  for (const name of names) await page.route(`**/fixture-${name}.glb`, route => route.fulfill({ contentType: 'model/gltf-binary', body: fixture(name) }));
  await page.route('**/fixture-legacy-v1.glb', route => route.fulfill({ contentType: 'model/gltf-binary', body: readFileSync(new URL('../../docs/workshop-studio-demo/city-export-fixtures/legacy-v1-champion.glb', import.meta.url)) }));
  await page.route('**/city-export-runtime-test', route => route.fulfill({ contentType: 'text/html', body: '<script type="importmap">{"imports":{"three":"/vendor/three/three.module.js","three/addons/":"/vendor/three/addons/"}}</script>' }));
  await page.goto('/city-export-runtime-test');
  await page.evaluate(async () => {
    const THREE = await import('three');
    const { createChampion } = await import('/hong-kong-real/champion-real.js');
    window.champion = await createChampion('/champion-city/assets/', { spawnWorld: new THREE.Vector3(), groundHeightAt: () => 0 }, { initialSkin: '/fixture-four-legged.glb', initialSkinId: 'custom', targetHeight: 1.8 });
  });
  for (const name of names) {
    if (name !== names[0]) expect(await page.evaluate(name => champion.swapSkin(`/fixture-${name}.glb`, 'custom'), name)).toBe(true);
    const result = await page.evaluate(() => {
      const c = champion;
      c.settleGrounding();
      c.update(.016, {});
      const idle = { mode: c.state.mode, y: c.group.position.y, gap: c.groundDebug.gap };
      for (let i = 0; i < 20; i++) c.update(.016, { z: 1 });
      const walk = { mode: c.state.mode, z: c.state.pos.z, facing: c.state.facing };
      for (let i = 0; i < 20; i++) c.update(.016, { z: 1, running: true });
      const run = { mode: c.state.mode, z: c.state.pos.z };
      c.update(.016, { jump: true });
      c.update(.016, {});
      return { mode: c.animationInfo().animationMode, height: c.worldHeight(), idle, walk, run, jumpY: c.state.y, airborne: !c.state.isGrounded };
    });
    expect(result.mode, name).toBe(name === 'unrigged' ? 'static' : 'studio');
    expect(result.height, name).toBeCloseTo(1.8, 1);
    expect(result.idle.mode, name).toBe('idle');
    expect(result.walk.mode, name).toBe('walk');
    expect(result.run.mode, name).toBe('run');
    expect(result.run.z, name).toBeGreaterThan(result.walk.z);
    expect(Number.isFinite(result.idle.y), name).toBe(true);
    expect(Math.abs(result.idle.gap), name).toBeLessThan(0.2);
    expect(result.airborne, name).toBe(true);
    expect(result.jumpY, name).toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => champion.swapSkin('/fixture-legacy-v1.glb', 'custom'))).toBe(true);
  expect(await page.evaluate(() => champion.animationInfo().formatVersion)).toBe(1);
});

test('City entry keeps the exported unrigged Champion and its metadata after reload', async ({ page }, testInfo) => {
  await page.goto('/city-builder/');
  await page.locator('#skin-input').setInputFiles({ name: 'unrigged-champion.glb', mimeType: 'model/gltf-binary', buffer: fixture('unrigged') });
  await expect(page.locator('#skin-status')).toContainText('unrigged-champion.glb');
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => window.__city?.champion && document.querySelector('#loading.done'));
  expect(await page.evaluate(() => window.__city.champion.animationInfo().animationMode)).toBe('static');
  await page.screenshot({ path: testInfo.outputPath('unrigged-city-champion.png') });
  await page.reload();
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => window.__city?.champion && document.querySelector('#loading.done'));
  const restored = await page.evaluate(async () => {
    const { loadCustomSkinBlob, loadCustomSkinMetadata } = await import('/champion-city/custom-skin.js');
    const [blob, metadata] = await Promise.all([loadCustomSkinBlob(), loadCustomSkinMetadata()]);
    return { size: blob?.size, metadata, runtime: window.__city.champion.animationInfo() };
  });
  expect(restored.size).toBe(fixture('unrigged').length);
  expect(restored.metadata.animationMode).toBe('static');
  expect(restored.runtime.animationMode).toBe('static');
});
