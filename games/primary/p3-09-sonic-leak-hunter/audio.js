/**
 * audio.js — Web Audio SFX for Sonic Leak Hunter
 * 
 * Sound effects using the Web Audio API:
 * - drip: subtle water drop
 * - alarm: false alarm alert
 * - success: level complete fanfare
 * - fail: wrong answer / water loss
 * - deploy: Piper scanning deployment
 * - click: UI interaction feedback
 * 
 * All sounds are synthetic — no external audio files needed.
 */

const AudioFX = (() => {
  let audioCtx = null;
  let muted = false;

  function getCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not available');
        return null;
      }
    }
    // Resume if suspended (autoplay policy)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function setMuted(m) { muted = m; }
  function isMuted() { return muted; }

  /**
   * Play a simple tone
   */
  function playTone(freq, duration, type = 'sine', volume = 0.15, rampDown = true) {
    if (muted) return;
    const ctx = getCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    if (rampDown) {
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    }
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  /**
   * Play noise burst
   */
  function playNoise(duration, volume = 0.08) {
    if (muted) return;
    const ctx = getCtx();
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i * 3 / bufferSize);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }

  // ─── SFX Functions ────────────────────────────

  function drip() {
    playTone(800, 0.15, 'sine', 0.1);
    setTimeout(() => playTone(600, 0.1, 'sine', 0.08), 100);
  }

  function alarm() {
    playTone(440, 0.3, 'square', 0.1);
    setTimeout(() => playTone(440, 0.3, 'square', 0.1), 350);
    setTimeout(() => playTone(440, 0.3, 'square', 0.1), 700);
  }

  function success() {
    playTone(523, 0.15, 'sine', 0.12);
    setTimeout(() => playTone(659, 0.15, 'sine', 0.12), 150);
    setTimeout(() => playTone(784, 0.2, 'sine', 0.12), 300);
    setTimeout(() => playTone(1047, 0.35, 'sine', 0.15), 450);
  }

  function fail() {
    playTone(200, 0.4, 'sawtooth', 0.1);
    setTimeout(() => playTone(150, 0.3, 'sawtooth', 0.08), 200);
  }

  function deploy() {
    // Rising sweep
    const ctx = getCtx();
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.8);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.0);
  }

  function click() {
    playTone(1000, 0.05, 'sine', 0.05, false);
  }

  function correctTap() {
    playTone(660, 0.1, 'sine', 0.1);
    setTimeout(() => playTone(880, 0.12, 'sine', 0.1), 80);
  }

  function wrongTap() {
    playNoise(0.2, 0.06);
  }

  function waterLoss() {
    // Descending "glug glug" sound
    playTone(400, 0.2, 'triangle', 0.1);
    setTimeout(() => playTone(300, 0.2, 'triangle', 0.1), 200);
    setTimeout(() => playTone(200, 0.3, 'triangle', 0.1), 400);
    setTimeout(() => playTone(100, 0.4, 'triangle', 0.08), 600);
    // Bubbles
    setTimeout(() => playNoise(0.3, 0.04), 800);
  }

  return {
    setMuted,
    isMuted,
    drip,
    alarm,
    success,
    fail,
    deploy,
    click,
    correctTap,
    wrongTap,
    waterLoss
  };
})();

window.AudioFX = AudioFX;
