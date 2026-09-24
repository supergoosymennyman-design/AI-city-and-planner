import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameClock, createDemoResolutionGovernor, resizeCityRenderer, scaleBloomResolution } from '../P5 Programme/buddy-kit/client/city-builder/demo-performance.js';
import { assetCacheHeaders, assetNotModified } from '../P5 Programme/scripts/demo-asset-cache.mjs';

test('30 FPS scheduling preserves elapsed movement time at different refresh rates', () => {
  for (const hz of [60, 90, 120, 144]) {
    const clock = createFrameClock(30); clock.reset(0);
    let count = 0, elapsed = 0;
    for (let i = 1; i <= hz * 10; i++) {
      const frame = clock.tick(i * 1000 / hz);
      if (frame) { count++; elapsed += frame.elapsed; }
    }
    assert.equal(count, 300, `${hz} Hz`);
    assert.ok(Math.abs(elapsed - 10) < 0.001);
  }
});

test('severe stalls use wall time; reset excludes suspension and prevents catch-up bursts', () => {
  const clock = createFrameClock(); clock.reset(0);
  let frame;
  for (let now = 100; now <= 2100; now += 100) {
    frame = clock.tick(now);
    if (frame.sample) assert.ok(Math.abs(frame.sample.fps - 10) < 0.001);
  }
  clock.reset(60000);
  assert.ok(clock.tick(60016).elapsed < 0.02);
  const capped = createFrameClock(30); capped.reset(0);
  assert.equal(capped.tick(2000).elapsed, 2);
  assert.equal(capped.tick(2001), null);
});

test('demo resolution requires sustained load, observes cooldown, stops at 90%, and recovers', () => {
  const governor = createDemoResolutionGovernor();
  const low = { fps: 20, seconds: 2 }, high = { fps: 30, seconds: 2 };
  assert.equal(governor.sample(low, 2000), 1);
  assert.equal(governor.sample(low, 4000), 0.95);
  for (let now = 6000; now < 14000; now += 2000) assert.equal(governor.sample(low, now), 0.95);
  assert.equal(governor.sample(low, 14000), 0.9);
  for (let now = 16000; now <= 30000; now += 2000) assert.equal(governor.sample(low, now), 0.9);
  for (let now = 32000; now < 40000; now += 2000) assert.equal(governor.sample(high, now), 0.9);
  assert.equal(governor.sample(high, 40000), 0.95);
  for (let now = 42000; now <= 50000; now += 2000) governor.sample(high, now);
  assert.equal(governor.sample(high, 52000), 1);
  governor.sample(low, 54000); governor.reset();
  assert.equal(governor.sample(low, 56000), 1);
  assert.equal(governor.sample(low, 58000), 0.95);
  governor.reset(1);
  assert.equal(governor.sample(high, 60000), 1);
});

test('canvas and effects resize together and bloom keeps its own smaller buffers', () => {
  const renderer = { setPixelRatio(v) { this.ratio = v; }, setSize(w, h) { this.size = [w, h]; } };
  const bloom = scaleBloomResolution({ setSize(w, h) { this.size = [w, h]; } }, 0.75);
  const composer = { setPixelRatio(v) { this.ratio = v; }, setSize(w, h) {
    this.size = [w * this.ratio, h * this.ratio]; bloom.setSize(...this.size);
  } };
  for (const ratio of [2, 1.8, 1]) {
    resizeCityRenderer(renderer, composer, 1200, 800, ratio);
    assert.equal(renderer.ratio, composer.ratio);
    assert.deepEqual(composer.size, [1200 * ratio, 800 * ratio]);
    assert.deepEqual(bloom.size, [900 * ratio, 600 * ratio]);
  }
  resizeCityRenderer(renderer, null, 800, 600, 1);
});

test('static assets revalidate, changed files invalidate, HTML is never cached', () => {
  const info = { size: 100, mtimeMs: 1000, ctimeMs: 1000 };
  const headers = new Headers(assetCacheHeaders('model.glb', info));
  const request = new Request('http://localhost/model.glb', { headers: { 'if-none-match': headers.get('etag') } });
  assert.equal(assetNotModified(request, headers), true);
  for (const change of [{ size: 101 }, { mtimeMs: 1001 }, { ctimeMs: 1001 }]) {
    assert.equal(assetNotModified(request, new Headers(assetCacheHeaders('model.glb', { ...info, ...change }))), false);
  }
  const html = new Headers(assetCacheHeaders('index.html', info));
  assert.equal(html.get('cache-control'), 'no-store');
  assert.equal(assetNotModified(request, html), false);
  assert.equal(assetNotModified(new Request(request.url), headers), false);
});
