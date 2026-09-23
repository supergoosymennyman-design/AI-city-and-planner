// tests/vehicle-scale.test.mjs — real-world default sizes for drivable/prop cars.
//
// Drivable cars and placed vehicle props must spawn at sizes that match the 3D
// city's AI champion (~4 m tall) and road traffic (cars ~5 m, buses ~9 m), not
// the library's small source-unit footprints.
//
// Run: node --test tests/vehicle-scale.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY, libraryItem } from '../P5 Programme/buddy-kit/client/city-common/library.js';
import { vehicleTargetLength, isRoadVehicle } from '../P5 Programme/buddy-kit/client/city-common/vehicle-scale.js';

const expect = (id, length, road = true) => test(`vehicle ${id}`, () => {
  const item = libraryItem(id);
  assert.ok(item, `${id} must exist in library.js`);
  assert.equal(vehicleTargetLength(item), length, `${id} default length`);
  assert.equal(isRoadVehicle(item), road, `${id} road classification`);
});

test('every library vehicle has a positive real-world default length', () => {
  const vehicles = LIBRARY.filter((it) => it.category === 'vehicles');
  assert.ok(vehicles.length > 30, 'vehicles present in the catalog');
  for (const v of vehicles) {
    const len = vehicleTargetLength(v);
    assert.ok(Number.isFinite(len) && len > 0.5 && len <= 12, `${v.id} -> ${len}`);
  }
});

test('car classes target ~5 m (comfortably longer than the 1.8 m Champion is tall)', () => {
  for (const id of ['veh_sedan', 'veh_suv', 'veh_taxi', 'veh_police', 'veh_car', 'veh_hatchback', 'veh_sports_car', 'veh_race', 'veh_van']) {
    assert.equal(vehicleTargetLength(libraryItem(id)), 5.0, id);
  }
});

test('truck/van/delivery classes are sized to ~6–7 m, buses to ~9 m', () => {
  assert.equal(vehicleTargetLength(libraryItem('veh_ambulance')), 6.0);
  assert.equal(vehicleTargetLength(libraryItem('veh_delivery')), 6.0);
  assert.equal(vehicleTargetLength(libraryItem('veh_truck')), 7.0);
  assert.equal(vehicleTargetLength(libraryItem('veh_firetruck')), 7.0);
  assert.equal(vehicleTargetLength(libraryItem('veh_bus_q')), 8.8);
  assert.equal(vehicleTargetLength(libraryItem('veh_schoolbus')), 8.8);
});

test('small classes stay small: motorcycle ~2.6 m, kart ~2.9 m', () => {
  assert.equal(vehicleTargetLength(libraryItem('veh_motorcycle')), 2.6);
  assert.equal(vehicleTargetLength(libraryItem('veh_kart_oobi_kc')), 2.9);
});

test('non-road vehicles are flagged for the props list but not the drive chooser', () => {
  for (const id of ['veh_train', 'veh_train_carriage', 'veh_train_highspeed', 'veh_helicopter']) {
    const item = libraryItem(id);
    assert.ok(item, `${id} exists`);
    assert.equal(isRoadVehicle(item), false, `${id} is not road-drivable`);
    assert.ok(vehicleTargetLength(item) > 0, `${id} still has a prop size`);
  }
});
