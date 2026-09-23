import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSampleCity } from '../P5 Programme/buddy-kit/client/city-common/sample-city.js';
import { gatewayPositions, gatewayLotClear } from '../P5 Programme/buddy-kit/client/city-common/gateway-placement.js';

for (const [name, layout] of [
  ['example', buildSampleCity()],
  ['new', { scaleMeters:2000, buildings:[], roads:[], parks:[] }],
  ['saved/restored', { scaleMeters:600, buildings:[{ pos:[390,390], footprint:[50,40] }], roads:[{ width:12, points:[[50,310],[550,310]] }], parks:[{ cx:170,cz:420,radius:48 }] }],
]) {
  test(`${name} city gives both gateways separate clear 28 m lots inside the plan`, () => {
    const positions = gatewayPositions(layout);
    assert.equal(positions.length, 2);
    for (const [i, p] of positions.entries()) {
      assert.ok(gatewayLotClear(layout, p.x, p.z, positions.slice(0, i)), `${name} gateway ${i} occupies a clear lot`);
      assert.ok(p.x >= 14 && p.z >= 14 && p.x <= layout.scaleMeters - 14 && p.z <= layout.scaleMeters - 14);
    }
    assert.deepEqual(gatewayPositions(structuredClone(layout)), positions);
  });
}
