/**
 * audio.js — Web Audio SFX for Cool Grid Architect
 * All sounds are synthesized (no external files)
 */
const AudioFX = window.AudioFX = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function play(freq, duration, type = 'sine', vol = 0.15) {
    const c = getCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  }

  function place() { play(523, 0.1, 'sine', 0.12); setTimeout(() => play(659, 0.1, 'sine', 0.08), 80); }
  function correctTap() { play(660, 0.12, 'sine', 0.1); setTimeout(() => play(880, 0.15, 'sine', 0.08), 120); }
  function wrongTap() { play(200, 0.2, 'sawtooth', 0.08); }
  function error() { play(300, 0.15, 'sawtooth', 0.1); }
  function win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => play(f, 0.2, 'sine', 0.1), i * 120)); }
  function tap() { play(800, 0.04, 'square', 0.06); }

  return { place, correctTap, wrongTap, error, win, tap, getCtx };
})();
