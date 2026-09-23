import test from 'node:test';
import assert from 'node:assert/strict';
import { cityReturnRoute } from '../P5 Programme/Fit Studio/city-return.js';

test('first Studio transfer opens the isolated example City', () => {
  assert.match(cityReturnRoute(null), /example=1/);
  assert.match(cityReturnRoute('{broken'), /example=1/);
});

test('returning Studio transfer resumes the saved city', () => {
  const route = cityReturnRoute(JSON.stringify({ roads:[], buildings:[] }));
  assert.match(route, /resume=1/);
  assert.doesNotMatch(route, /example=1/);
});
