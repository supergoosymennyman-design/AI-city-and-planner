// Timing is independent of simulation's safety clamp and of display refresh rate.
export function createFrameClock(fps = 0) {
  const interval = fps ? 1000 / fps : 0;
  let last = null, due = 0, seconds = 0, frames = 0;
  return {
    reset(now) { last = now; due = now + interval; seconds = 0; frames = 0; },
    tick(now) {
      if (last === null) { this.reset(now); return null; }
      if (interval && now + 0.5 < due) return null;
      const elapsed = Math.max(0, (now - last) / 1000);
      last = now;
      if (interval) due += Math.max(1, Math.floor((now + 0.5 - due) / interval) + 1) * interval;
      seconds += elapsed; frames++;
      let sample = null;
      if (seconds >= 2) { sample = { fps: frames / seconds, seconds }; seconds = 0; frames = 0; }
      return { elapsed, sample };
    },
  };
}

export function createDemoResolutionGovernor() {
  let scale = 1, lowWindows = 0, healthySeconds = 0, lastChange = -Infinity;
  return {
    reset(nextScale = scale) { scale = nextScale; lowWindows = 0; healthySeconds = 0; lastChange = -Infinity; },
    sample({ fps, seconds }, now) {
      lowWindows = fps < 27 ? lowWindows + 1 : 0;
      healthySeconds = fps >= 29 ? healthySeconds + seconds : 0;
      if (now - lastChange < 10000) return scale;
      const next = lowWindows >= 2 ? Math.max(0.9, scale - 0.05)
        : healthySeconds >= 10 ? Math.min(1, scale + 0.05) : scale;
      if (next !== scale) {
        scale = Math.round(next * 100) / 100;
        lastChange = now; lowWindows = 0; healthySeconds = 0;
      }
      return scale;
    },
  };
}

// EffectComposer retains its own pixel ratio; updating only the canvas leaves
// the effects rendering at the old (potentially much larger) resolution.
export function resizeCityRenderer(renderer, composer, width, height, pixelRatio) {
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  if (composer) {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
  }
}

// Wrap only this pass, so composer resizing keeps the bloom budget in effect.
export function scaleBloomResolution(pass, scale) {
  const setSize = pass.setSize.bind(pass);
  pass.setSize = (width, height) => setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  return pass;
}
