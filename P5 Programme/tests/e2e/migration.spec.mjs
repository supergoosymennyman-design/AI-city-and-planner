// migration.spec.mjs — an envelope written by an OLDER build (no `challenges`,
// no `projects.badges`, a legacy economy with no claimed/evidence books, no
// capabilities/installations) must upgrade in place and still earn.
//
// This is the "a couple of lessons later" case: a serialized project survives
// across releases, so `normalizeProject` has to heal it before any code reads it.
import { test, expect } from '@playwright/test';

test('an older serialized envelope upgrades and can still earn', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Reach the origin, then write the OLD envelope straight into IndexedDB.
  await page.goto('/market/', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const legacy = {
      kind: 'passiona-project', version: 1,
      id: 'legacy-envelope-seed', name: 'Older City',
      createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', revision: 4,
      champion: {},
      // No projects.badges, no capabilities, no installations, no challenges.
      projects: { city: { legacyState: { version: 2, buildings: [{ id: 'b1' }, { id: 'b2' }] } } },
      // The pre-Stage-6 economy: no claimed/evidence books.
      economy: { version: 1, balance: 20, owned: ['hat'], transactions: [] },
    };
    await new Promise((resolve) => {
      const req = indexedDB.open('passiona-projects-v1', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const d = req.result;
        const tx = d.transaction('projects', 'readwrite');
        tx.objectStore('projects').put(legacy);
        tx.oncomplete = () => { d.close(); resolve(); };
        tx.onerror = () => { d.close(); resolve(); };
      };
      req.onerror = () => resolve();
    });
    localStorage.setItem('passiona_active_project_v1', 'legacy-envelope-seed');
  });

  // Boot the City on the old envelope: it must not throw while healing it.
  await page.goto('/city-builder/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) => /example city|empty sample/i.test(b.textContent || ''));
    if (el) el.click();
  });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(4000);

  // The store heals the old shape and can still read every book.
  const healed = await page.evaluate(async () => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const store = createProjectStore();
    const project = await store.openActiveProject();
    const economy = await store.readEconomy();
    const challenges = await store.readChallenges();
    const achievements = await store.readAchievements();
    return {
      revision: project.revision,
      balance: economy.balance,
      claimedIsArray: Array.isArray(economy.claimed),
      evidenceIsObject: !!economy.evidence && typeof economy.evidence === 'object',
      challengesVersion: challenges?.version,
      challengesRuns: !!challenges?.runs && typeof challenges.runs === 'object',
      statuesIsArray: Array.isArray(achievements?.statues),
      cityBuildings: (await store.readSection('city'))?.legacyState?.buildings?.length,
    };
  });
  expect(healed.balance).toBe(20);
  expect(healed.claimedIsArray).toBe(true);
  expect(healed.evidenceIsObject).toBe(true);
  expect(healed.challengesVersion).toBe(1);
  expect(healed.challengesRuns).toBe(true);
  expect(healed.statuesIsArray).toBe(true);
  expect(healed.cityBuildings).toBe(2);

  // Earning still works after the upgrade: publish + install + a held-out run.
  const earned = await page.evaluate(async () => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const { buildDriveCapability } = await import('/city-common/capability-export.js');
    const store = createProjectStore();
    await store.openActiveProject();
    const cap = buildDriveCapability({
      id: 'cap_drive-knn', name: 'Drive', k: 1, threshold: 0.5,
      examples: [{ label: 'forward', values: [9, 9, 9, 0, 0, 6, 0, 0] }, { label: 'stop', values: [1, 1, 1, 0, 0, 0, 0, 0] }],
    }).capability;
    await store.publishSkill(cap);
    await store.installSkill('cap_drive-knn@1', 'host-car', { hostType: 'driver' });
    const out = await store.recordChallengeOutcome('driver',
      { revision: 1, scenario: { kind: 'track', seed: 'full' }, gradedIds: ['goal'], wrongIds: [] },
      [{ type: 'held-out-eval', evidence: { trackId: 'full' } }, { type: 'city-install', evidence: { installationId: 'made-up' } }]);
    const economy = await store.readEconomy();
    const achievements = await store.readAchievements();
    return { claimed: out.claimed.map((c) => c.type).sort(), balance: economy.balance, badgeTier: achievements?.badges?.tier };
  });
  expect(earned.claimed).toEqual(['city-install', 'held-out-eval']);
  expect(earned.balance).toBe(20 + 30 + 40);
  expect(earned.badgeTier).toBe('skeptic');

  expect(errors).toEqual([]);
});
