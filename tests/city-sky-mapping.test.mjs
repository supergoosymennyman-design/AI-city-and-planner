import assert from 'node:assert/strict';
import test from 'node:test';
import { equirectangularSkyV, twoBandPanoramaSample } from '../P5 Programme/buddy-kit/client/city-builder/sky-mapping.js';

test('a synthetic two-band panorama always maps an upward ray to its sky band', () => {
  assert.equal(twoBandPanoramaSample(1), 'sky');
  assert.equal(twoBandPanoramaSample(0.35), 'sky');
  assert.equal(twoBandPanoramaSample(-0.35), 'ground');
  assert.equal(equirectangularSkyV(1), 1);
  assert.equal(equirectangularSkyV(0), 0.5);
  assert.equal(equirectangularSkyV(-1), 0);
});
