/**
 * audio.js — Sound effects for Passport Budget Allocator
 * Uses Web Audio API OscillatorNode for simple sounds.
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
      // Silently fail
    }
  }

  function playProcess() {
    // Click sound when citizen is processed
    playTone(800, 0.06, 'square', 0.08, false);
  }

  function playToggle() {
    // Soft click when toggling a checkbox
    playTone(600, 0.04, 'sine', 0.06, false);
  }

  function playComplete(success) {
    if (success) {
      // Ascending arpeggio
      playTone(523, 0.12, 'sine', 0.12, true);
      setTimeout(() => playTone(659, 0.12, 'sine', 0.12, true), 100);
      setTimeout(() => playTone(784, 0.2, 'sine', 0.12, true), 200);
    } else {
      // Descending
      playTone(400, 0.15, 'triangle', 0.1, true);
      setTimeout(() => playTone(300, 0.25, 'triangle', 0.1, true), 120);
    }
  }

  function playBudgetWarning() {
    // Alert beep
    playTone(440, 0.1, 'square', 0.1, false);
    setTimeout(() => playTone(350, 0.15, 'square', 0.1, false), 120);
  }

  function playNovaThink() {
    // Gentle thinking pulse
    playTone(1200, 0.08, 'sine', 0.05, false);
  }

  function playButtonClick() {
    playTone(500, 0.05, 'sine', 0.07, false);
  }

  return {
    playProcess, playToggle, playComplete,
    playBudgetWarning, playNovaThink, playButtonClick
  };
})();
