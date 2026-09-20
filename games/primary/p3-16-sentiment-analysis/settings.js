/**
 * settings.js — Settings panel with voice preferences
 *
 * ⚙️ icon opens a modal with: speech rate, volume, voice selector,
 * mute toggle, mic toggle. Settings persist in localStorage.
 */
const Settings = (() => {
  'use strict';

  const STORAGE_KEY = 'civic-router-settings';
  const DEFAULTS = {
    rate: 0.85,
    volume: 0.9,
    voiceURI: '',
    muted: false,
    micEnabled: true,
    debugMode: false,
    storyMode: true,
  };

  let current = { ...DEFAULTS };
  let overlayEl = null;
  let rateSlider = null, rateValue = null;
  let volumeSlider = null, volumeValue = null;
  let voiceSelect = null;
  let muteToggle = null, micToggle = null;

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

    // Open/close handlers
    const gearBtn = document.getElementById('settings-toggle');
    if (gearBtn) gearBtn.addEventListener('click', open);

    const closeBtn = overlayEl.querySelector('.modal-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', close);

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) close();
    });

    // Populate voice list
    populateVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }

    // Bind controls
    if (rateSlider) {
      rateSlider.addEventListener('input', () => {
        current.rate = parseFloat(rateSlider.value);
        if (rateValue) rateValue.textContent = current.rate.toFixed(1) + 'x';
        save();
      });
    }
    if (volumeSlider) {
      volumeSlider.addEventListener('input', () => {
        current.volume = parseFloat(volumeSlider.value);
        if (volumeValue) volumeValue.textContent = Math.round(current.volume * 100) + '%';
        save();
      });
    }
    if (voiceSelect) {
      voiceSelect.addEventListener('change', () => {
        current.voiceURI = voiceSelect.value;
        save();
      });
    }
    if (muteToggle) {
      muteToggle.addEventListener('change', () => {
        current.muted = muteToggle.checked;
        save();
      });
    }
    if (micToggle) {
      micToggle.addEventListener('change', () => {
        current.micEnabled = micToggle.checked;
        save();
      });
    }

    applyToUI();
  }

  function populateVoices() {
    if (!voiceSelect || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    const currentVal = voiceSelect.value;
    voiceSelect.innerHTML = '';

    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'Default (System)';
    voiceSelect.appendChild(def);

    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = v.name + ' (' + v.lang + ')';
      voiceSelect.appendChild(opt);
    });

    if (currentVal) {
      try { voiceSelect.value = currentVal; } catch(e) { /* ignore */ }
    }
  }

  function applyToUI() {
    if (rateSlider) rateSlider.value = current.rate;
    if (rateValue) rateValue.textContent = current.rate.toFixed(1) + 'x';
    if (volumeSlider) volumeSlider.value = current.volume;
    if (volumeValue) volumeValue.textContent = Math.round(current.volume * 100) + '%';
    if (voiceSelect && current.voiceURI) {
      try { voiceSelect.value = current.voiceURI; } catch(e) { /* ignore */ }
    }
    if (muteToggle) muteToggle.checked = current.muted;
    if (micToggle) micToggle.checked = current.micEnabled;
  }

  function open() {
    if (!overlayEl) return;
    load();
    applyToUI();
    if (window.speechSynthesis) populateVoices();
    overlayEl.classList.add('open');
  }

  function close() {
    if (!overlayEl) return;
    overlayEl.classList.remove('open');
  }

  function load() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) current = { ...DEFAULTS, ...JSON.parse(s) };
    } catch(e) {
      current = { ...DEFAULTS };
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch(e) { /* ignore */ }
  }

  // Getters
  function getRate() { return current.rate; }
  function getVolume() { return current.volume; }
  function getVoiceURI() { return current.voiceURI; }
  function isMuted() { return current.muted; }
  function isMicEnabled() { return current.micEnabled; }
  function isDebugMode() { return current.debugMode; }
  function getStoryMode() { return current.storyMode; }
  function getAll() { return { ...current }; }

  function setStoryMode(enabled) {
    current.storyMode = enabled;
    save();
    if (window.Narrative) Narrative.setStoryMode(enabled);
  }

  function setDebugMode(on) {
    current.debugMode = on;
    save();
  }

  return {
    init, open, close, load, save,
    getAll, getRate, getVolume, getVoiceURI,
    isMuted, isMicEnabled, isDebugMode, getStoryMode,
    setDebugMode, setStoryMode,
  };
})();
