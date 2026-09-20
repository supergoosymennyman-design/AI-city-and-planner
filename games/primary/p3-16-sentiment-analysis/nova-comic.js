/**
 * nova-comic.js — Nova's opening comic intro (Level 0)
 *
 * A 3-panel comic strip that introduces Nova on her first day
 * at the city control center. Shows before Level 1.
 * Taps/clicks to advance through panels, then auto-starts Level 1.
 */
const NovaComic = (() => {
  'use strict';

  const PANELS = [
    {
      art: '🏙️',
      title: 'Nova\'s First Day',
      text: 'Hi! I\'m Nova 🤗 I just got hired at the City Help Center! Companies send me emails, but I have no idea what "bus" or "park" means or where they go!',
      color: '#FFB74D',
      tts: 'Hi! I\'m Nova! I just got hired at the City Help Center. Companies send me emails, but I have no idea what bus or park means or where they go!',
    },
    {
      art: '🏢',
      title: 'The Control Room',
      text: 'An email just arrived! "The bus was late again!" I see the word "bus" — but which department handles that? Transit? Parks? I need a teacher... 😅',
      color: '#7C8BFF',
      tts: 'An email just arrived! The bus was late again! I see the word bus — but which department handles that? Transit? Parks? I need a teacher!',
    },
    {
      art: '📧',
      title: 'Nova Needs Help',
      text: 'Every email also comes with a FEELING NUMBER! -5 means super angry, +5 means super happy. That tells us who needs help FIRST. But I don\'t know how to read it yet...',
      color: '#8899FF',
      tts: 'Every email also comes with a feeling number! -5 means super angry, +5 means super happy. That tells us who needs help first. But I don\'t know how to read it yet!',
    },
    {
      art: '🌟',
      title: 'You Can Teach Me!',
      text: 'You can teach me ALL 7 AI skills: Keywords, Feelings, Priority, Patterns, Tricky emails, Crisis mode, and sorting by myself! By Level 8, I\'ll sort faster than any human. Ready, teacher? 🚀',
      tip: '🧠 7 AI skills: Keywords · Sentiment · Priority · Patterns · Disambiguation · Crisis · Autonomous',
      color: '#4CAF50',
      tts: 'You can teach me all 7 AI skills: Keywords, Feelings, Priority, Patterns, Tricky emails, Crisis mode, and sorting by myself. By Level 8, I will sort faster than any human. Ready, teacher?',
    },
  ];

  let currentPanel = 0;
  let overlayEl = null;
  let panelEl = null;
  let onComplete = null;

  function init() {
    overlayEl = document.getElementById('comic-intro');
    panelEl = document.getElementById('comic-panel-0');
  }

  /**
   * Show the comic intro sequence.
   * onCompleteCallback is called when the comic is finished.
   */
  function show(onCompleteCallback) {
    if (!overlayEl || !panelEl) return;

    onComplete = onCompleteCallback || null;
    currentPanel = 0;

    // Set Nova's expression to nervous for the intro
    if (window.NovaSVG) {
      NovaSVG.setExpression('nervous');
    }

    renderPanel();
    overlayEl.classList.add('show');
  }

  /** Speak the current panel text via TTS */
  function speakPanel() {
    const panel = PANELS[currentPanel];
    if (!panel || !panel.tts) return;
    if (!window.speechSynthesis) return;
    // Cancel previous speech
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(panel.tts);
    utterance.rate = 0.85;
    utterance.volume = 0.9;
    // Try to pick a friendly voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Google UK') || v.name.includes('Samantha') || v.name.includes('Female'));
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
  }

  function renderPanel() {
    if (currentPanel >= PANELS.length) {
      finish();
      return;
    }

    const panel = PANELS[currentPanel];
    const total = PANELS.length;

    panelEl.innerHTML =
      '<div class="comic-panel-inner" style="--panel-color:' + panel.color + '">' +
      '<div class="comic-art">' + panel.art + '</div>' +
      '<div class="comic-title">' + panel.title + '</div>' +
      '<div class="comic-text">' + panel.text + '</div>' +
      '<div class="comic-progress">' +
      '<span>' + (currentPanel + 1) + '/' + total + '</span>' +
      '<div class="comic-dots">' +
      Array.from({ length: total }, (_, i) =>
        '<span class="comic-dot' + (i <= currentPanel ? ' done' : '') + (i === currentPanel ? ' current' : '') + '"></span>'
      ).join('') +
      '</div>' +
      '<span class="comic-tap">' + (currentPanel < total - 1 ? 'Tap to continue →' : 'Tap to start!') + '</span>' +
      '</div>' +
      '</div>';

    // Speak the panel text after a tiny delay to let the DOM render
    setTimeout(speakPanel, 200);
  }

  function next() {
    // Cancel any ongoing TTS
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    currentPanel++;
    if (currentPanel >= PANELS.length) {
      finish();
    } else {
      renderPanel();
    }
  }

  function finish() {
    overlayEl.classList.remove('show');
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (onComplete) onComplete();
  }

  function handleClick() {
    if (!overlayEl || !overlayEl.classList.contains('show')) return;
    next();
  }

  // ── Expose globally ──

  const api = { init, show, next, finish, handleClick };
  window.NovaComic = api;
  return api;
})();
