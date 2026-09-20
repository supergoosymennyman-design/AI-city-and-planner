/**
 * waveforms.js — Signal generators for Sonic Leak Hunter
 * 
 * Provides functions that generate y-values for different wave patterns:
 * - smoothSine: clean sine wave (safe pipes)
 * - leakSpike: jagged wave with sharp noise spikes (leaking pipes)
 * - noisyWave: smooth with small baseline wiggles but no dominant spike
 * - compositeWave: mixed signal for threshold testing
 * 
 * All functions return arrays of {x, y} points for canvas rendering.
 */

const Waveforms = (() => {

  /**
   * Generate a smooth sine wave — SAFE pipe sound
   * @param {number} width - canvas width in px
   * @param {number} height - canvas height in px
   * @param {number} freq - frequency (cycles across width)
   * @param {number} amp - amplitude (0-1, fraction of height/2)
   * @param {number} noise - noise amplitude (0-0.5, adds small random jitter)
   * @returns {Array<{x: number, y: number}>}
   */
  function smoothSine(width, height, freq = 1.5, amp = 0.3, noise = 0) {
    const points = [];
    const midY = height / 2;
    const maxAmp = midY * 0.8;
    const amplitude = amp * maxAmp;

    for (let x = 0; x < width; x += 2) {
      const phase = (x / width) * Math.PI * 2 * freq;
      let y = midY + Math.sin(phase) * amplitude;

      // Add tiny random noise if specified
      if (noise > 0) {
        y += (Math.random() - 0.5) * noise * maxAmp * 2;
      }

      points.push({ x, y });
    }
    return points;
  }

  /**
   * Generate a jagged leak wave — LEAKY pipe sound
   * Has sharp spikes, noise, and irregular amplitude modulation
   * @param {number} width - canvas width in px
   * @param {number} height - canvas height in px
   * @param {number} freq - base frequency
   * @param {number} amp - base amplitude (0-1)
   * @param {number} noise - noise strength (0-0.5)
   * @returns {Array<{x: number, y: number}>}
   */
  function leakSpike(width, height, freq = 3.0, amp = 0.6, noise = 0.3) {
    const points = [];
    const midY = height / 2;
    const maxAmp = midY * 0.8;
    const amplitude = amp * maxAmp;

    for (let x = 0; x < width; x += 2) {
      const phase = (x / width) * Math.PI * 2 * freq;
      let y = midY + Math.sin(phase) * amplitude;

      // Add sharp noise — creates the "jagged" look
      if (noise > 0) {
        y += (Math.random() - 0.5) * noise * maxAmp * 2;
      }

      // Occasional extra spike — every ~30px add a sharp deviation
      if (x % 28 < 4) {
        const spikeBoost = Math.sin((x % 28) / 4 * Math.PI) * amplitude * 0.6;
        y += spikeBoost;
      }

      points.push({ x, y });
    }
    return points;
  }

  /**
   * Generate a composite wave with one big spike — used in Lv3 and Lv4
   * Smooth baseline with small noise + one dominant spike at spikePos
   * @param {number} width - canvas width
   * @param {number} height - canvas height
   * @param {number} freq - base frequency
   * @param {number} amp - base amplitude
   * @param {number} noise - baseline noise
   * @param {number} spikeAmp - height of the dominant spike (0-1)
   * @param {number} spikePos - x-position of spike center (0-1, fraction of width)
   * @returns {Array<{x: number, y: number}>}
   */
  function compositeWave(width, height, freq = 1.5, amp = 0.2, noise = 0.05, spikeAmp = 0.6, spikePos = 0.55) {
    const points = [];
    const midY = height / 2;
    const maxAmp = midY * 0.8;
    const baseAmp = amp * maxAmp;
    const spikeHeight = spikeAmp * maxAmp;
    const spikeCenter = spikePos * width;
    const spikeWidth = 40; // width of the spike in pixels

    for (let x = 0; x < width; x += 2) {
      const phase = (x / width) * Math.PI * 2 * freq;
      let y = midY + Math.sin(phase) * baseAmp;

      // Add baseline noise — deterministic (seeded by x position) so the wave
      // is always the same for the same parameters, guaranteeing valid solutions
      if (noise > 0) {
        const noiseVal = Math.sin(x * 0.3 + 1.7) * 0.5 + Math.cos(x * 0.7 + 3.1) * 0.5;
        y += noiseVal * noise * maxAmp;
      }

      // Add the dominant spike using a Gaussian-like envelope
      const distFromSpike = x - spikeCenter;
      const spikeEnvelope = Math.exp(-(distFromSpike * distFromSpike) / (2 * spikeWidth * spikeWidth));
      // The spike oscillates to look more natural
      const spikeSignal = Math.sin(distFromSpike / 3 * Math.PI) * spikeHeight * spikeEnvelope;
      y += spikeSignal;

      points.push({ x, y });
    }
    return points;
  }

  /**
   * Generate a noisy wave WITHOUT a dominant spike — Lv3 distractor
   * Looks like noise-only, used to test if kid can spot the difference
   */
  function noisySafe(width, height, freq = 1.5, amp = 0.2, noise = 0.08, smallSpikeAmp = 0.15, spikePos = 0.5) {
    // Same as compositeWave but with much smaller spike
    return compositeWave(width, height, freq, amp, noise, smallSpikeAmp, spikePos);
  }

  /**
   * Generate the LIVE animated wave data for Level 3
   * Returns a function that, given time and previous points, produces the next frame
   * @param {object} config - wave configuration
   * @returns {function} frame generator
   */
  function createLiveWave(config) {
    const { baseFreq = 1.5, baseAmp = 0.2, noise = 0.08, spikeAmp = 0.6, spikePos = 0.55, isLeak = false } = config;
    
    let time = 0;
    
    return function generateFrame(width, height, dt = 0.016) {
      time += dt;
      const points = [];
      const midY = height / 2;
      const maxAmp = midY * 0.8;
      const amplitude = baseAmp * maxAmp;
      const spikeHeight = isLeak ? spikeAmp * maxAmp : spikeAmp * maxAmp * 0.25;
      const spikeCenter = spikePos * width;
      const spikeWidth = 40;

      // Shift the baseline with time so the wave "moves"
      const timeShift = time * 2 * Math.PI * 0.3;

      for (let x = 0; x < width; x += 2) {
        const phase = (x / width) * Math.PI * 2 * baseFreq + timeShift;
        let y = midY + Math.sin(phase) * amplitude;

        // Add animated noise — changes every frame
        if (noise > 0) {
          y += (Math.sin(x * 0.3 + time * 5) * 0.5 + Math.cos(x * 0.7 + time * 3.7) * 0.5) * noise * maxAmp;
        }

        // Add the spike at spikePos — maintains position but pulses
        const distFromSpike = x - spikeCenter;
        const spikeEnvelope = Math.exp(-(distFromSpike * distFromSpike) / (2 * spikeWidth * spikeWidth));
        const pulseFactor = 1 + Math.sin(time * 3) * 0.2;
        const spikeSignal = Math.sin(distFromSpike / 3 * Math.PI) * spikeHeight * spikeEnvelope * pulseFactor;
        y += spikeSignal;

        points.push({ x, y });
      }
      return points;
    };
  }

  /**
   * Generate threshold-test wave data for Lv4
   * Smooth sine with a clear spike — used to test slider threshold
   */
  function thresholdWave(width, height, freq = 1.5, amp = 0.25, noise = 0.03, spikeAmp = 0.55, spikePos = 0.6) {
    return compositeWave(width, height, freq, amp, noise, spikeAmp, spikePos);
  }

  /**
   * Find the y-value at a given x position (linear interpolation)
   */
  function getYAtX(points, x) {
    if (points.length === 0) return 0;
    if (x <= points[0].x) return points[0].y;
    if (x >= points[points.length - 1].x) return points[points.length - 1].y;

    // Binary search for the closest point
    let lo = 0, hi = points.length - 1;
    while (lo < hi - 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (points[mid].x < x) lo = mid;
      else hi = mid;
    }
    const t = (x - points[lo].x) / (points[hi].x - points[lo].x);
    return points[lo].y + t * (points[hi].y - points[lo].y);
  }

  /**
   * Check if the threshold line at thresholdY correctly intersects
   * only the spike and not the smooth sections
   * Returns { intersectsLeak: bool, intersectsSafe: bool, leakCrossings: number, safeCrossings: number }
   */
  function checkThreshold(points, thresholdY, spikePos = 0.6, spikeWidthFraction = 0.15) {
    const spikeCenter = spikePos * (points[points.length - 1]?.x || 600);
    const spikeHalfWidth = spikeWidthFraction * (points[points.length - 1]?.x || 600) / 2;

    let leakCrossings = 0;
    let safeCrossings = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const crossesThreshold = 
        (points[i].y - thresholdY) * (points[i + 1].y - thresholdY) < 0;
      
      if (crossesThreshold) {
        const crossX = (points[i].x + points[i + 1].x) / 2;
        const distFromSpike = Math.abs(crossX - spikeCenter);
        
        if (distFromSpike < spikeHalfWidth * 2) {
          leakCrossings++;
        } else {
          safeCrossings++;
        }
      }
    }

    return {
      intersectsLeak: leakCrossings > 0,
      intersectsSafe: safeCrossings > 0,
      leakCrossings,
      safeCrossings
    };
  }

  // ─── Edge Case generators (L3 Edge Case Patrol) ────────────────
  // All are DETERMINISTIC (no Math.random) so the same parameters always
  // produce the same wave — guaranteeing stable, testable solutions.

  /**
   * Rhythmic rectangular thumps — construction jackhammer (NOT a leak)
   * Regular "bang-bang-bang" pattern, repeating evenly across the width.
   */
  function rhythmicPulse(width, height, pulseRate = 5, amp = 0.5, noise = 0.08) {
    const points = [];
    const midY = height / 2;
    const maxAmp = midY * 0.8;
    const amplitude = amp * maxAmp;
    const period = width / pulseRate;

    for (let x = 0; x < width; x += 2) {
      const posInPeriod = (x % period) / period;
      const jitter = (Math.sin(x * 0.13) * 0.5 + Math.cos(x * 0.29) * 0.5) * noise * maxAmp;
      let y;
      if (posInPeriod < 0.35) {
        // Sharp thump inside the pulse
        const thump = Math.sin((posInPeriod / 0.35) * Math.PI * 2.5) * amplitude * 0.55;
        y = midY - amplitude * 0.4 + thump + jitter;
      } else {
        // Quiet between pulses
        y = midY + jitter * 0.35;
      }
      points.push({ x, y });
    }
    return points;
  }

  /**
   * Deep low-frequency rumble — subway train (NOT a leak)
   * Slow swelling envelope with heavy low-frequency wobble.
   */
  function deepRumble(width, height, freq = 0.6, amp = 0.6, noise = 0.2) {
    const points = [];
    const midY = height / 2;
    const maxAmp = midY * 0.8;
    const amplitude = amp * maxAmp;

    for (let x = 0; x < width; x += 2) {
      const phase = (x / width) * Math.PI * 2 * freq;
      const envelope = 0.55 + 0.45 * Math.sin(phase * 0.5);
      const n = (Math.sin(x * 0.4) * 0.5 + Math.cos(x * 0.8 + 2) * 0.5) * noise * maxAmp;
      const y = midY + Math.sin(phase) * amplitude * envelope + n;
      points.push({ x, y });
    }
    return points;
  }

  /**
   * Static noise with sporadic bursts — heavy rain (NOT a leak)
   * Dense fine static with random amplitude clusters, no dominant spike.
   */
  function staticBurst(width, height, burstProb = 0.15, amp = 0.35, noise = 0.4) {
    const points = [];
    const midY = height / 2;
    const maxAmp = midY * 0.8;

    for (let x = 0; x < width; x += 2) {
      // Deterministic pseudo-random in [0,1)
      const raw = Math.sin(x * 12.9898) * 43758.5453;
      const frac = raw - Math.floor(raw);
      const inBurst = frac < burstProb;

      const n = (Math.sin(x * 0.7 + 1) * 0.5 + Math.cos(x * 1.3 + 4) * 0.5);
      let y = midY + n * noise * maxAmp;
      if (inBurst) {
        y += Math.sin(x * 0.9) * 0.5 * amp * maxAmp;
      }
      points.push({ x, y });
    }
    return points;
  }

  /**
   * Erratic mixed signal — festival chaos (NOT a leak)
   * Frequency & amplitude change every ~30px, chaotic but no single spike.
   */
  function erraticMix(width, height, amp = 0.45, noise = 0.3) {
    const points = [];
    const midY = height / 2;
    const maxAmp = midY * 0.8;
    const segment = 30;
    const segs = Math.ceil(width / segment) + 1;

    // Precompute deterministic per-segment params
    const freqs = [];
    const amps = [];
    for (let s = 0; s < segs; s++) {
      const raw = Math.sin(s * 12.9898) * 43758.5453;
      const frac = raw - Math.floor(raw);
      freqs.push(0.8 + frac * 4);
      amps.push((0.2 + frac * 0.5) * amp);
    }

    for (let x = 0; x < width; x += 2) {
      const s = Math.floor(x / segment);
      const local = (x % segment) / segment;
      const phase = ((s + local) * 0.5) * Math.PI * 2 * freqs[s];
      const n = (Math.sin(x * 0.6) * 0.5 + Math.cos(x * 1.1) * 0.5) * noise * maxAmp;
      const y = midY + Math.sin(phase) * amps[s] * maxAmp + n;
      points.push({ x, y });
    }
    return points;
  }

  /**
   * Cyclical on/off pump sputter — failing pump (IS a threat!)
   * Regular bursts of sharp oscillation with quiet gaps — the pump struggles.
   */
  function cyclicalPulse(width, height, cycles = 4, amp = 0.6, noise = 0.15) {
    const points = [];
    const midY = height / 2;
    const maxAmp = midY * 0.8;
    const cycleLen = width / cycles;

    for (let x = 0; x < width; x += 2) {
      const posInCycle = (x % cycleLen) / cycleLen;
      const n = (Math.sin(x * 0.33 + 2) * 0.5 + Math.cos(x * 0.77) * 0.5) * noise * maxAmp;
      let y = midY;
      if (posInCycle < 0.3) {
        // Pump ON — sputtering sharp oscillation
        const onPhase = posInCycle / 0.3;
        y = midY + Math.sin(onPhase * Math.PI * 4) * amp * maxAmp * (1 - onPhase * 0.4) + n;
      } else {
        // Pump OFF — quiet
        y = midY + n * 0.3;
      }
      points.push({ x, y });
    }
    return points;
  }

  /**
   * Pressure surge with damped ring — pipe rupture transient (IS a threat!)
   * One sharp spike then a decaying oscillation — classic rupture signature.
   */
  function pressureDamped(width, height, spikeAmp = 0.85, spikePos = 0.35, dampRate = 0.05) {
    const points = [];
    const midY = height / 2;
    const maxAmp = midY * 0.8;
    const spikeCenter = spikePos * width;

    for (let x = 0; x < width; x += 2) {
      const dist = x - spikeCenter;
      const env = Math.exp(-Math.abs(dist) * dampRate);
      const ring = Math.sin(dist * 0.05) * spikeAmp * maxAmp * env;
      const base = Math.sin((x / width) * Math.PI * 2 * 1.2) * 0.12 * maxAmp;
      const y = midY + base + ring;
      points.push({ x, y });
    }
    return points;
  }

  /**
   * Water hammer — one sharp BANG then silence (NOT a leak)
   * A valve slamming closed produces a single isolated spike with no ring.
   * Contrast with pressureDamped (spike + ringing decay).
   */
  function waterHammer(width, height, spikePos = 0.35, spikeAmp = 0.8) {
    const points = [];
    const midY = height / 2;
    const maxAmp = midY * 0.8;
    const spikeCenter = spikePos * width;
    const spikeWidth = 16; // very narrow — one clean bang

    for (let x = 0; x < width; x += 2) {
      const dist = x - spikeCenter;
      const env = Math.exp(-(dist * dist) / (2 * spikeWidth * spikeWidth));
      // One upward spike, then flat silence — no ringing after
      const y = midY - spikeAmp * maxAmp * env + Math.sin(x * 0.11) * 0.03 * maxAmp;
      points.push({ x, y });
    }
    return points;
  }

  /**
   * Traffic vibration — cars passing by (NOT a leak)
   * Periodic rumble whose frequency and loudness slowly change (approaching/passing).
   */
  function trafficVibration(width, height, freqBase = 1.2, amp = 0.5, noise = 0.12) {
    const points = [];
    const midY = height / 2;
    const maxAmp = midY * 0.8;

    for (let x = 0; x < width; x += 2) {
      const t = x / width;
      // Frequency drifts up and down — cars accelerate/pass
      const freq = freqBase * (0.6 + 0.8 * Math.abs(Math.sin(t * Math.PI * 3)));
      // Amplitude envelope swells and fades — cars come and go
      const env = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
      const phase = t * Math.PI * 2 * freq;
      const n = (Math.sin(x * 0.7) * 0.5 + Math.cos(x * 1.3) * 0.5) * noise * maxAmp;
      const y = midY + Math.sin(phase) * amp * maxAmp * env + n;
      points.push({ x, y });
    }
    return points;
  }

  /**
   * Corrosion drip — small but steady slow leak (IS a threat!)
   * Tiny regular pulses — a hidden micro-leak that never stops.
   */
  function corrosionDrip(width, height, dripRate = 10, amp = 0.18) {
    const points = [];
    const midY = height / 2;
    const maxAmp = midY * 0.8;
    const period = width / dripRate;

    for (let x = 0; x < width; x += 2) {
      const posInPeriod = (x % period) / period;
      const drip = Math.exp(-Math.pow((posInPeriod - 0.5) / 0.06, 2));
      const y = midY - amp * maxAmp * drip + Math.sin(x * 0.15) * 0.05 * maxAmp;
      points.push({ x, y });
    }
    return points;
  }

  /**
   * Sensor flicker — mostly-dead sensor (IS a threat!)
   * Long flatline with occasional tiny blips. No signal ≠ safe — the SENSOR is broken.
   */
  function sensorFlicker(width, height, amp = 0.25, noise = 0.2) {
    const points = [];
    const midY = height / 2;
    const maxAmp = midY * 0.8;

    for (let x = 0; x < width; x += 2) {
      const raw = Math.sin(x * 12.9898) * 43758.5453;
      const frac = raw - Math.floor(raw);
      let y = midY;
      // Occasional flicker blips (deterministic)
      if (frac < 0.12) {
        y = midY + (frac / 0.12 - 0.5) * 2 * amp * maxAmp;
      }
      // Tiny baseline static so it's not a perfect line
      y += Math.sin(x * 0.9) * 0.03 * maxAmp;
      points.push({ x, y });
    }
    return points;
  }

  return {
    smoothSine,
    leakSpike,
    compositeWave,
    noisySafe,
    createLiveWave,
    thresholdWave,
    getYAtX,
    checkThreshold,
    // Edge cases
    rhythmicPulse,
    deepRumble,
    staticBurst,
    erraticMix,
    cyclicalPulse,
    pressureDamped,
    // Edge cases (L3 expansion)
    waterHammer,
    trafficVibration,
    corrosionDrip,
    sensorFlicker
  };
})();

window.Waveforms = Waveforms;
