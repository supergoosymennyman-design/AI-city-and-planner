/**
 * settings.js — Settings panel for K3-03 AI Architect
 *
 * Manages TTS rate, volume, voice, mute, and mic toggle.
 * Settings persist in localStorage.
 */

var GameSettings = (() => {
  'use strict';

  const STORAGE_KEY = 'k3-03-ai-architect-settings';

  const DEFAULTS = {
    speechRate: 0.7,
    volume: 90,
    voiceURI: '',
    mute: false,
    micEnabled: true
  };

  let settings = { ...DEFAULTS };
  let onSettingsChange = null;

  function load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        settings = { ...DEFAULTS, ...parsed };
      }
    } catch (e) {
      console.warn('Settings load failed, using defaults:', e);
    }
    return { ...settings };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Settings save failed:', e);
    }
    if (onSettingsChange) onSettingsChange({ ...settings });
  }

  function set(key, value) {
    if (key in settings) {
      settings[key] = value;
      save();
    }
  }

  function getAll() {
    return { ...settings };
  }

  function onChange(callback) {
    onSettingsChange = callback;
  }

  function renderModal(container) {
    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Settings');
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="modal-content settings-panel">
        <button class="modal-close-btn" aria-label="Close settings">&times;</button>
        <h2 class="settings-title">Settings</h2>

        <div class="setting-row">
          <label for="setting-rate" class="setting-label">Speed</label>
          <div class="setting-control">
            <input type="range" id="setting-rate" min="0.5" max="2.0" step="0.05"
              value="${settings.speechRate}" aria-describedby="rate-value">
            <span id="rate-value" class="setting-value">${settings.speechRate.toFixed(2)}</span>
          </div>
        </div>

        <div class="setting-row">
          <label for="setting-volume" class="setting-label">Volume</label>
          <div class="setting-control">
            <input type="range" id="setting-volume" min="0" max="100" step="1"
              value="${settings.volume}" aria-describedby="volume-value">
            <span id="volume-value" class="setting-value">${settings.volume}%</span>
          </div>
        </div>

        <div class="setting-row">
          <label for="setting-voice" class="setting-label">Voice</label>
          <div class="setting-control">
            <select id="setting-voice" aria-label="Select voice">
              <option value="">Default voice</option>
            </select>
          </div>
        </div>

        <div class="setting-row setting-toggle-row">
          <label for="setting-mute" class="setting-label">Mute</label>
          <label class="toggle-switch">
            <input type="checkbox" id="setting-mute" ${settings.mute ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-row setting-toggle-row">
          <label for="setting-mic" class="setting-label">Microphone</label>
          <label class="toggle-switch">
            <input type="checkbox" id="setting-mic" ${settings.micEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-info">
          <p>Changes save automatically.</p>
        </div>
      </div>
    `;

    container.appendChild(modal);

    const closeBtn = modal.querySelector('.modal-close-btn');
    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });

    function populateVoices() {
      const select = modal.querySelector('#setting-voice');
      const voices = window.speechSynthesis.getVoices();
      const currentURI = settings.voiceURI;
      select.innerHTML = '<option value="">Default voice</option>';
      voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = `${v.name} (${v.lang})`;
        if (v.voiceURI === currentURI) opt.selected = true;
        select.appendChild(opt);
      });
    }

    if (window.speechSynthesis.getVoices().length > 0) {
      populateVoices();
    } else {
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }

    modal.querySelector('#setting-rate').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      set('speechRate', val);
      modal.querySelector('#rate-value').textContent = val.toFixed(2);
    });

    modal.querySelector('#setting-volume').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      set('volume', val);
      modal.querySelector('#volume-value').textContent = val + '%';
    });

    modal.querySelector('#setting-voice').addEventListener('change', (e) => {
      set('voiceURI', e.target.value);
    });

    modal.querySelector('#setting-mute').addEventListener('change', (e) => {
      set('mute', e.target.checked);
    });

    modal.querySelector('#setting-mic').addEventListener('change', (e) => {
      set('micEnabled', e.target.checked);
    });

    return modal;
  }

  function show() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'flex';
  }

  function hide() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
  }

  load();

  return {
    load,
    save,
    set,
    getAll,
    onChange,
    renderModal,
    show,
    hide,
    DEFAULTS
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameSettings };
}
