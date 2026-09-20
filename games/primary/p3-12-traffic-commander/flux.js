/* =========================================================================
   flux.js — Flux, the passive AI traffic-controller companion.
   Responsibilities:
     • Dashboard: status badge, concept progress, live stats, confidence.
     • Conversation: continuous STT (Web Speech API), TTS (SpeechSynthesis),
       text-input fallback, and a visual state indicator.
     • PASSIVITY: Flux never speaks unprompted. It only replies when the child
       ADDRESSES it (says "Flux", asks a question, taps the avatar, or types).
   Uses the offline Intents engine — no model download, fully offline.
   ========================================================================= */
const Flux = (() => {
  'use strict';

  const PKEY = 'tc_progress_v1';

  const CONCEPTS = ['sensor', 'prediction', 'filtering', 'priority', 'automation'];
  const CONCEPT_DOT = { sensor: '🟢', prediction: '🔵', filtering: '🟣', priority: '🟠', automation: '⭐' };

  const STATUS = {
    untrained:     { badge: '🟡 UNTRAINED',    color: '#F1C40F' },
    sensing:       { badge: '🟢 SENSING',       color: '#2ECC71' },
    predicting:    { badge: '🔵 PREDICTING',    color: '#3498DB' },
    filtering:     { badge: '🟣 FILTERING',     color: '#9B59B6' },
    prioritizing:  { badge: '🟠 PRIORITIZING',  color: '#E67E22' },
    autonomous:    { badge: '⭐ AUTONOMOUS',    color: '#F39C12' },
    certified:     { badge: '🏆 DEPT. CLEARED',     color: '#F1C40F' }
  };
  const STATUS_ORDER = ['untrained', 'sensing', 'predicting', 'filtering', 'prioritizing', 'autonomous', 'certified'];

  let progress = {
    concepts: { sensor: 0, prediction: 0, filtering: 0, priority: 0, automation: 0 },
    status: 'untrained',
    levelsDone: {},
    certified: false
  };

  const stats = { vehicles: 0, correct: 0, false: 0 };

  let recognition = null;
  let listening = false;
  let micEnabled = true;
  let micAvailable = true;
  let state = 'idle';
  let level = 1;
  let contextProvider = () => ({});
  let bubbleTimer = null;
  let responseStart = 0;
  let speakSettings = { rate: 0.9, volume: 0.9, mute: false, voiceURI: '' };

  // DOM refs
  let dotEl, miniStateEl, badgeEl, speechEl, speechTextEl;

  /* ---------------- persistence ---------------- */
  function load() {
    try {
      const raw = localStorage.getItem(PKEY);
      if (raw) progress = Object.assign(progress, JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }
  function save() {
    try { localStorage.setItem(PKEY, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }

  /* ---------------- dashboard ---------------- */
  function updateDashboard() {
    // status badge
    if (badgeEl) {
      const s = STATUS[progress.status] || STATUS.untrained;
      badgeEl.textContent = s.badge;
      badgeEl.style.borderColor = s.color;
      badgeEl.style.color = s.color;
    }
    // concept rows
    document.querySelectorAll('.concept-row').forEach((row) => {
      const key = row.getAttribute('data-concept');
      const pct = progress.concepts[key] || 0;
      const fill = row.querySelector('.progress-fill');
      const dot = row.querySelector('.concept-dot');
      if (fill) fill.style.width = pct + '%';
      if (dot) dot.textContent = pct >= 100 ? CONCEPT_DOT[key] : (pct > 0 ? '🟡' : '⬜');
    });
    // stats
    setText('statVehicles', stats.vehicles);
    setText('statCorrect', stats.correct);
    setText('statFalse', stats.false);
    const conf = confidence();
    setText('statConfidenceVal', conf + '%');
    const cf = document.getElementById('confidenceFill');
    if (cf) cf.style.width = conf + '%';
  }

  function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

  function confidence() {
    const conceptAvg = CONCEPTS.reduce((s, k) => s + (progress.concepts[k] || 0), 0) / CONCEPTS.length;
    const acc = (stats.correct + stats.false) > 0 ? stats.correct / (stats.correct + stats.false) : 0;
    return Math.round(0.6 * conceptAvg + 0.4 * acc * 100);
  }

  /* ---------------- progress API (called by game) ---------------- */
  function completeConcept(key) {
    if (progress.concepts[key] != null) progress.concepts[key] = 100;
    save(); updateDashboard();
  }
  function setConceptPartial(key, pct) {
    if (progress.concepts[key] != null) progress.concepts[key] = Math.max(progress.concepts[key], Math.min(99, pct));
    updateDashboard();
  }
  function setStatus(status) {
    // never move backwards
    if (STATUS_ORDER.indexOf(status) >= STATUS_ORDER.indexOf(progress.status)) {
      progress.status = status; save(); updateDashboard();
    }
  }
  function markLevelDone(level) { progress.levelsDone[level] = true; save(); }
  function isLevelDone(level) { return !!progress.levelsDone[level]; }
  function setCertified() { progress.certified = true; setStatus('certified'); save(); updateDashboard(); }

  function addVehicles(n) { stats.vehicles += n; updateDashboard(); }
  function correctFlush() { stats.correct++; updateDashboard(); }
  function falseFlush() { stats.false++; updateDashboard(); }

  /* ---------------- state indicator ---------------- */
  function setState(s) {
    state = s;
    if (dotEl) dotEl.className = 'flux-state-dot ' + s;
    if (miniStateEl) miniStateEl.className = 'mini-state ' + s;
    if (dotEl) dotEl.title = 'Flux is ' + s;
    if (speechEl) speechEl.classList.toggle('speaking', s === 'speaking');
  }

  /* ---------------- speech bubble + TTS ---------------- */
  function showBubble(text, persist) {
    if (speechTextEl) speechTextEl.textContent = text;
    clearTimeout(bubbleTimer);
    if (!persist) bubbleTimer = setTimeout(() => {
      if (speechTextEl) speechTextEl.textContent = idlePromptText();
    }, 9000);
  }

  function idlePromptText() {
    return Intents.idlePrompts[level] || 'Tap a lane or say “Flux” for help!';
  }

  function speak(text, { silentBubble } = {}) {
    Transcript.add('flux', text);
    showBubble(text);
    if (responseStart) { Settings.Metrics.response(Date.now() - responseStart); responseStart = 0; }

    if (speakSettings.mute || !window.speechSynthesis) { setState(listening ? 'listening' : 'idle'); return; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = speakSettings.rate;
      u.volume = speakSettings.volume;
      const voices = window.speechSynthesis.getVoices();
      if (speakSettings.voiceURI) {
        const v = voices.find((vv) => vv.voiceURI === speakSettings.voiceURI);
        if (v) u.voice = v;
      }
      u.onstart = () => setState('speaking');
      u.onend = () => setState(listening ? 'listening' : 'idle');
      window.speechSynthesis.speak(u);
    } catch (e) {
      setState(listening ? 'listening' : 'idle');
    }
  }

  /* ---------------- addressing / passivity ---------------- */
  function isAddressed(text) {
    const t = text.toLowerCase().trim();
    if (t.includes('flux')) return true;
    if (/\?$/.test(t)) return true;
    // direct question / request patterns
    return /\b(what|how|why|when|which|who|should i|can you|can i|help|hint|tell me|explain|is it|are we|do i)\b/.test(t);
  }

  /* Handle an utterance. `spoken` = came from the microphone (passivity applies).
     Typed input and avatar taps are always treated as direct address. */
  function handleUtterance(text, { spoken = false } = {}) {
    text = (text || '').trim();
    if (!text) return;
    Transcript.add('child', text);
    Settings.Metrics.utterance();

    if (spoken && !isAddressed(text)) {
      // Unaddressed speech -> Flux stays SILENT (passive). Just keep listening.
      setState(listening ? 'listening' : 'idle');
      return;
    }

    responseStart = Date.now();
    setState('thinking');
    const cls = Intents.classify(text);
    const ctx = Object.assign({ level, concept: Intents.levelConcept(level), confidence: confidence() }, contextProvider(), { matched: cls.matched });
    const reply = Intents.respond(cls.intent, ctx);
    // small "thinking" beat so the state indicator is visible
    setTimeout(() => speak(reply), 260);
  }

  /* ---------------- STT setup ---------------- */
  function initSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { micAvailable = false; markMicDenied('No speech recognition — type to chat.'); return; }
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      Settings.Metrics.segment();
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          const alt = res[0];
          Settings.Metrics.confidence(alt.confidence || 0);
          handleUtterance(alt.transcript, { spoken: true });
        }
      }
    };
    recognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        micAvailable = false; micEnabled = false;
        markMicDenied('Microphone blocked — type to chat with Flux.');
      }
    };
    recognition.onend = () => {
      // Auto-restart to stay "always listening", unless mic disabled.
      if (listening && micEnabled && micAvailable) {
        try { recognition.start(); } catch (e) { /* already started */ }
      }
    };
  }

  function markMicDenied(msg) {
    const btn = document.getElementById('btnMic');
    if (btn) { btn.classList.remove('on'); btn.classList.add('denied'); btn.textContent = '🚫'; }
    setState('idle');
    const input = document.getElementById('textInput');
    if (input) input.focus();
    if (msg) showBubble(msg);
  }

  function startListening() {
    if (!recognition || !micAvailable) return;
    if (!micEnabled) return;
    try { recognition.start(); listening = true; setState('listening'); markMicOn(true); }
    catch (e) { /* already running */ listening = true; setState('listening'); }
  }
  function stopListening() {
    listening = false;
    if (recognition) { try { recognition.stop(); } catch (e) {} }
    setState('idle'); markMicOn(false);
  }
  function markMicOn(on) {
    const btn = document.getElementById('btnMic');
    if (btn && micAvailable) { btn.classList.toggle('on', on); btn.textContent = '🎤'; }
  }
  function toggleMic() {
    if (!micAvailable) { markMicDenied(); return; }
    if (listening) stopListening(); else startListening();
  }
  function setMicEnabled(on) {
    micEnabled = on;
    if (on) startListening(); else stopListening();
  }

  /* ---------------- level + context ---------------- */
  function setLevel(n) {
    level = n;
    showBubble(idlePromptText());   // visual cue only, NOT spoken (passive)
  }
  function setContextProvider(fn) { contextProvider = fn || contextProvider; }

  function applySettings(s) {
    speakSettings.rate = s.rate;
    speakSettings.volume = s.volume / 100;
    speakSettings.mute = s.mute;
    speakSettings.voiceURI = s.voiceURI;
    if (s.mic !== micEnabled) setMicEnabled(s.mic);
  }

  /* Optional one-time spoken greeting at game start (allowed by passivity rule). */
  function greet() {
    responseStart = Date.now();
    speak('Hello Commander! I am Flux. Teach me to control the traffic. Watch the bars and flush at the right time!');
  }

  /* ---------------- wire DOM ---------------- */
  function bind() {
    load();
    dotEl = document.getElementById('fluxStateDot');
    miniStateEl = document.getElementById('miniState');
    badgeEl = document.getElementById('fluxStatusBadge');
    speechEl = document.getElementById('fluxSpeech');
    speechTextEl = document.getElementById('speechText');

    // derive status from saved progress on load
    reconcileStatus();
    updateDashboard();

    // avatar tap = direct address -> offer help
    const avatar = document.getElementById('fluxAvatarMini');
    const askHelp = () => { responseStart = Date.now(); setState('thinking'); const ctx = Object.assign({ level, concept: Intents.levelConcept(level), confidence: confidence() }, contextProvider()); setTimeout(() => speak(Intents.respond('help', ctx)), 200); };
    avatar.addEventListener('click', askHelp);
    avatar.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); askHelp(); } });

    // text input
    const input = document.getElementById('textInput');
    const send = document.getElementById('btnSend');
    const doSend = () => { const v = input.value.trim(); if (!v) return; input.value = ''; handleUtterance(v, { spoken: false }); };
    send.addEventListener('click', doSend);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });

    // mic toggle
    document.getElementById('btnMic').addEventListener('click', toggleMic);

    initSpeech();
    setState('idle');
  }

  function reconcileStatus() {
    const c = progress.concepts;
    let st = 'untrained';
    if (progress.certified) st = 'certified';
    else if (c.automation >= 100) st = 'autonomous';
    else if (c.priority >= 100) st = 'prioritizing';
    else if (c.filtering >= 100) st = 'filtering';
    else if (c.prediction >= 100) st = 'predicting';
    else if (c.sensor >= 100) st = 'sensing';
    progress.status = st;
  }

  return {
    bind, greet, applySettings, setLevel, setContextProvider,
    completeConcept, setConceptPartial, setStatus, markLevelDone, isLevelDone, setCertified,
    addVehicles, correctFlush, falseFlush, updateDashboard, confidence,
    startListening, stopListening, toggleMic, setMicEnabled,
    showBubble, speak,
    get progress() { return progress; },
    get state() { return state; }
  };
})();
