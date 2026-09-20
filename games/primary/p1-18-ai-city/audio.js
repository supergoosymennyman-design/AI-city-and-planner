/**
 * audio.js — Sound effects for My First AI City
 * Web Audio API OscillatorNode. Silent if AudioContext unavailable.
 */
const Audio = (() => {
  'use strict';

  let ctx = null;
  function getCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function play(freq, dur, type, vol, ramp) {
    const c = getCtx();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.12, c.currentTime);
      if (ramp) gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      else gain.gain.setValueAtTime(0, c.currentTime + dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + dur);
    } catch (e) {}
  }

  function seq(notes, offset) {
    notes.forEach((n, i) => {
      setTimeout(() => play(n.f, n.d, n.t || 'sine', n.v || 0.1, true), (offset || 0) + i * (n.g || 80));
    });
  }

  const api = {
    place() { seq([{f:523,d:0.06},{f:659,d:0.06},{f:784,d:0.08}], 0); },
    connect() { play(500, 0.1, 'triangle', 0.08); setTimeout(() => play(800, 0.1, 'triangle', 0.08), 80); },
    error() { play(200, 0.15, 'sawtooth', 0.06); },
    correct() { play(880, 0.15, 'sine', 0.1, true); },
    wrong() { play(180, 0.2, 'square', 0.05); },
    splash() { play(300, 0.08, 'sawtooth', 0.04); play(500, 0.06, 'sine', 0.03); },
    complete() { seq([{f:523,d:0.1},{f:659,d:0.1},{f:784,d:0.1},{f:1047,d:0.2}], 0); },
    click() { play(600, 0.04, 'square', 0.05); },
    scan() { play(1000, 0.06, 'sine', 0.06); setTimeout(() => play(1200, 0.06, 'sine', 0.06), 100); },
    toast() { play(440, 0.08, 'sine', 0.06); },
    cityStart() { seq([{f:523,d:0.12},{f:659,d:0.12},{f:784,d:0.12},{f:1047,d:0.3}], 0); },
    star() { play(784, 0.2, 'sine', 0.1, true); setTimeout(() => play(1047, 0.3, 'sine', 0.1, true), 150); },
    crisis() { const t=setInterval(()=>{play(500,0.06,'square',0.06);play(600,0.06,'square',0.06);},150); setTimeout(()=>clearInterval(t),600); },
  };

  return api;
})();
