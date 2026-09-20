/* =========================================================================
   settings.js — settings modal (rate / volume / voice / mute / mic) with
   localStorage persistence, plus session-metric readouts. Emits changes to
   Flux via a callback so speech settings apply live.
   ========================================================================= */
const Settings = (() => {
  'use strict';

  const KEY = 'tc_settings_v1';
  const defaults = {
    rate: 0.9,
    volume: 90,      // 0..100
    voiceURI: '',
    mute: false,
    mic: true
  };
  let state = Object.assign({}, defaults);
  let onChange = () => {};

  // session metrics (not persisted)
  const metrics = { utterances: 0, totalResponseMs: 0, responses: 0, confidenceSum: 0, confidenceN: 0, segments: 0 };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = Object.assign({}, defaults, JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function get() { return Object.assign({}, state); }

  function apply() {
    SFX.setEnabled(!state.mute);
    SFX.setVolume(state.volume / 100);
    onChange(get());
  }

  /* ---- Voice list population ---- */
  function populateVoices(selectEl) {
    if (!selectEl || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices() || [];
    // Prefer English, child-friendly-ish voices first
    const en = voices.filter((v) => /en(-|_)/i.test(v.lang) || /^en/i.test(v.lang));
    const list = en.length ? en : voices;
    selectEl.innerHTML = '';
    const auto = document.createElement('option');
    auto.value = ''; auto.textContent = 'Automatic';
    selectEl.appendChild(auto);
    list.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      selectEl.appendChild(opt);
    });
    selectEl.value = state.voiceURI || '';
  }

  /* ---- Metrics helpers ---- */
  const Metrics = {
    utterance() { metrics.utterances++; refresh(); },
    segment() { metrics.segments++; refresh(); },
    response(ms) { metrics.totalResponseMs += ms; metrics.responses++; refresh(); },
    confidence(c) { if (typeof c === 'number' && c > 0) { metrics.confidenceSum += c; metrics.confidenceN++; refresh(); } }
  };
  function refresh() {
    const u = document.getElementById('metricUtterances');
    const r = document.getElementById('metricResponse');
    const c = document.getElementById('metricConfidence');
    const s = document.getElementById('metricSegments');
    if (u) u.textContent = metrics.utterances;
    if (r) r.textContent = metrics.responses ? Math.round(metrics.totalResponseMs / metrics.responses) : 0;
    if (c) c.textContent = metrics.confidenceN ? Math.round(100 * metrics.confidenceSum / metrics.confidenceN) + '%' : '–';
    if (s) s.textContent = metrics.segments;
  }

  /* ---- Wire up the modal DOM ---- */
  function bind(cb) {
    onChange = cb || onChange;
    load();

    const modal = document.getElementById('settingsModal');
    const btnOpen = document.getElementById('btnSettings');
    const btnClose = document.getElementById('btnCloseSettings');
    const rate = document.getElementById('setRate');
    const rateVal = document.getElementById('setRateVal');
    const vol = document.getElementById('setVolume');
    const volVal = document.getElementById('setVolumeVal');
    const voice = document.getElementById('setVoice');
    const mute = document.getElementById('setMute');
    const mic = document.getElementById('setMic');
    const reset = document.getElementById('btnResetProgress');

    // init controls from state
    rate.value = state.rate; rateVal.textContent = state.rate + '×';
    vol.value = state.volume; volVal.textContent = state.volume + '%';
    mute.checked = state.mute;
    mic.checked = state.mic;

    populateVoices(voice);
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => populateVoices(voice);
    }

    const open = (e) => {
      // FIX 1: never let a Settings click bubble/propagate into level navigation.
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      // FIX 2: settings & transcript are mutually exclusive — close the drawer first.
      const drawer = document.getElementById('transcriptDrawer');
      if (drawer) drawer.hidden = true;
      modal.hidden = false;
      refresh();
    };
    const close = () => { modal.hidden = true; };
    btnOpen.addEventListener('click', open);
    btnClose.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    rate.addEventListener('input', () => { state.rate = parseFloat(rate.value); rateVal.textContent = state.rate.toFixed(2).replace(/0$/, '') + '×'; save(); apply(); });
    vol.addEventListener('input', () => { state.volume = parseInt(vol.value, 10); volVal.textContent = state.volume + '%'; save(); apply(); });
    voice.addEventListener('change', () => { state.voiceURI = voice.value; save(); apply(); });
    mute.addEventListener('change', () => { state.mute = mute.checked; save(); apply(); });
    mic.addEventListener('change', () => { state.mic = mic.checked; save(); apply(); });

    reset.addEventListener('click', () => {
      if (window.confirm('Reset all of Flux\'s training progress?')) {
        try { localStorage.removeItem('tc_progress_v1'); } catch (e) {}
        location.reload();
      }
    });

    apply();
  }

  return { bind, get, Metrics, refreshMetrics: refresh };
})();
