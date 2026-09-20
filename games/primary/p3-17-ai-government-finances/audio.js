/**
 * audio.js — Synth audio feedback for Compute Fee Meter
 * Uses Web Audio API OscillatorNode for simple sound effects.
 * No external dependencies.
 */
const Audio = (() => {
  'use strict';

  let ctx = null;

  function getCtx() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    // Resume if suspended (autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function playTone(freq, duration, type, volume, ramp) {
    const c = getCtx();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume || 0.15, c.currentTime);
      if (ramp) gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      else gain.gain.setValueAtTime(0, c.currentTime + duration);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + duration);
    } catch (e) {
      // Silently fail — audio is non-critical
    }
  }

  function playProcess() {
    // Short tick when a file is processed
    playTone(800, 0.08, 'square', 0.08, false);
  }

  function playComplete(success) {
    if (success) {
      // Ascending arpeggio for success
      playTone(523, 0.15, 'sine', 0.12, true);
      setTimeout(() => playTone(659, 0.15, 'sine', 0.12, true), 120);
      setTimeout(() => playTone(784, 0.25, 'sine', 0.12, true), 240);
    } else {
      // Descending for failure
      playTone(400, 0.2, 'triangle', 0.1, true);
      setTimeout(() => playTone(300, 0.3, 'triangle', 0.1, true), 150);
    }
  }

  function playCrash() {
    // Harsh noise burst
    playTone(150, 0.5, 'sawtooth', 0.2, true);
    setTimeout(() => playTone(100, 0.4, 'sawtooth', 0.15, true), 100);
  }

  function playSliderTick() {
    // Very subtle tick when slider moves
    playTone(1200, 0.03, 'sine', 0.04, false);
  }

  function playButtonClick() {
    playTone(600, 0.06, 'sine', 0.08, false);
  }

  return { playProcess, playComplete, playCrash, playSliderTick, playButtonClick };
})();
