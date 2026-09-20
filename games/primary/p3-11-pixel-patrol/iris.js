/* iris.js — Iris, the passive AI computer-vision companion */
const Iris = (() => {
  const PKEY = 'iris_progress_v1';
  const CONCEPTS = ['labeling', 'extraction', 'segmentation', 'detection', 'filtering'];
  const STATUS = {
    untrained:    { badge: '🟡 UNTRAINED',    color: '#F1C40F' },
    observing:    { badge: '🟢 OBSERVING',    color: '#2ECC71' },
    detecting:    { badge: '🔵 DETECTING',    color: '#3498DB' },
    classifying:  { badge: '🟠 CLASSIFYING',  color: '#E67E22' },
    expert:       { badge: '⭐ EXPERT',       color: '#00FF41' },
    certified:    { badge: '🏆 DEPT. CLEARED', color: '#F1C40F' }
  };
  const STATUS_ORDER = ['untrained', 'observing', 'detecting', 'classifying', 'expert', 'certified'];

  let progress = { concepts: {}, status: 'untrained', levelsDone: {}, certified: false };
  CONCEPTS.forEach(c => progress.concepts[c] = 0);
  const stats = { found: 0, correct: 0 };
  let state = 'idle', level = 1, contextProvider = () => ({});
  let bubbleTimer = null, speakSettings = { rate: 0.9, volume: 0.9, mute: false, voiceURI: '' };
  let dotEl, miniStateEl, badgeEl, speechEl, speechTextEl, recognition = null, listening = false, micEnabled = true;

  function load() {
    try { const r = localStorage.getItem(PKEY); if (r) progress = Object.assign(progress, JSON.parse(r)); } catch(e) {}
  }
  function save() { try { localStorage.setItem(PKEY, JSON.stringify(progress)); } catch(e) {} }

  function updateUI() {
    if (dotEl) dotEl.className = 'iris-state-dot ' + state;
    if (miniStateEl) miniStateEl.className = 'mini-state ' + state;
    if (badgeEl) {
      const s = progress.certified ? STATUS.certified : STATUS[progress.status] || STATUS.untrained;
      badgeEl.textContent = s.badge; badgeEl.style.color = s.color;
    }
    CONCEPTS.forEach(c => {
      const row = document.querySelector(`.concept-row[data-concept="${c}"]`);
      if (!row) return;
      const pct = progress.concepts[c] || 0;
      row.querySelector('.concept-dot').textContent = pct >= 100 ? '🟢' : '⬜';
      row.querySelector('.progress-fill').style.width = pct + '%';
    });
    document.getElementById('statFound').textContent = stats.found;
    document.getElementById('statCorrect').textContent = stats.correct;
    const acc = stats.found > 0 ? Math.round(stats.correct / stats.found * 100) + '%' : '—';
    document.getElementById('statAccuracy').textContent = acc;
  }

  function setStatus(s) { if (STATUS[s]) { progress.status = s; save(); updateUI(); } }
  function completeConcept(c) { if (CONCEPTS.includes(c)) { progress.concepts[c] = 100; save(); updateUI(); } }
  function markLevelDone(n) { progress.levelsDone[n] = true; save(); updateUI(); }
  function isLevelDone(n) { return !!progress.levelsDone[n]; }
  function setCertified() { progress.certified = true; save(); updateUI(); }
  function confidence() {
    const vals = CONCEPTS.map(c => progress.concepts[c] || 0);
    return Math.round(vals.reduce((a,b)=>a+b,0) / vals.length);
  }
  function addFound(n) { stats.found += n; updateUI(); }
  function addCorrect(n) { stats.correct += n; updateUI(); }

  function setLevel(n) { level = n; updateUI(); }
  function setContextProvider(fn) { contextProvider = fn; }

  function showBubble(text) { /* visual-only cue */ }
  function correctFlush() { addCorrect(1); SFX.play.success(); }
  function falseFlush() { SFX.play.wasted(); }

  function greet() {
    if (speakSettings.mute) return;
    say("Hey! I'm Iris. I see... everything. But it's all a blur. Let's train me to see properly!");
  }

  function say(text) {
    if (speakSettings.mute || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = speakSettings.rate; u.volume = speakSettings.volume;
    if (speakSettings.voiceURI) { const v = speechSynthesis.getVoices().find(v => v.name === speakSettings.voiceURI); if (v) u.voice = v; }
    state = 'speaking'; updateUI();
    u.onend = () => { state = 'idle'; updateUI(); };
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  }

  function applySettings(s) { Object.assign(speakSettings, s); }

  function startListening() {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    try {
      recognition = new SR(); recognition.continuous = true; recognition.interimResults = false; recognition.lang = 'en-US';
      recognition.onresult = (e) => {
        const text = e.results[e.results.length-1][0].transcript.trim();
        if (!text) return;
        const ctx = contextProvider();
        Transcript?.add('user', text);
        const result = Intents.match(text);
        if (result) { say(result.reply); Transcript?.add('iris', result.reply); }
      };
      recognition.onend = () => { if (listening && micEnabled) recognition?.start(); };
      recognition.start(); listening = true;
    } catch(e) { listening = false; }
  }

  function stopListening() { if (recognition) { try { recognition.stop(); } catch(e) {} listening = false; } }

  function bind() {
    dotEl = document.getElementById('irisStateDot');
    miniStateEl = document.getElementById('miniState');
    badgeEl = document.getElementById('irisStatusBadge');
    speechEl = document.getElementById('irisSpeech');
    speechTextEl = document.getElementById('speechText');
    load(); updateUI();
  }

  return { bind, setLevel, setContextProvider, showBubble, correctFlush, falseFlush,
    greet, say, applySettings, startListening, stopListening,
    completeConcept, markLevelDone, isLevelDone, setCertified, setStatus, confidence,
    addFound, addCorrect, get progress() { return progress; },
    STATUS, STATUS_ORDER };
})();
