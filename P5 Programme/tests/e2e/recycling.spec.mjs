// recycling.spec.mjs — Stage 4: the recycling station, in a real browser, on the
// REAL curated TrashNet features.
//
// Two laws the plan names, proven against actual image-model assets (mocks cannot
// stand in for the 1024-dim feature vectors):
//   1. the PREDICTION selects the bin — ground truth only scores;
//   2. changing the published model changes the observed sorting of the same batch.
// Plus the Workshop → City publish round-trip: the Workshop publishes a .cap v2
// image bundle into the project envelope, installs it on the sorter host, and the
// City runs that exact immutable revision.
import { test, expect } from '@playwright/test';
import { BIN_FOR_LABEL } from '../../buddy-kit/client/city-common/recycling.js';

async function bootCity(page) {
  await page.goto('/city-builder/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) => /example city|empty sample/i.test(b.textContent || ''));
    if (el) el.click();
  });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.waitForFunction(() => !!document.getElementById('loading')?.classList.contains('done'), null, { timeout: 60000 });
}

test('the station routes by PREDICTION and changing the model changes sorting', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootCity(page);

  // Train a sorter from the real curated photos and publish+install it (no Workshop round-trip).
  const trained = await page.evaluate(() => window.__recyclingStation.trainFromLibrary({ perClass: 12, threshold: 0.2 }));
  expect(trained.ok, JSON.stringify(trained)).toBe(true);

  // Open the station, then run a fixed-seed batch through the production path.
  await page.evaluate(() => window.__recyclingStation.open());
  await expect(page.locator('.recycle-modal')).toBeVisible();
  await expect(page.locator('.recycle-bin')).toHaveCount(7);

  const runA = await page.evaluate(() => window.__recyclingStation.controller.runBatch({ kind: 'normal', seed: 1 }));
  expect(runA.ok, JSON.stringify(runA)).toBe(true);
  expect(runA.results.length).toBeGreaterThan(0);

  // Law 1: every bin is exactly the bin its DECISION names (or the tray) — truth never routes.
  for (const r of runA.results) {
    expect(r.routedBy).toBe('prediction');
    if (r.abstained) expect(r.bin).toBe('human-check');
    else expect(r.bin).toBe(BIN_FOR_LABEL[r.decision]);
  }
  // The real features are genuinely loaded and the model genuinely decides.
  expect(runA.score.answered).toBeGreaterThan(0);

  // Law 2: a genuinely different published model changes the sorting of the SAME batch.
  const trainedB = await page.evaluate(() => window.__recyclingStation.trainFromLibrary({ perClass: 12, threshold: 0.2, labelShift: 1 }));
  expect(trainedB.ok, JSON.stringify(trainedB)).toBe(true);
  const runB = await page.evaluate(() => window.__recyclingStation.controller.runBatch({ kind: 'normal', seed: 1 }));

  const byId = (run) => Object.fromEntries(run.results.map((r) => [r.id, r]));
  const a = byId(runA); const b = byId(runB);
  expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort()); // same items, same seed
  const changed = runA.results.filter((r) => a[r.id].decision !== b[r.id].decision);
  expect(changed.length, 'a different model must change at least one decision').toBeGreaterThan(0);
  // …while the ground truth for each item is unchanged — only the model moved.
  expect(runA.results.every((r) => a[r.id].truth === b[r.id].truth)).toBe(true);

  expect(errors).toEqual([]);
});

test('the Workshop publishes an image model the City station then runs', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Open the Workshop straight into the City publish flow.
  await page.goto('/workshop/?publishTarget=city&hostInstanceId=host-e2e&returnTo=%2Fcity-builder%2F', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.WorkshopGame && window.WorkshopPublish), null, { timeout: 60000 });

  // Plant a photo model on the table (the exact artifact shape the Workshop stores),
  // then publish through the REAL bridge.
  const result = await page.evaluate(async () => {
    const axis = (i) => { const v = new Array(1024).fill(0); v[i] = 1; return v; };
    const model = {
      version: 1, id: 'trashnet-v1-knn-e2e', name: 'E2E sorter', dataset: 'trashnet-v1',
      preprocessing: 'mobilenet-v3-small-224-squash-f32-unit-v1', brain: 'knn', options: { k: 3, seed: 42 },
      input: { id: 'trashnet-v1', features: 'mobilenet-v3-small-224-squash-f32-unit-v1', dimension: 1024 },
      trainingIds: ['cardboard1', 'glass1'],
      state: { shelves: {
        cardboard: [{ id: 'library:cardboard1', label: 'cardboard', vec: axis(0) }],
        glass: [{ id: 'library:glass1', label: 'glass', vec: axis(1) }],
      } },
    };
    window.WorkshopGame.__setTableForTest({ pieces: [{ id: 's1', type: 'sense', senseId: 'cam', libraryModel: model }], wires: [] });
    return window.WorkshopPublish.publish();
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  expect(result.installed).toBe(true);
  expect(result.key).toContain('cap_trashnet-v1-knn');

  // The City resolves that exact installation and runs it.
  await page.goto('/city-builder/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__recyclingStation, null, { timeout: 60000 });
  await page.evaluate(() => window.__recyclingStation.open());
  const skill = await page.evaluate(() => {
    const s = window.__recyclingStation.controller?.skill;
    return s ? { kind: s.kind, installationId: s.installationId } : null;
  });
  expect(skill).toBeTruthy();
  expect(skill.kind).toBe('installation');
  expect(skill.installationId).toBe('host-e2e');

  expect(errors).toEqual([]);
});
