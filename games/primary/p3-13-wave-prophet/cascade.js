/* cascade.js — Cascade, the predictive traffic AI companion */
const Cascade = (() => {
  const PKEY = 'cascade_progress_v1';
  const CONCEPTS = ['prediction','coordination','anomaly','optimization'];
  const STATUS = {
    observer: { badge: '🔵 OBSERVER', color: '#3498DB' },
    reader: { badge: '🟢 READER', color: '#2ECC71' },
    predictor: { badge: '🟡 PREDICTOR', color: '#F39C12' },
    coordinator: { badge: '🟠 COORDINATOR', color: '#E67E22' },
    prophet: { badge: '⭐ PROPHET', color: '#00BFFF' },
    certified: { badge: '🏆 DEPT. CLEARED', color: '#F1C40F' }
  };
  const STATUS_ORDER = ['observer','reader','predictor','coordinator','prophet','certified'];
  let progress = { concepts: {}, status: 'observer', levelsDone: {}, certified: false };
  CONCEPTS.forEach(c => progress.concepts[c] = 0);
  const stats = { absorbed: 0, maxFlow: 0 };
  let state = 'idle', level = 1, contextProvider = () => ({});
  let speakSettings = { rate: 0.9, volume: 0.9, mute: false, voiceURI: '' };
  let dotEl, miniStateEl, badgeEl, speechEl, speechTextEl, recognition = null, listening = false, micEnabled = true;

  function load() { try { const r = localStorage.getItem(PKEY); if (r) progress = Object.assign(progress, JSON.parse(r)); } catch(e) {} }
  function save() { try { localStorage.setItem(PKEY, JSON.stringify(progress)); } catch(e) {} }

  function updateUI() {
    if (dotEl) dotEl.className = 'cascade-state-dot ' + state;
    if (miniStateEl) miniStateEl.className = 'mini-state ' + state;
    if (badgeEl) { const s = progress.certified ? STATUS.certified : STATUS[progress.status] || STATUS.observer; badgeEl.textContent = s.badge; badgeEl.style.color = s.color; }
    CONCEPTS.forEach(c => { const row = document.querySelector(`.concept-row[data-concept="${c}"]`); if (!row) return; const pct = progress.concepts[c] || 0; row.querySelector('.concept-dot').textContent = pct >= 100 ? '🟢' : '⬜'; row.querySelector('.progress-fill').style.width = pct + '%'; });
    document.getElementById('statAbsorbed').textContent = stats.absorbed;
    document.getElementById('statMaxFlow').textContent = stats.maxFlow + '%';
  }

  function setStatus(s) { if (STATUS[s]) { progress.status = s; save(); updateUI(); } }
  function completeConcept(c) { if (CONCEPTS.includes(c)) { progress.concepts[c] = 100; save(); updateUI(); } }
  function markLevelDone(n) { progress.levelsDone[n] = true; save(); updateUI(); }
  function isLevelDone(n) { return !!progress.levelsDone[n]; }
  function setCertified() { progress.certified = true; save(); updateUI(); }
  function setLevel(n) { level = n; updateUI(); }
  function setContextProvider(fn) { contextProvider = fn; }

  function say(text) {
    if (speakSettings.mute || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text); u.rate = speakSettings.rate; u.volume = speakSettings.volume;
    if (speakSettings.voiceURI) { const v = speechSynthesis.getVoices().find(v => v.name === speakSettings.voiceURI); if (v) u.voice = v; }
    state = 'speaking'; updateUI(); u.onend = () => { state = 'idle'; updateUI(); };
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  }

  function greet() { if (!speakSettings.mute) say("I'm Cascade. I can see traffic waves before they arrive. Let's predict and absorb them together!"); }
  function applySettings(s) { Object.assign(speakSettings, s); }

  function startListening() {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    try { recognition = new SR(); recognition.continuous = true; recognition.interimResults = false; recognition.lang = 'en-US';
      recognition.onresult = (e) => { const text = e.results[e.results.length-1][0].transcript.trim(); if (!text) return; const ctx = contextProvider(); Transcript?.add('user', text); const result = Intents.match(text); if (result) { say(result.reply); Transcript?.add('cascade', result.reply); } };
      recognition.onend = () => { if (listening && micEnabled) recognition?.start(); }; recognition.start(); listening = true;
    } catch(e) { listening = false; }
  }
  function stopListening() { if (recognition) { try { recognition.stop(); } catch(e) {} listening = false; } }

  function bind() {
    dotEl = document.getElementById('cascadeStateDot'); miniStateEl = document.getElementById('miniState'); badgeEl = document.getElementById('cascadeStatusBadge');
    speechEl = document.getElementById('cascadeSpeech'); speechTextEl = document.getElementById('speechText'); load(); updateUI();
  }

  return { bind, setLevel, setContextProvider, greet, say, applySettings, startListening, stopListening,
    completeConcept, markLevelDone, isLevelDone, setCertified, setStatus, get progress() { return progress; }, STATUS, STATUS_ORDER };
})();
