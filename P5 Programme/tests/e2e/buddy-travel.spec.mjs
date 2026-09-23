import { test, expect } from '@playwright/test';

test('Buddy travel proposals and named reply buttons use one-based building numbers', async ({ page }) => {
  // A light same-origin page lets the real city Buddy module run without booting WebGL.
  await page.goto('/city-builder/buddy-travel-test-page');
  const result = await page.evaluate(async () => {
    const { mountCityBuddy } = await import('/city-builder/buddy.js');
    const buildings = [
      { type: 'school', pos: [10, 20] },
      { type: 'hospital', pos: [30, 40] },
    ];
    const moved = [];
    const sim = {
      walkSpeed: 5,
      walkTo(building) { moved.push(['walk', buildings.indexOf(building)]); return true; },
      flyTo(building) { moved.push(['fly', buildings.indexOf(building)]); return true; },
    };
    let opts;
    window.BuddyBoot = { mount(options) { opts = options; return Promise.resolve({ close() {} }); } };
    mountCityBuddy({}, { state: { pos: { x: 0, z: 0 } } }, sim,
      { buildings, roads: [], parks: [] });

    const fly = (value) => opts.apply({ op: 'setParam', name: 'flyTo', value });
    const walk = (value) => opts.apply({ op: 'setParam', name: 'walkTo', value });
    const valid = [fly(1), walk(2)];
    const movedAfterValid = moved.slice();
    const invalid = [0, 1.5, 3, '1'].flatMap((value) => [fly(value), walk(value)]);
    const movedAfterInvalid = moved.slice();

    const action = { op: 'setParam', name: 'flyTo', value: 1 };
    const card = opts.actionLabel(action, 'default label');
    const bubble = document.createElement('div');
    opts.onReply('Let us visit the School.', bubble, 'Can we fly to School?');
    const buttons = [...bubble.querySelectorAll('button')];
    const labels = buttons.map((button) => button.textContent);
    buttons[0].click();
    buttons[1].click();

    return { valid, movedAfterValid, invalid, movedAfterInvalid, moved,
      card, labels, buildingList: opts.getState().readouts.buildingList,
      manifest: opts.manifest, persona: opts.persona };
  });

  expect(result.valid.every((x) => x.ok)).toBe(true);
  expect(result.movedAfterValid).toEqual([['fly', 0], ['walk', 1]]);
  expect(result.invalid.every((x) => !x.ok)).toBe(true);
  expect(result.movedAfterInvalid).toEqual(result.movedAfterValid);
  expect(result.card).toContain('School (building 1)');
  expect(result.labels).toEqual(['✈️ Fly to School', '🚶 Walk to School']);
  expect(result.moved).toEqual([['fly', 0], ['walk', 1], ['fly', 0], ['walk', 0]]);
  expect(result.buildingList).toBe('1: School, 2: Hospital');
  expect(result.manifest.params.find((p) => p.name === 'flyTo').label).toContain('building number');
  expect(result.persona).toContain('1 = School; 2 = Hospital');
});

test('a child can approve Buddy’s flyTo: 1 card and start the taxi', async ({ page }) => {
  await page.route('**/api/model', (route) => route.fulfill({ json: { models: [], current: null } }));
  await page.route('**/api/turn', (route) => route.fulfill({
    contentType: 'application/x-ndjson',
    body: JSON.stringify({ type: 'done', reply: 'Let us fly to the School.',
      actions: [{ op: 'setParam', name: 'flyTo', value: 1 }] }) + '\n',
  }));
  await page.goto('/city-builder/buddy-travel-test-page');
  for (const path of [
    '/logic/action-schema.js', '/logic/project-state.js', '/logic/stream-frames.js',
    '/logic/kid-markdown.js', '/logic/command-parse.js', '/buddy.js',
  ]) await page.addScriptTag({ url: path });
  await page.evaluate(async () => {
    const { mountCityBuddy } = await import('/city-builder/buddy.js');
    const building = { type: 'school', pos: [10, 20] };
    window.__flights = [];
    window.BuddyBoot = { mount(opts) {
      const root = document.createElement('div');
      document.body.appendChild(root);
      window.BuddyChat.mount(root, { ...opts, buddyName: 'Buddy' });
      return Promise.resolve({ close() {} });
    } };
    mountCityBuddy({}, { state: { pos: { x: 0, z: 0 } } },
      { walkSpeed: 5, flyTo(target) { window.__flights.push(target === building); return true; } },
      { buildings: [building], roads: [], parks: [] });
  });
  await page.locator('.buddy-lab .composer input').fill('Can you fly to the School?');
  await page.locator('.buddy-lab .composer button').click();
  await expect(page.locator('.actions .action-label')).toHaveText('✈️ Fly by taxi to School (building 1)');
  await expect.poll(() => page.evaluate(() => window.__flights.length)).toBe(0);
  await page.locator('.actions button').first().click();
  await expect.poll(() => page.evaluate(() => window.__flights)).toEqual([true]);
  await expect(page.locator('.buddy-log')).toContainText('Flying by taxi to the School!');
});
