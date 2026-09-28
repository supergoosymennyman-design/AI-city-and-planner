// full-journey.spec.mjs — the plan's Stage-6 exit condition, end to end:
// complete a challenge, customise, SAVE, and RESTORE ON A FRESH BROWSER.
//
// This is the one combined run the per-feature specs do not make: it earns
// through the real recycling path, customises through the shared wallet, exports
// the project, then restores it in a SECOND browser context with empty storage
// and proves the wallet, ownership, badge and earned statue all came back.
//
// The driving challenge's journey is covered by test-track.spec.mjs (the same
// publish → install → run → observe contract in the second environment).
import { test, expect } from '@playwright/test';

import {capabilities,boot as bootCity,publish,run as runActivity} from './activity-helpers.mjs';

test('fresh-browser journey: earn, build, customise, save, restore', async ({ browser }) => {
  // ── Browser A: a student who does the work ────────────────────────────────
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const errorsA = [];
  pageA.on('pageerror', (e) => errorsA.push(e.message));
  await bootCity(pageA);
  await publish(pageA,capabilities());
  const run=await runActivity(pageA,'recycling');
  expect(run.results.length).toBe(9);

  // Customise: buy AND equip an accessory off the earned credits.
  const saved = await pageA.evaluate(async () => {
    const store = (await import('/city-common/project-store.js')).createProjectStore();
    await store.openActiveProject();
    const { MARKET_CATALOGUE } = await import('/city-common/market-catalogue.js');
    const bought = await store.purchase('acc-visor', 'journey-buy-1', MARKET_CATALOGUE);
    await store.equipItem('acc-visor', true);
    const eco = await store.readEconomy();
    const ach = await store.readAchievements();
    const exported = await store.exportProject();
    return {
      purchased: bought.purchased,
      balance: eco.balance,
      owned: eco.owned,
      tier: ach.badges?.tier || null,
      earnedStatues: ach.statues.filter((s) => s.earned).map((s) => s.id),
      archive: exported.ok ? exported.archive : null,
    };
  });

  expect(saved.purchased).toBe(true);
  expect(saved.owned).toContain('acc-visor');
  // 30 (held-out eval) + 40 (city install) earned, 20 spent on the visor.
  expect(saved.balance).toBe(50);
  expect(saved.tier, 'the work must have promoted a badge').toBeTruthy();
  expect(saved.earnedStatues).toContain('recycler');
  expect(saved.archive).toBeTruthy();
  await ctxA.close();

  // ── Browser B: a FRESH browser, empty storage — restore the saved project ──
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  const errorsB = [];
  pageB.on('pageerror', (e) => errorsB.push(e.message));
  await pageB.goto('/project-hub/');

  const restored = await pageB.evaluate(async (archive) => {
    const store = (await import('/city-common/project-store.js')).createProjectStore();
    await store.openActiveProject();
    const result = await store.importProject(archive);
    if (!result.ok) return { ok: false, error: result.error };
    const eco = await store.readEconomy();
    const ach = await store.readAchievements();
    return { ok: true, balance: eco.balance, owned: eco.owned, tier: ach.badges?.tier || null, earnedStatues: ach.statues.filter((s) => s.earned).map((s) => s.id) };
  }, saved.archive);

  expect(restored.ok, JSON.stringify(restored)).toBe(true);
  // Everything the student earned and bought survived a fresh browser.
  expect(restored.balance).toBe(saved.balance);
  expect(restored.owned).toContain('acc-visor');
  expect(restored.tier).toBe(saved.tier);
  expect(restored.earnedStatues).toContain('recycler');

  expect(errorsA).toEqual([]);
  expect(errorsB).toEqual([]);
  await ctxB.close();
});
