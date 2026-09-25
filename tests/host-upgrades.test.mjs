// tests/host-upgrades.test.mjs — a purchasable skill-host upgrade must really
// persist and re-colour a host, not be a dead Buy button (review finding).
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOST_UPGRADES, hostUpgradeById, readHostUpgrade, writeHostUpgrade, applyHostUpgrade } from '../P5 Programme/buddy-kit/client/city-common/host-upgrades.js';

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
function fakeHost() {
  const emissive = { hex: 0x000000, setHex(v) { this.hex = v; } };
  const material = { emissive, emissiveIntensity: 0.2, metalness: 0.12 };
  return { material, traverse(fn) { fn({ isMesh: true, material }); } };
}

test('the two host upgrades exist with bilingual names', () => {
  assert.deepEqual(Object.keys(HOST_UPGRADES).sort(), ['crystal', 'flagship']);
  for (const upgrade of Object.values(HOST_UPGRADES)) assert.ok(upgrade.name && upgrade.nameZh, `${upgrade.id} needs bilingual names`);
});

test('a host upgrade equips, persists, and clears', () => {
  const storage = fakeStorage();
  assert.equal(readHostUpgrade(storage), null);
  assert.equal(writeHostUpgrade('crystal', storage), true);
  assert.equal(readHostUpgrade(storage), 'crystal');
  assert.equal(writeHostUpgrade('nope', storage), false);
  assert.equal(readHostUpgrade(storage), 'crystal');
  assert.equal(writeHostUpgrade(null, storage), true);
  assert.equal(readHostUpgrade(storage), null);
});

test('applying a host upgrade recolours its trim', () => {
  const host = fakeHost();
  assert.equal(applyHostUpgrade(host, 'flagship'), true);
  assert.equal(host.material.emissive.hex, HOST_UPGRADES.flagship.emissive);
  applyHostUpgrade(host, 'crystal');
  assert.equal(host.material.emissive.hex, HOST_UPGRADES.crystal.emissive);
  applyHostUpgrade(host, null);
  assert.equal(host.material.emissive.hex, 0x000000);
  assert.equal(hostUpgradeById('nope'), null);
});
