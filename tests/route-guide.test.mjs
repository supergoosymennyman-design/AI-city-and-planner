import { test } from 'node:test';
import assert from 'node:assert/strict';
import { densifyLayout, sanitizeLayout } from '../P5 Programme/buddy-kit/client/city-common/layout.js';
import {
  buildVisitorRoute, browserSpeechAvailable, routeDirections, speakRouteDirections, verifyRoadTransform,
} from '../P5 Programme/buddy-kit/client/city-common/route-guide.js';

function layout(roads = [{ points: [[100, 100], [300, 100], [300, 300]], class: 'residential' }]) {
  return {
    version: 2, scaleMeters: 600, roads, parks: [],
    buildings: [
      { type: 'sentiment_lab', pos: [100, 120], footprint: [24, 24], height: 30 },
      { type: 'school', pos: [320, 300], footprint: [28, 24], height: 25 },
    ],
  };
}

test('visitor guide uses the known Dijkstra path and includes both entrance links', () => {
  const source = layout();
  const rendered = densifyLayout(sanitizeLayout(source)).layout;
  const result = buildVisitorRoute(source, rendered, 0, 1, 400);
  assert.equal(result.sourceDistance, 440); // 20 m entrance + 400 m road + 20 m entrance
  assert.equal(result.ok, false);
  assert.equal(result.status, 'over-budget');
  assert.equal(result.transform.ok, true);
  assert.ok(result.worldPath.length >= 4);
  assert.ok(result.directions.length >= 2);
});

test('visitor guide reports disconnected and unavailable road outcomes explicitly', () => {
  const disconnected = layout([
    { points: [[80, 100], [140, 100]], class: 'residential' },
    { points: [[280, 300], [340, 300]], class: 'residential' },
  ]);
  const rendered = densifyLayout(sanitizeLayout(disconnected)).layout;
  assert.equal(buildVisitorRoute(disconnected, rendered, 0, 1).status, 'disconnected');
  const none = layout([]), noneRendered = densifyLayout(sanitizeLayout(none)).layout;
  assert.equal(buildVisitorRoute(none, noneRendered, 0, 1).status, 'no-road-access');
  assert.equal(buildVisitorRoute(none, noneRendered, 0, 9).status, 'unavailable-selection');
});

test('road transform is verified separately and separated buildings get rendered entrance links', () => {
  const source = layout([{ points: [[50, 200], [550, 200]], class: 'primary' }]);
  source.buildings[0].pos = [260, 210];
  source.buildings[1].pos = [270, 212];
  source.buildings[0].footprint = source.buildings[1].footprint = [80, 80];
  const rendered = densifyLayout(sanitizeLayout(source)).layout;
  const transform = verifyRoadTransform(sanitizeLayout(source), rendered);
  assert.equal(transform.ok, true);
  assert.ok(Math.abs(transform.scale - 0.6) < 1e-9);
  const affineX = source.buildings[0].pos[0] * transform.scale + transform.tx;
  assert.notEqual(Math.round(rendered.buildings[0].pos[0]), Math.round(affineX), 'separation moved the entrance independently');
  const result = buildVisitorRoute(source, rendered, 0, 1, 1000);
  assert.equal(result.transform.ok, true);
  assert.ok(result.entranceLinks.start > 0);
  assert.deepEqual(result.worldPath[0], { x: rendered.buildings[0].pos[0], z: rendered.buildings[0].pos[1] });
});

test('unverified road transform blocks 3D geometry without losing original-plan evidence', () => {
  const source = layout(), rendered = densifyLayout(sanitizeLayout(source)).layout;
  rendered.roads[0].points[1][0] += 5;
  const result = buildVisitorRoute(source, rendered, 0, 1, 1000);
  assert.equal(result.status, 'geometry-unverified');
  assert.equal(result.worldPath.length, 0);
  assert.ok(result.sourceDistance > 0);
});

test('directions are complete as text and browser speech remains optional', () => {
  const directions = routeDirections([{ x: 0, z: 0 }, { x: 0, z: -20 }, { x: 30, z: -20 }]);
  assert.deepEqual(directions.map(d => [d.action, d.heading, d.metres]), [['start', 'north', 20], ['right', 'east', 30]]);
  assert.equal(browserSpeechAvailable({}), false);
  assert.equal(speakRouteDirections(['Head north'], {}), false);
  const spoken = [];
  function Utterance(text) { this.text = text; }
  const scope = { SpeechSynthesisUtterance: Utterance, speechSynthesis: { cancel() {}, speak(u) { spoken.push(u.text); } } };
  assert.equal(speakRouteDirections(['Head north', 'Arrive'], scope), true);
  assert.deepEqual(spoken, ['Head north. Arrive']);
});
