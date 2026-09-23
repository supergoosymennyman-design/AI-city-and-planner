// city-smoke.spec.mjs — boots the 3D city builder, asserts the boot completes,
// the champion loads, and NO model-loading warnings / 404s appear.
//
// Consolidates the old ad-hoc scripts: scripts/city-smoke.mjs + robot-check.mjs.
import { test, expect } from '@playwright/test';

const CRITICAL = /load failed|unknown library|No DRACOLoader|setMeshoptDecoder|Failed to fetch|404/i;

async function bootCity(page) {
  const warnings = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/Failed to load resource/i.test(t)) return; // duplicate of response events
    if (m.type() === 'error' || /fail|warn|unknown library|load/i.test(t)) warnings.push(`[${m.type()}] ${t.slice(0, 300)}`);
  });
  page.on('pageerror', (e) => warnings.push(`[pageerror] ${e.message.slice(0, 300)}`));
  // /api/* 404s are the buddy worker's routes — absent on the static test server by design.
  page.on('response', (r) => {
    if (r.status() >= 400 && !(r.status() === 404 && /\/api\//.test(r.url()))) warnings.push(`[http${r.status()}] ${r.url()}`);
  });

  await page.goto('/city-builder/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) => /example city|empty sample/i.test(b.textContent || ''));
    if (el) el.click();
  });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(12000); // let buildings/models load
  return warnings;
}

test('city-builder boots: loading done, scene, champion ring, zero critical warnings', async ({ page }) => {
  const warnings = await bootCity(page);

  // Poll for full readiness instead of a fixed sleep — pedestrians (citizens) + champion
  // ring initialize lazily and fixed waits race under parallel load.
  await page.waitForFunction(() => {
    const scene = window.__scene;
    if (!scene) return false;
    let rings = 0;
    scene.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.type === 'RingGeometry') rings++;
    });
    const peds = (window.__city && window.__city.citizens) ? window.__city.citizens.getCount() : -1;
    const loadingDone = document.getElementById('loading')?.classList.contains('done') ?? false;
    return loadingDone && rings > 0 && peds >= 0;
  }, null, { timeout: 60000 });

  const state = await page.evaluate(() => {
    const scene = window.__scene;
    let rings = 0;
    scene.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.type === 'RingGeometry') rings++;
    });
    return {
      loadingDone: document.getElementById('loading')?.classList.contains('done') ?? false,
      scene: !!scene,
      rings,
      peds: (window.__city && window.__city.citizens) ? window.__city.citizens.getCount() : -1,
    };
  });
  expect(state.loadingDone, 'boot did not complete (loading overlay)').toBe(true);
  expect(state.scene, 'no 3D scene').toBe(true);
  expect(state.rings, 'champion ring not found').toBeGreaterThan(0);
  expect(state.peds).toBeGreaterThanOrEqual(0);

  const bad = warnings.filter((w) => CRITICAL.test(w));
  expect(bad, `critical warnings:\n${bad.join('\n') || '(none)'}`).toEqual([]);
});

test('city-builder renders instanced meshes (citizen crowd uses instancing)', async ({ page }) => {
  const warnings = await bootCity(page);

  const info = await page.evaluate(() => {
    const scene = window.__scene;
    if (!scene) return { error: 'no scene' };
    let ims = 0;
    let peds = 'n/a';
    scene.traverse((o) => { if (o.isInstancedMesh) ims++; });
    if (window.__city && window.__city.citizens) peds = window.__city.citizens.getCount();
    return { ims, peds };
  });
  expect(info.error, 'scene missing').toBeUndefined();
  expect(info.ims, `expected instanced meshes, got ${JSON.stringify(info)}`).toBeGreaterThan(0);

  const bad = warnings.filter((w) => CRITICAL.test(w));
  expect(bad, `critical warnings:\n${bad.join('\n') || '(none)'}`).toEqual([]);
});
