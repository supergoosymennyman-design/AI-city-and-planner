/**
 * settings.js — Settings modal for Sonic Leak Hunter
 * 
 * Provides:
 * - Speech rate slider (0.5–2.0)
 * - Volume slider (0–100%)
 * - Voice selector dropdown
 * - Mute toggle
 * - Mic toggle
 * - Settings persist in localStorage
 */

const Settings = (() => {
  const STORAGE_KEY = 'sonic-leak-hunter-settings';

  // Default settings
  const defaults = {
    speechRate: 0.85,
    volume: 90,
    voiceURI: '',
    muted: false,
    micEnabled: true
  };

  let current = { ...defaults };

  /**
   * Load settings from localStorage
   */
  function load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        current = { ...defaults, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
      current = { ...defaults };
    }
    return current;
  }

  /**
   * Save settings to localStorage
   */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  /**
   * Get a setting value
   */
  function get(key) {
    return current[key];
  }

  /**
   * Set a setting value and persist
   */
  function set(key, value) {
    current[key] = value;
    save();
  }

  /**
   * Get all available voices, filtered to English + child-friendly
   */
  function getVoices() {
    return new Promise((resolve) => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        resolve(filterVoices(voices));
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          resolve(filterVoices(window.speechSynthesis.getVoices()));
        };
      }
    });
  }

  function filterVoices(voices) {
    // Prefer English voices, sort child-friendly first
    return voices
      .filter(v => v.lang.startsWith('en'))
      .sort((a, b) => {
        const aChild = a.name.toLowerCase().includes('child') || a.name.toLowerCase().includes('samantha');
        const bChild = b.name.toLowerCase().includes('child') || b.name.toLowerCase().includes('samantha');
        if (aChild && !bChild) return -1;
        if (!aChild && bChild) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * Create and show the settings modal
   */
  async function show(container) {
    if (!container) return;

    const voices = await getVoices();
    const currentVoice = current.voiceURI || (voices[0]?.voiceURI || '');

    container.innerHTML = `
      <div class="settings-overlay" id="settings-overlay">
        <div class="settings-modal" role="dialog" aria-label="Settings">
          <div class="settings-header">
            <h2>⚙️ Settings</h2>
            <button class="settings-close" id="settings-close" aria-label="Close settings">✕</button>
          </div>
          
          <div class="settings-body">
            <div class="settings-group">
              <label for="setting-rate">Speech Speed: <span id="rate-value">${current.speechRate.toFixed(2)}x</span></label>
              <input type="range" id="setting-rate" min="0.5" max="2.0" step="0.05" 
                value="${current.speechRate}" aria-label="Speech rate">
            </div>

            <div class="settings-group">
              <label for="setting-volume">Volume: <span id="volume-value">${current.volume}%</span></label>
              <input type="range" id="setting-volume" min="0" max="100" step="5" 
                value="${current.volume}" aria-label="Volume">
            </div>

            <div class="settings-group">
              <label for="setting-voice">Voice:</label>
              <select id="setting-voice" aria-label="Select voice">
                ${voices.map(v => `
                  <option value="${v.voiceURI}" ${v.voiceURI === currentVoice ? 'selected' : ''}>
                    ${v.name} (${v.lang})
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="settings-group settings-toggles">
              <label class="settings-toggle">
                <input type="checkbox" id="setting-mute" ${current.muted ? 'checked' : ''}>
                <span>Mute All Sounds</span>
              </label>
              <label class="settings-toggle">
                <input type="checkbox" id="setting-mic" ${current.micEnabled ? 'checked' : ''}>
                <span>Microphone ON</span>
              </label>
            </div>

            <div class="settings-group settings-info">
              <h3>Session Stats</h3>
              <ul>
                <li>Messages: <span id="stats-messages">0</span></li>
                <li>Current Level: <span id="stats-level">-</span></li>
              </ul>
            </div>
          </div>

          <div class="settings-footer">
            <button class="settings-done" id="settings-done">Done</button>
          </div>
        </div>
      </div>
    `;

    // Show the modal
    container.style.display = 'block';

    // Bind events
    const rateSlider = container.querySelector('#setting-rate');
    const rateValue = container.querySelector('#rate-value');
    const volumeSlider = container.querySelector('#setting-volume');
    const volumeValue = container.querySelector('#volume-value');
    const voiceSelect = container.querySelector('#setting-voice');
    const muteCheck = container.querySelector('#setting-mute');
    const micCheck = container.querySelector('#setting-mic');
    const closeBtn = container.querySelector('#settings-close');
    const doneBtn = container.querySelector('#settings-done');
    const overlay = container.querySelector('#settings-overlay');

    rateSlider.addEventListener('input', () => {
      rateValue.textContent = parseFloat(rateSlider.value).toFixed(2) + 'x';
      set('speechRate', parseFloat(rateSlider.value));
    });

    volumeSlider.addEventListener('input', () => {
      volumeValue.textContent = volumeSlider.value + '%';
      set('volume', parseInt(volumeSlider.value));
    });

    voiceSelect.addEventListener('change', () => {
      set('voiceURI', voiceSelect.value);
    });

    muteCheck.addEventListener('change', () => {
      set('muted', muteCheck.checked);
      if (window.AudioFX) AudioFX.setMuted(muteCheck.checked);
    });

    micCheck.addEventListener('change', () => {
      set('micEnabled', micCheck.checked);
    });

    function hide() {
      container.style.display = 'none';
      container.innerHTML = '';
    }

    closeBtn.addEventListener('click', hide);
    doneBtn.addEventListener('click', hide);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hide();
    });

    // Update stats
    updateStats(container);
  }

  function updateStats(container) {
    const msgEl = container.querySelector('#stats-messages');
    const levelEl = container.querySelector('#stats-level');
    if (msgEl && window.Transcript) msgEl.textContent = Transcript.count();
    if (levelEl && window.Game) levelEl.textContent = Game.getCurrentLevel?.() || '-';
  }

  /**
   * Hide the settings modal
   */
  function hide(container) {
    if (container) {
      container.style.display = 'none';
      container.innerHTML = '';
    }
  }

  /**
   * Apply current speech settings to an utterance
   */
  function applyToUtterance(utterance) {
    utterance.rate = current.speechRate;
    utterance.volume = current.volume / 100;
    
    if (current.voiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.voiceURI === current.voiceURI);
      if (voice) utterance.voice = voice;
    }
  }

  return {
    load,
    save,
    get,
    set,
    show,
    hide,
    applyToUtterance,
    getVoices,
    get defaults() { return defaults; }
  };
})();

window.Settings = Settings;
