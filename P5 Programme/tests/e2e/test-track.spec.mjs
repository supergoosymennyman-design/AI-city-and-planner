// test-track.spec.mjs — Stage 5: the driving skill, in a real browser, through the
// real Workshop → City publish bridge.
//
// Laws the plan names:
//   1. The MODEL's action controls movement — the car is not driven by a hidden script.
//   2. Changing the published model changes the vehicle's actions on the SAME track.
//   3. Honest stops/collisions are visible: a trial that does not finish leaves an
//      intervention behind.
import { test, expect } from '@playwright/test';
import { DRIVE_ACTIONS } from '../../buddy-kit/client/city-common/driving.js';

const CITY = '/city-builder/';

async function bootCity(page) {
  await page.goto(CITY, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  // Load the bundled example city — its sample layout has real roads, so the
  // "try in my city" route can be found without the child having to build first.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) => /example city|empty sample/i.test(b.textContent || ''));
    if (el) el.click();
  });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done') === true, null, { timeout: 60000 });
}

async function publishDriveModel(page, { hostId, relabel = false }) {
  const url = `/workshop/?publishTarget=city&hostInstanceId=${encodeURIComponent(hostId)}&returnTo=${encodeURIComponent(CITY)}&skill=drive`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.WorkshopGame && window.WorkshopPublish), null, { timeout: 60000 });
  // Let the City's drive deep link finish loading the starter, then replace the
  // table with the deterministic trained one.
  await page.waitForTimeout(700);
  return page.evaluate(({ relabel }) => {
    const game = window.WorkshopGame;
    const table = game.buildDriveTable({ seed: 42 });
    if (relabel) {
      // A genuinely different trained state: the "forward" examples become "slow".
      const model = table.pieces.find((p) => p.id === 'dv_model');
      const brain = model.learning.num.brain;
      const fwd = brain.shelves.forward || [];
      delete brain.shelves.forward;
      brain.shelves.slow = [...(brain.shelves.slow || []), ...fwd];
    }
    game.__setTableForTest(table);
    return window.WorkshopPublish.publish();
  }, { relabel });
}

async function openTrack(page) {
  await page.goto(CITY, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__testTrack, null, { timeout: 60000 });
  const info = await page.evaluate(async () => {
    const c = await window.__testTrack.open();
    return { kind: c.skill ? c.skill.kind : null, installationId: c.skill ? c.skill.installationId : null, mismatch: c.mismatch };
  });
  return info;
}

test('the Workshop publishes a driving model the City test car then drives', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const result = await publishDriveModel(page, { hostId: 'host-driver-e2e' });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  expect(result.installed).toBe(true);
  expect(result.key).toContain('cap_drive-knn');

  const info = await openTrack(page);
  expect(info.kind).toBe('installation');
  expect(info.installationId).toBe('host-driver-e2e');
  expect(info.mismatch).toBe(false);

  const runA = await page.evaluate(() => window.__testTrack.controller.runWhole({ trackId: 'full' }));
  expect(runA.ok, JSON.stringify(runA)).toBe(true);
  expect(runA.decisions.length).toBeGreaterThan(20);
  // The MODEL chose every action; nothing else drives.
  for (const d of runA.decisions) expect(DRIVE_ACTIONS.includes(d.action), JSON.stringify(d)).toBe(true);
  expect(runA.progress).toBeGreaterThan(20);
  // No hidden successful driver: a run that did not finish left an intervention.
  if (!runA.goalReached) expect(runA.interventions.length, JSON.stringify(runA)).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('changing the published model changes the vehicle actions on the same track', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const a = await publishDriveModel(page, { hostId: 'host-driver-e2e-2' });
  expect(a.ok, JSON.stringify(a)).toBe(true);
  await openTrack(page);
  const runA = await page.evaluate(() => window.__testTrack.controller.runWhole({ trackId: 'full' }));
  expect(runA.ok, JSON.stringify(runA)).toBe(true);

  const b = await publishDriveModel(page, { hostId: 'host-driver-e2e-2', relabel: true });
  expect(b.ok, JSON.stringify(b)).toBe(true);
  await openTrack(page);
  const runB = await page.evaluate(() => window.__testTrack.controller.runWhole({ trackId: 'full' }));
  expect(runB.ok, JSON.stringify(runB)).toBe(true);

  const seqA = runA.decisions.map((d) => d.action);
  const seqB = runB.decisions.map((d) => d.action);
  expect(seqA.length).toBeGreaterThan(0);
  expect(seqB.length).toBeGreaterThan(0);
  // Same track, same observations, a different model → a different drive.
  const changed = Math.min(seqA.length, seqB.length);
  let diffs = 0;
  for (let i = 0; i < changed; i++) if (seqA[i] !== seqB[i]) diffs++;
  expect(diffs, `A=${seqA.slice(0, 20).join(',')} B=${seqB.slice(0, 20).join(',')}`).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('the test track refuses to run without a driving model and offers the Workshop', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openTrack(page);
  const noModel = await page.evaluate(async () => {
    const c = window.__testTrack.controller;
    return { hasSkill: !!c.skill, run: await c.runWhole({ trackId: 'full' }) };
  });
  if (!noModel.hasSkill) {
    expect(noModel.run.ok).toBe(false);
    expect(noModel.run.error).toBe('no-model');
  }
  await expect(page.locator('.tt-improve')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the same model also drives the bounded route on the child’s own roads', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Publish a real driving model, then load the example city (both share the origin).
  const pub = await publishDriveModel(page, { hostId: 'host-driver-city' });
  expect(pub.ok, JSON.stringify(pub)).toBe(true);
  await bootCity(page);
  await page.waitForFunction(() => !!window.__testTrack, null, { timeout: 60000 });

  const run = await page.evaluate(async () => {
    await window.__testTrack.open();
    const c = window.__testTrack.controller;
    c.reset('city');
    const routeOk = !!(c.cityRouteNote && c.cityRouteNote.ok);
    const result = await c.runWhole({ trackId: 'city', maxSteps: 400 });
    return { routeOk, result };
  });
  expect(run.routeOk).toBe(true);
  expect(run.result.ok, JSON.stringify(run.result)).toBe(true);
  expect(run.result.decisions.length).toBeGreaterThan(5);
  for (const d of run.result.decisions) expect(DRIVE_ACTIONS.includes(d.action), JSON.stringify(d)).toBe(true);
  expect(run.result.progress).toBeGreaterThan(5);
  // Honest end states only — never an unrecorded "success".
  expect(['goal', 'collision', 'off-road', 'emergency-stop', 'timeout']).toContain(run.result.outcome);
  expect(errors).toEqual([]);
});

test('the Workshop drive starter loads, and an UNTRAINED model publishes nothing (no fake success)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/workshop/?publishTarget=city&skill=drive', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.WorkshopGame, null, { timeout: 60000 });
  await page.waitForTimeout(700);
  const res = await page.evaluate(() => {
    const game = window.WorkshopGame;
    const loaded = game.loadGalleryMachine('drive-v1');
    const untrained = game.buildDriveTable({ seed: 42, train: false });
    const before = game.publishDriveModel('dv_model', untrained);
    const trained = game.buildDriveTable({ seed: 42, train: true });
    const after = game.publishDriveModel('dv_model', trained);
    return { loaded, before: !!before, after: after ? after.examples.length : 0 };
  });
  expect(res.loaded).toBe(true);
  expect(res.before).toBe(false);
  expect(res.after).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

test('the City capability panel opens the track, and "try in my city" finds a route in the real layout', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootCity(page);
  await page.locator('#city-more summary').click();
  await expect(page.locator('#cap-btn')).toBeVisible({ timeout: 15000 });
  await page.locator('#cap-btn').click();
  await expect(page.locator('#cap-drive-btn')).toBeVisible();
  await page.locator('#cap-drive-btn').click();
  await expect(page.locator('.tt-modal')).toBeVisible();
  await expect(page.locator('.tt-canvas')).toBeVisible();

  // "Try in my city" reads the child's road READ-ONLY and finds a bounded route.
  await page.locator('.tt-controls select').selectOption('city');
  const route = await page.evaluate(() => {
    const note = window.__testTrack.controller.cityRouteNote;
    return { ok: !!(note && note.ok), hasTrack: !!window.__testTrack.controller.track };
  });
  expect(route.ok, JSON.stringify(route)).toBe(true);
  expect(route.hasTrack).toBe(true);
  expect(errors).toEqual([]);
});

test('the dead-sensor control stops the car honestly (missing input), never a hidden driver', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootCity(page);
  await publishDriveModel(page, { hostId: 'host-dead' });
  await openTrack(page);

  // Turn the sensor off from the UI, then run the whole trial.
  await page.click('.tt-dead');
  await expect(page.locator('.tt-dead')).toHaveAttribute('aria-pressed', 'true');
  const trial = await page.evaluate(async () => {
    const res = await window.__testTrack.controller.runWhole({});
    return { outcome: res.outcome, interventions: (res.interventions || []).map((i) => i.type) };
  });
  expect(trial.outcome).toBe('missing-input');
  expect(trial.interventions).toContain('missing-input');

  // Turning it back on restores a real drive (a fresh trial no longer stops on input).
  await page.click('.tt-dead');
  await expect(page.locator('.tt-dead')).toHaveAttribute('aria-pressed', 'false');
  const back = await page.evaluate(async () => (await window.__testTrack.controller.runWhole({})).outcome);
  expect(back).not.toBe('missing-input');
  expect(errors).toEqual([]);
});
