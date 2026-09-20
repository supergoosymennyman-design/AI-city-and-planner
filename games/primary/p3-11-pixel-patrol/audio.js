/* =========================================================================
   audio.js — Web Audio sound effects for Traffic Commander.
   All sounds are synthesised (no asset files) so the game stays self-contained
   and offline. Respects the global mute/volume from Settings.
   ========================================================================= */
const SFX = (() => {
  'use strict';

  let ctx = null;
  let master = null;
  let enabled = true;
  let volume = 0.9;

  /* Lazily create the AudioContext on first user gesture (autoplay policy). */
  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      return true;
    } catch (e) {
      return false;
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /* Core tone helper: schedule an oscillator with an envelope. */
  function tone({ freq = 440, type = 'sine', dur = 0.2, gain = 0.3, when = 0, slideTo = null }) {
    if (!enabled || !ensure()) return;
    resume();
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /* Short filtered-noise burst (used for overflow / gridlock). */
  function noise({ dur = 0.3, gain = 0.25, when = 0, cutoff = 900 }) {
    if (!enabled || !ensure()) return;
    resume();
    const t0 = ctx.currentTime + when;
    const frames = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter); filter.connect(g); g.connect(master);
    src.start(t0);
  }

  /* ---- Named sound effects ---- */
  const play = {
    carArrive() { tone({ freq: 180, type: 'sine', dur: 0.18, gain: 0.18, slideTo: 120 }); },
    truckArrive() { tone({ freq: 90, type: 'sawtooth', dur: 0.3, gain: 0.2, slideTo: 60 }); },
    bikeDing() { tone({ freq: 1400, type: 'triangle', dur: 0.12, gain: 0.16 }); tone({ freq: 1900, type: 'triangle', dur: 0.1, gain: 0.12, when: 0.08 }); },
    flush() {
      tone({ freq: 520, type: 'square', dur: 0.1, gain: 0.2 });
      tone({ freq: 780, type: 'square', dur: 0.14, gain: 0.2, when: 0.09 });
    },
    success() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.22, when: i * 0.1 }));
    },
    fanfare() {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 0.28, gain: 0.24, when: i * 0.13 }));
    },
    wasted() { tone({ freq: 300, type: 'sawtooth', dur: 0.22, gain: 0.18, slideTo: 150 }); },
    alarm() {
      tone({ freq: 880, type: 'square', dur: 0.14, gain: 0.2 });
      tone({ freq: 880, type: 'square', dur: 0.14, gain: 0.2, when: 0.2 });
    },
    overflow() {
      noise({ dur: 0.5, gain: 0.3, cutoff: 700 });
      tone({ freq: 140, type: 'sawtooth', dur: 0.5, gain: 0.25, slideTo: 55 });
    },
    tick() { tone({ freq: 660, type: 'sine', dur: 0.05, gain: 0.1 }); },
    correct() { tone({ freq: 700, type: 'triangle', dur: 0.12, gain: 0.2 }); tone({ freq: 1050, type: 'triangle', dur: 0.16, gain: 0.2, when: 0.1 }); },
    wrong() { tone({ freq: 200, type: 'square', dur: 0.28, gain: 0.2, slideTo: 120 }); },
    click() { tone({ freq: 420, type: 'sine', dur: 0.05, gain: 0.12 }); }
  };

  return {
    init: ensure,
    resume,
    setEnabled(v) { enabled = !!v; },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (master) master.gain.value = volume; },
    play
  };
})();
