import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIBRARY } from '../P5 Programme/buddy-kit/client/city-common/library.js';
import { acceptedCommercialVehicles, commercialTrafficVehicleIds } from '../P5 Programme/buddy-kit/client/city-common/commercial-vehicles.js';

const intake = JSON.parse(readFileSync(new URL('../P5 Programme/buddy-kit/client/library/COMMERCIAL-VEHICLE-INTAKE.json', import.meta.url), 'utf8'));

test('commercial vehicle exception is an explicit, vehicle-only allow-list', () => {
  assert.equal(intake.version, 1);
  const accepted = intake.records.filter((record) => record.status === 'accepted');
  const ids = new Set(accepted.map((record) => record.id));
  assert.equal(ids.size, accepted.length, 'accepted intake ids are unique');
  for (const record of accepted) {
    assert.equal(record.license, 'owner-vetted-commercial-use');
    assert.match(record.glb, /^library\/vehicles\/[a-z0-9_-]+\.glb$/i);
  }
  assert.deepEqual(commercialTrafficVehicleIds(), acceptedCommercialVehicles().map((item) => item.id).sort());
  for (const item of LIBRARY.filter((entry) => entry.commercialVehicle === true)) {
    assert.equal(item.category, 'vehicles');
    assert.equal(ids.has(item.id), true);
    assert.equal(item.drivable, true);
    assert.ok(item.nameZh && Number.isFinite(item.targetLength) && Number.isFinite(item.targetWidth));
  }
});
