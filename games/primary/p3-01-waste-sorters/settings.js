/**
 * settings.js — Settings panel with voice preferences
 */
const Settings = (() => {
  'use strict';

  const STORAGE_KEY = 'recycling-annotator-settings';
  const DEFAULTS = { rate: 0.85, volume: 0.9, voiceURI: '', muted: false, micEnabled: true };
  let current = { ...DEFAULTS };
  let onChangeCallback = null;
  let overlayEl = null, rateSlider = null, rateValue = null, volumeSlider = null, volumeValue = null, voiceSelect = null, muteToggle = null, micToggle = null;

  function init() {
    load();
    overlayEl = document.getElementById('settings-modal');
    if (!overlayEl) return;

    rateSlider = document.getElementById('speech-rate');
    rateValue = document.getElementById('rate-value');
    volumeSlider = document.getElementById('speech-volume');
    volumeValue = document.getElementById('volume-value');
    voiceSelect = document.getElementById('voice-select');
    muteToggle = document.getElementById('mute-toggle');
    micToggle = document.getElementById('mic-toggle');

    const gearBtn = document.getElementById('settings-toggle');
    if (gearBtn) gearBtn.addEventListener('click', open);

    const closeBtn = overlayEl.querySelector('.modal-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', close);

    overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) close(); });

    populateVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = populateVoices;

    if (rateSlider) rateSlider.addEventListener('input', () => { current.rate = parseFloat(rateSlider.value); if (rateValue) rateValue.textContent = current.rate.toFixed(1); save(); notifyChange(); });
    if (volumeSlider) volumeSlider.addEventListener('input', () => { current.volume = parseFloat(volumeSlider.value); if (volumeValue) volumeValue.textContent = Math.round(current.volume * 100) + '%'; save(); notifyChange(); });
    if (voiceSelect) voiceSelect.addEventListener('change', () => { current.voiceURI = voiceSelect.value; save(); notifyChange(); });
    if (muteToggle) muteToggle.addEventListener('change', () => { current.muted = muteToggle.checked; save(); notifyChange(); });
    if (micToggle) micToggle.addEventListener('change', () => { current.micEnabled = micToggle.checked; save(); notifyChange(); });

    applyToUI();
  }

  function populateVoices() {
    if (!voiceSelect || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    const val = voiceSelect.value;
    voiceSelect.innerHTML = '';
    const def = document.createElement('option');
    def.value = ''; def.textContent = 'Default (System)';
    voiceSelect.appendChild(def);
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI; opt.textContent = v.name + ' (' + v.lang + ')';
      voiceSelect.appendChild(opt);
    });
    if (val) voiceSelect.value = val;
  }

  function applyToUI() {
    if (rateSlider) rateSlider.value = current.rate;
    if (rateValue) rateValue.textContent = current.rate.toFixed(1);
    if (volumeSlider) volumeSlider.value = current.volume;
    if (volumeValue) volumeValue.textContent = Math.round(current.volume * 100) + '%';
    if (voiceSelect && current.voiceURI) voiceSelect.value = current.voiceURI;
    if (muteToggle) muteToggle.checked = current.muted;
    if (micToggle) micToggle.checked = current.micEnabled;
  }

  function open() { if (!overlayEl) return; load(); applyToUI(); if (window.speechSynthesis) populateVoices(); overlayEl.classList.add('open'); }
  function close() { if (!overlayEl) return; overlayEl.classList.remove('open'); }
  function load() { try { const s = localStorage.getItem(STORAGE_KEY); if (s) current = { ...DEFAULTS, ...JSON.parse(s) }; } catch(e) {} }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch(e) {} }
  function onChange(cb) { onChangeCallback = cb; }
  function notifyChange() { if (onChangeCallback) onChangeCallback({ ...current }); }

  function getRate() { return current.rate; }
  function getVolume() { return current.volume; }
  function getVoiceURI() { return current.voiceURI; }
  function isMuted() { return current.muted; }
  function isMicEnabled() { return current.micEnabled; }
  function getAll() { return { ...current }; }

  return { init, open, close, getAll, getRate, getVolume, getVoiceURI, isMuted, isMicEnabled, onChange };
})();
