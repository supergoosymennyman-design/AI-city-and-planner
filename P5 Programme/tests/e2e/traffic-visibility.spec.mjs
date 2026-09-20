import { test, expect } from '@playwright/test';

async function bootExampleCity(page) {
  await page.goto('/city-builder/');
  await page.waitForTimeout(2000);
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => window.__city?.traffic && document.querySelector('#loading.done'), null, { timeout: 60000 });
  // Citizens are a DEFERRED asset: `#loading.done` only means procedural-ready.
  // Wait for the crowd to resolve before snapshotting, or the count reads 0.
  await page.waitForFunction(() => window.__city?.citizens?.getStats?.().models > 0, null, { timeout: 60000 });
}

async function trafficSnapshot(page) {
  return page.evaluate(() => {
    const live = window.__city.traffic;
    const spawn = window.__city.spawnWorld;
    const nearby = live.vehicles.filter((v) => Math.hypot(v.x - spawn.x, v.z - spawn.z) < 220);
    // The example's outer ring and spokes are roads 4–8; road 9 is the small
    // central roundabout. Seeing either proves traffic has spread outward.
    const beyondCentralRing = live.vehicles.filter((v) => v.link.roadId >= 4 && v.link.roadId <= 8);
    let overlaps = 0;
    for (let a = 0; a < live.vehicles.length; a++) for (let b = a + 1; b < live.vehicles.length; b++) {
      if (live.network && live.vehiclesOverlap?.(live.vehicles[a], live.vehicles[b])) overlaps++;
    }
    return {
      count: live.vehicles.length,
      cap: live.fleet.cap,
      target: live.fleet.target,
      occupancy: live.roadOccupancy,
      nearby: nearby.length,
      renderedNearby: nearby.some((v) => v.inst?.count > 0),
      beyondCentralRing: beyondCentralRing.length,
      overlaps,
      robotPopulation: window.__city.pedestrians || null,
      citizens: window.__city.citizens?.getCount?.() || 0,
      animatedCitizens: window.__city.citizens?.getStats?.().animated || 0,
      renderer: live.renderer,
      realisticFleet: live.realisticFleet,
    };
  });
}

function expectLayeredFleet(traffic) {
  const roles = ['body', 'glass', 'tyre', 'trim', 'lamp'];
  for (const [archetype, batches] of Object.entries(traffic.renderer.batches)) {
    expect(batches, `${archetype} has layered material batches`).toEqual(roles);
  }
  // Seven archetypes × five materials. This is a predictable bound rather
  // than a per-vehicle draw-call cost on either desktop or tablet.
  expect(traffic.renderer.drawCalls).toBeGreaterThan(0);
  expect(traffic.renderer.drawCalls).toBeLessThanOrEqual(35);
  expect(traffic.renderer.overflow).toBe(0);
  expect(traffic.renderer.nonFinite).toBe(0);
}

test('desktop example city uses the moderate fleet and spreads beyond the roundabout', async ({ page }) => {
  await bootExampleCity(page);
  await page.waitForFunction(() => __city.citizens.getStats().animated > 0, null, { timeout: 30000 });
  const traffic = await trafficSnapshot(page);
  expect(traffic.cap).toBe(42);
  expect(traffic.target).toBeLessThanOrEqual(42);
  expect(traffic.count).toBeLessThanOrEqual(traffic.cap);
  expectLayeredFleet(traffic);
  expect(traffic.nearby).toBeGreaterThan(0);
  expect(traffic.renderedNearby).toBe(true);
  expect(traffic.beyondCentralRing).toBeGreaterThan(0);
  expect(traffic.overlaps).toBe(0);
  expect(traffic.robotPopulation).toBeNull();
  expect(traffic.citizens).toBeGreaterThan(0);
  expect(traffic.animatedCitizens).toBeGreaterThan(0);
  // The example city has exactly two valid circuits: the outer ring (road 4)
  // and the central roundabout (road 9). An old planner bug closed the ring
  // route with a U-turn onto a dead-end avenue, which padded this to 3 roads;
  // the invariant we actually care about is that both true circuits carry cars.
  const occupiedRoads = Object.keys(traffic.occupancy).map(Number);
  expect(occupiedRoads).toContain(4);
  expect(occupiedRoads).toContain(9);
});

test('ambient fleet keeps both Audi GLBs and their material primitive batches', async ({ page }) => {
  await bootExampleCity(page);
  await page.waitForFunction(() => window.__city?.traffic?.realisticFleet?.loaded?.length === 2, null, { timeout: 60000 });
  const traffic = await trafficSnapshot(page);
  expect(traffic.realisticFleet.loaded).toEqual(['veh_audi_a7', 'veh_audi_rs_q8']);
  expect(traffic.realisticFleet.failed).toEqual([]);
  expect(traffic.realisticFleet.errors).toEqual({});
  const batches = traffic.renderer.batches;
  expect(batches['realistic-veh_audi_a7'].length).toBe(5); // audi-a7.glb: 4 meshes / 5 material primitives
  expect(batches['realistic-veh_audi_rs_q8'].length).toBe(5);
  // Batch keys are `${semantic}_${meshIndex}_${primitiveIndex}`; the Audi LODs
  // expose a semantic material name ('paint') rather than the literal 'primitive'.
  for (const batch of [...batches['realistic-veh_audi_a7'], ...batches['realistic-veh_audi_rs_q8']]) {
    expect(batch).toMatch(/^[A-Za-z0-9-]+_\d+_\d+$/);
  }
  expect(traffic.renderer.drawCalls).toBeLessThanOrEqual(35);
});

test.describe('tablet traffic visibility', () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });

  test('tablet example city remains within its 22-vehicle cap and spreads outward', async ({ page }) => {
    await bootExampleCity(page);
    const traffic = await trafficSnapshot(page);
    expect(traffic.cap).toBe(22);
    expect(traffic.target).toBeLessThanOrEqual(22);
    expect(traffic.count).toBeLessThanOrEqual(traffic.cap);
    expectLayeredFleet(traffic);
    expect(traffic.nearby).toBeGreaterThan(0);
    expect(traffic.renderedNearby).toBe(true);
    expect(traffic.beyondCentralRing).toBeGreaterThan(0);
    expect(traffic.overlaps).toBe(0);
  expect(traffic.robotPopulation).toBeNull();
  expect(traffic.citizens).toBeGreaterThan(0);
  });
});
