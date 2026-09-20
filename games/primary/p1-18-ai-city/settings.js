/**
 * settings.js — Settings panel (speech rate, volume, voice, mute, mic)
 */
const Settings = (() => {
  'use strict';

  const DEFAULTS = { rate: 0.85, volume: 0.9, voice: '', muted: false, mic: true };
  let vals = { ...DEFAULTS };
  let voices = [];

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem('ai-city-settings-p1'));
      if (saved) vals = { ...DEFAULTS, ...saved };
    } catch (e) {}
    // Ensure mic is true by default if not set
    if (vals.mic === undefined) vals.mic = true;
  }
  function save() {
    try { localStorage.setItem('ai-city-settings-p1', JSON.stringify(vals)); } catch (e) {}
  }

  function init() {
    load();
    const rateEl = document.getElementById('speech-rate');
    const volEl = document.getElementById('speech-volume');
    const voiceEl = document.getElementById('voice-select');
    const muteEl = document.getElementById('mute-toggle');
    const micEl = document.getElementById('mic-toggle');

    if (rateEl) {
      rateEl.value = vals.rate;
      document.getElementById('rate-val').textContent = vals.rate.toFixed(2) + '×';
      rateEl.addEventListener('input', () => {
        vals.rate = parseFloat(rateEl.value);
        document.getElementById('rate-val').textContent = vals.rate.toFixed(2) + '×';
        save();
      });
    }
    if (volEl) {
      volEl.value = vals.volume;
      document.getElementById('volume-val').textContent = Math.round(vals.volume * 100) + '%';
      volEl.addEventListener('input', () => {
        vals.volume = parseFloat(volEl.value);
        document.getElementById('volume-val').textContent = Math.round(vals.volume * 100) + '%';
        save();
      });
    }
    if (voiceEl) {
      voiceEl.value = vals.voice;
      voiceEl.addEventListener('change', () => { vals.voice = voiceEl.value; save(); });
      if (speechSynthesis) {
        speechSynthesis.getVoices(); // prime
        setTimeout(populateVoices, 200);
        speechSynthesis.onvoiceschanged = populateVoices;
      }
      function populateVoices() {
        voices = speechSynthesis.getVoices();
        const current = voiceEl.value;
        voiceEl.innerHTML = '<option value="">Default</option>' +
          voices.map(v => `<option value="${v.name}" ${v.name === current ? 'selected' : ''}>${v.name}</option>`).join('');
      }
    }
    if (muteEl) { muteEl.checked = vals.muted; muteEl.addEventListener('change', () => { vals.muted = muteEl.checked; save(); }); }
    if (micEl) { micEl.checked = vals.mic; micEl.addEventListener('change', () => { vals.mic = micEl.checked; save(); }); }

    // Open/close
    document.getElementById('settings-toggle')?.addEventListener('click', () => {
      document.getElementById('settings-overlay').style.display = 'flex';
    });
    document.getElementById('settings-close')?.addEventListener('click', () => {
      document.getElementById('settings-overlay').style.display = 'none';
    });
  }

  function get(key) { return vals[key]; }

  return { init, get };
})();
