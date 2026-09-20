/**
 * settings.js — Structured Settings module with localStorage persistence
 * Subsurface Signal Decoder
 * Controls: speech rate, volume, voice selection, mute toggle, mic toggle
 */
const Settings = (() => {
  'use strict';

  const STORAGE_KEY = 'subsurface-decoder-settings';
  const DEFAULTS = { rate: 0.9, volume: 0.9, voiceURI: '', muted: false, micEnabled: true };
  let current = { ...DEFAULTS };
  let onChangeCallback = null;
  let overlayEl = null;
  let rateSlider = null;
  let rateValue = null;
  let volumeSlider = null;
  let volumeValue = null;
  let voiceSelect = null;
  let muteToggle = null;
  let micToggle = null;

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

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) close();
    });

    populateVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }

    if (rateSlider) {
      rateSlider.addEventListener('input', () => {
        current.rate = parseFloat(rateSlider.value);
        if (rateValue) rateValue.textContent = current.rate.toFixed(1) + 'x';
        save();
        notifyChange();
      });
    }

    if (volumeSlider) {
      volumeSlider.addEventListener('input', () => {
        current.volume = parseFloat(volumeSlider.value);
        if (volumeValue) volumeValue.textContent = Math.round(current.volume * 100) + '%';
        save();
        notifyChange();
      });
    }

    if (voiceSelect) {
      voiceSelect.addEventListener('change', () => {
        current.voiceURI = voiceSelect.value;
        save();
        notifyChange();
      });
    }

    if (muteToggle) {
      muteToggle.addEventListener('change', () => {
        current.muted = muteToggle.checked;
        save();
        notifyChange();
      });
    }

    if (micToggle) {
      micToggle.addEventListener('change', () => {
        current.micEnabled = micToggle.checked;
        save();
        notifyChange();
        // Restart STT when mic toggled
        if (typeof Conversation !== 'undefined' && Conversation.restartSTT) {
          Conversation.restartSTT();
        }
      });
    }

    applyToUI();
  }

  function populateVoices() {
    if (!voiceSelect || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    const savedVal = voiceSelect.value;
    voiceSelect.innerHTML = '';
    const defOpt = document.createElement('option');
    defOpt.value = '';
    defOpt.textContent = 'Default (System)';
    voiceSelect.appendChild(defOpt);
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = v.name + ' (' + v.lang + ')';
      voiceSelect.appendChild(opt);
    });
    if (savedVal) voiceSelect.value = savedVal;
  }

  function applyToUI() {
    if (rateSlider) rateSlider.value = current.rate;
    if (rateValue) rateValue.textContent = current.rate.toFixed(1) + 'x';
    if (volumeSlider) volumeSlider.value = current.volume;
    if (volumeValue) volumeValue.textContent = Math.round(current.volume * 100) + '%';
    if (voiceSelect && current.voiceURI) voiceSelect.value = current.voiceURI;
    if (muteToggle) muteToggle.checked = current.muted;
    if (micToggle) micToggle.checked = current.micEnabled;
  }

  function open() {
    if (!overlayEl) return;
    load();
    applyToUI();
    if (window.speechSynthesis) populateVoices();
    overlayEl.classList.remove('hidden');
  }

  function close() {
    if (!overlayEl) return;
    overlayEl.classList.add('hidden');
  }

  function load() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) current = { ...DEFAULTS, ...JSON.parse(s) };
    } catch (e) { /* ignore */ }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch (e) { /* ignore */ }
  }

  function onChange(cb) { onChangeCallback = cb; }
  function notifyChange() { if (onChangeCallback) onChangeCallback({ ...current }); }

  function getRate() { return current.rate; }
  function getVolume() { return current.volume; }
  function getVoiceURI() { return current.voiceURI; }
  function isMuted() { return current.muted; }
  function isMicEnabled() { return current.micEnabled; }
  function getAll() { return { ...current }; }

  return {
    init, open, close, getAll,
    getRate, getVolume, getVoiceURI,
    isMuted, isMicEnabled,
    onChange
  };
})();
