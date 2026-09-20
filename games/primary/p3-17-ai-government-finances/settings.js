/**
 * settings.js — Settings panel for Compute Fee Meter
 * Controls: speech rate, volume, voice selection, mute, mic toggle.
 * Persists to localStorage.
 */
const Settings = (() => {
  'use strict';

  const STORAGE_KEY = 'compute-fee-meter-settings';
  const DEFAULTS = {
    rate: 0.85,
    volume: 0.9,
    voiceURI: '',
    muted: false,
    micEnabled: true
  };

  let current = { ...DEFAULTS };
  let onChangeCallback = null;

  // Session metrics
  let utterancesProcessed = 0;
  let totalResponseTime = 0;
  let sttConfidenceSum = 0;
  let sttConfidenceCount = 0;
  let vadSegments = 0;

  // DOM refs
  let overlayEl, rateSlider, rateValue, volumeSlider, volumeValue;
  let voiceSelect, muteToggle, micToggle;

  function init() {
    load();

    overlayEl = document.getElementById('settings-overlay');
    if (!overlayEl) return;

    rateSlider = document.getElementById('speech-rate');
    rateValue = document.getElementById('rate-value');
    volumeSlider = document.getElementById('speech-volume');
    volumeValue = document.getElementById('volume-value');
    voiceSelect = document.getElementById('voice-select');
    muteToggle = document.getElementById('mute-toggle');
    micToggle = document.getElementById('mic-toggle');

    // Settings toggle button (gear icon)
    const gearBtn = document.getElementById('settings-toggle');
    if (gearBtn) gearBtn.addEventListener('click', open);

    // Close button
    const closeBtn = overlayEl.querySelector('.settings-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    // Click outside to close
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) close();
    });

    // Populate voices
    populateVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }

    // Event listeners
    if (rateSlider) rateSlider.addEventListener('input', () => {
      current.rate = parseFloat(rateSlider.value);
      if (rateValue) rateValue.textContent = current.rate.toFixed(1) + 'x';
      save(); notifyChange();
    });
    if (volumeSlider) volumeSlider.addEventListener('input', () => {
      current.volume = parseFloat(volumeSlider.value);
      if (volumeValue) volumeValue.textContent = Math.round(current.volume * 100) + '%';
      save(); notifyChange();
    });
    if (voiceSelect) voiceSelect.addEventListener('change', () => {
      current.voiceURI = voiceSelect.value;
      save(); notifyChange();
    });
    if (muteToggle) muteToggle.addEventListener('change', () => {
      current.muted = muteToggle.checked;
      save(); notifyChange();
    });
    if (micToggle) micToggle.addEventListener('change', () => {
      current.micEnabled = micToggle.checked;
      save(); notifyChange();
    });

    applyToUI();
  }

  function populateVoices() {
    if (!voiceSelect || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    const val = voiceSelect.value;
    voiceSelect.innerHTML = '';

    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'Default (System)';
    voiceSelect.appendChild(def);

    // Filter to English voices for simplicity
    const enVoices = voices.filter(v => v.lang.startsWith('en'));
    if (enVoices.length === 0) enVoices.push(...voices);

    enVoices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = v.name + ' (' + v.lang + ')';
      voiceSelect.appendChild(opt);
    });

    if (val) {
      try { voiceSelect.value = val; } catch(e) {}
    }
  }

  function applyToUI() {
    if (rateSlider) rateSlider.value = current.rate;
    if (rateValue) rateValue.textContent = current.rate.toFixed(1) + 'x';
    if (volumeSlider) volumeSlider.value = current.volume;
    if (volumeValue) volumeValue.textContent = Math.round(current.volume * 100) + '%';
    if (voiceSelect && current.voiceURI) {
      try { voiceSelect.value = current.voiceURI; } catch(e) {}
    }
    if (muteToggle) muteToggle.checked = current.muted;
    if (micToggle) micToggle.checked = current.micEnabled;

    // Update session metrics display
    updateSessionMetrics();
  }

  function updateSessionMetrics() {
    const metricsEl = document.getElementById('session-metrics');
    if (!metricsEl) return;

    const avgResp = utterancesProcessed > 0 ?
      Math.round(totalResponseTime / utterancesProcessed) : 0;
    const avgConf = sttConfidenceCount > 0 ?
      Math.round((sttConfidenceSum / sttConfidenceCount) * 100) : 0;

    metricsEl.innerHTML =
      '<div class="sm-label">Session</div>' +
      '<div class="sm-row"><span>Utterances</span><span>' + utterancesProcessed + '</span></div>' +
      '<div class="sm-row"><span>Avg Response</span><span>' + avgResp + 'ms</span></div>' +
      '<div class="sm-row"><span>STT Confidence</span><span>' + avgConf + '%</span></div>' +
      '<div class="sm-row"><span>VAD Segments</span><span>' + vadSegments + '</span></div>';
  }

  function recordUtterance(responseTimeMs, confidence) {
    utterancesProcessed++;
    totalResponseTime += responseTimeMs;
    if (confidence !== undefined && confidence !== null) {
      sttConfidenceSum += confidence;
      sttConfidenceCount++;
    }
  }

  function recordVadSegment() {
    vadSegments++;
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
    } catch(e) {}
  }

  function onChange(cb) { onChangeCallback = cb; }

  function notifyChange() {
    if (onChangeCallback) onChangeCallback({ ...current });
  }

  function getRate() { return current.rate; }
  function getVolume() { return current.volume; }
  function getVoiceURI() { return current.voiceURI; }
  function isMuted() { return current.muted; }
  function isMicEnabled() { return current.micEnabled; }
  function getAll() { return { ...current }; }

  return {
    init, open, close,
    getAll, getRate, getVolume, getVoiceURI, isMuted, isMicEnabled,
    onChange,
    recordUtterance, recordVadSegment
  };
})();
