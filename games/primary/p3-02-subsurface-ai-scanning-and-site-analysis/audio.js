/* ============================================================
   audio.js — Sound Effects & Voice Feedback
   Subsurface Signal Decoder (P3, Age 8)
   ============================================================ */

const AudioController = (() => {
  'use strict';

  // ── Settings ──
  let sfxEnabled = true;
  let volume = 0.8;

  // ── Audio Context ──
  let audioCtx = null;

  function getContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  // ── Sound Effects ──
  function playTone(frequency, duration, type = 'sine', vol = 1) {
    if (!sfxEnabled) return;
    try {
      const ctx = getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(vol * volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // Silent fail — audio is not critical
    }
  }

  function playSelect() {
    playTone(600, 0.1, 'sine', 0.5);
  }

  function playCorrect() {
    // Rising happy tones
    playTone(523, 0.15, 'sine', 0.6);
    setTimeout(() => playTone(659, 0.15, 'sine', 0.6), 100);
    setTimeout(() => playTone(784, 0.2, 'sine', 0.6), 200);
  }

  function playWrong() {
    playTone(300, 0.15, 'square', 0.3);
    setTimeout(() => playTone(250, 0.2, 'square', 0.3), 150);
  }

  function playMark() {
    // Ping/confirmation — marks a no-build zone
    playTone(880, 0.1, 'sine', 0.5);
    setTimeout(() => playTone(1100, 0.15, 'sine', 0.5), 80);
    setTimeout(() => playTone(660, 0.08, 'sine', 0.3), 180);
  }

  function playDrill() {
    // Sweeping scan — starts a full survey confirmation
    for (let i = 0; i < 3; i++) {
      setTimeout(() => playTone(300 + i * 80, 0.15, 'sawtooth', 0.2), i * 100);
    }
    setTimeout(() => playTone(660, 0.2, 'sine', 0.4), 300);
  }

  function playTurboScan() {
    // Rising sweep — whoosh effect for turbo scan
    const duration = 0.4;
    if (!sfxEnabled) return;
    try {
      const ctx = getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + duration);
      gain.gain.setValueAtTime(0.15 * volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) { /* silent fail */ }
    // Tick at the end
    setTimeout(() => playTone(880, 0.08, 'sine', 0.4), duration * 1000);
  }

  function playLevelComplete() {
    // Celebration fanfare
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.25, 'sine', 0.5), i * 150);
    });
  }

  function playGameComplete() {
    // Big celebration
    const notes = [523, 587, 659, 784, 880, 1047, 1175, 1319];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.2, 'sine', 0.5), i * 120);
    });
    setTimeout(() => {
      const notes2 = [1047, 784, 1047, 1319];
      notes2.forEach((freq, i) => {
        setTimeout(() => playTone(freq, 0.3, 'sine', 0.6), i * 200);
      }, 1000);
    }, 1000);
  }

  function playClick() {
    playTone(440, 0.05, 'sine', 0.3);
  }

  function playTokenSpent() {
    // Sad coin drop — token spent on false alarm
    playTone(500, 0.08, 'sine', 0.3);
    setTimeout(() => playTone(350, 0.12, 'sine', 0.25), 80);
  }

  function playCollapse() {
    // Rumble + crash — building collapses
    for (let i = 0; i < 8; i++) {
      setTimeout(() => playTone(80 + Math.random() * 60, 0.1, 'sawtooth', 0.25 + Math.random() * 0.15), i * 80);
    }
    setTimeout(() => playTone(50, 0.5, 'sawtooth', 0.4), 600);
  }

  function playTrainingLabel() {
    // Positive label sound
    playTone(523, 0.1, 'sine', 0.4);
    setTimeout(() => playTone(659, 0.08, 'sine', 0.3), 100);
  }

  function playNoise() {
    // Static noise burst for noise level
    if (!sfxEnabled) return;
    try {
      const ctx = getContext();
      const bufferSize = ctx.sampleRate * 0.05;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.1;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15 * volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(ctx.currentTime);
    } catch (e) {
      // Silent fail
    }
  }

  // ── Voice Feedback (TTS) ──
  // NOTE: All TTS is now handled by conversation.js (Nova).
  // AudioController only provides sound effects.

  // ── Settings ──
  function setSfxEnabled(enabled) {
    sfxEnabled = enabled;
  }

  function setVolume(val) {
    volume = Math.max(0, Math.min(1, val));
  }

  function getSfxEnabled() { return sfxEnabled; }
  function getVolume() { return volume; }

  // ── Load voices ──
  function loadVoices() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices(); // Prime the API
    }
  }

  function getAvailableVoices() {
    try {
      return window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
    } catch (e) {
      return [];
    }
  }

  // ── Public API ──
  return {
    playSelect,
    playCorrect,
    playWrong,
    playMark,
    playDrill,
    playTurboScan,
    playLevelComplete,
    playGameComplete,
    playClick,
    playTokenSpent,
    playCollapse,
    playTrainingLabel,
    playNoise,
    setSfxEnabled,
    setVolume,
    getSfxEnabled,
    getVolume,
    loadVoices,
    getAvailableVoices,
  };
})();
