// sound.js — zero-dependency Web Audio SFX generator.
// No external files, no downloads — retro-futuristic beeps synthesized live.
// All functions handle the browser autoplay restriction (AudioContext suspended
// until a user gesture) by resuming on demand.

let ctx = null;
let _gestureWired = false;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Explicitly unlock audio from a direct user gesture (tap/keydown). iOS Safari
 * blocks ctx.resume() when it is called asynchronously (e.g. inside a timer or
 * fetch callback), so every app should call initAudio() on its first "Start /
 * Continue" button press. Safe to call more than once.
 */
export function initAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') {
    return c.resume().catch(() => {});
  }
  return Promise.resolve();
}

/**
 * One-time safety net: the very first tap/click/keydown anywhere unlocks the
 * AudioContext, so a beep triggered slightly later (mission card, alert timer)
 * is never silently blocked. This runs once per page load.
 */
export function armAudioGestureUnlock() {
  if (_gestureWired || typeof window === 'undefined') return;
  _gestureWired = true;
  const unlock = () => {
    initAudio();
    // Keep the listeners: subsequent beeps may come after a long idle where the
    // context re-suspends, and re-arming is harmless.
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

// A single beep with a frequency envelope (optional second tone for dual beeps).
function beep(freq = 880, duration = 0.1, type = 'sine', vol = 0.15, freq2 = null, delay2 = 0) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime;

  function tone(f, start, dur) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, start);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  tone(freq, t0, duration);
  if (freq2) tone(freq2, t0 + delay2, duration);
}

// Octopus-card style dual-tone "ka-ching" on mission accept.
export function playMissionAccept() {
  beep(880, 0.09, 'sine', 0.14);
  beep(1320, 0.14, 'sine', 0.12, null, 0.08);
}

// Subtle low thud on footstep.
export function playFootstep() {
  beep(120, 0.05, 'triangle', 0.06);
}

// Cheerful rising arpeggio on mission complete.
export function playMissionComplete() {
  beep(660, 0.1, 'sine', 0.12);
  beep(880, 0.1, 'sine', 0.12, null, 0.09);
  beep(1320, 0.16, 'sine', 0.12, null, 0.18);
}

// Little UI tap.
export function playTap() {
  beep(520, 0.04, 'square', 0.05);
}

// Holographic briefing alert — rising ping when the department terminal turns on.
export function playAlert() {
  beep(440, 0.1, 'sine', 0.14);
  beep(880, 0.12, 'sine', 0.12, null, 0.08);
}

// Department decision feedback: two ascending notes when right, soft descending when wrong.
export function playDecision(correct) {
  if (correct) {
    beep(523, 0.12, 'sine', 0.14);
    beep(659, 0.16, 'sine', 0.12, null, 0.1);
  } else {
    beep(440, 0.12, 'sine', 0.12);
    beep(330, 0.16, 'sine', 0.1, null, 0.1);
  }
}

// Confirm / continue beep when moving on to the mission.
export function playConfirm() {
  beep(880, 0.08, 'sine', 0.12);
}
