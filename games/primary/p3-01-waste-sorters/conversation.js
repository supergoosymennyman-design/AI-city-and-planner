/**
 * conversation.js — Botly conversational AI
 * Passive: only responds when child says "Botly" or asks a direct question.
 * Falls back to text input when microphone unavailable.
 */
const Conversation = (() => {
  'use strict';

  const STATE = { IDLE: 'idle', LISTENING: 'listening', THINKING: 'thinking', SPEAKING: 'speaking' };
  let currentState = STATE.IDLE, recognition = null, isListening = false, isSpeaking = false;
  let silenceTimer = null, lastUtterance = '', textInputVisible = false;
  let stateDotEl = null, speechBubbleEl = null, speechTextEl = null, avatarEl = null;
  let textInputArea = null, textInput = null, textSendBtn = null;
  let onStateChange = null, onResponse = null;
  let idleTimer = null;

  function init(callbacks) {
    onStateChange = callbacks.onStateChange || null;
    onResponse = callbacks.onResponse || null;

    stateDotEl = document.getElementById('botly-state-dot');
    speechBubbleEl = document.getElementById('botly-speech');
    speechTextEl = document.getElementById('speech-text');
    avatarEl = document.getElementById('botly-avatar');
    textInputArea = document.getElementById('text-input-area');
    textInput = document.getElementById('botly-text-input');
    textSendBtn = document.getElementById('text-send-btn');

    if (avatarEl) avatarEl.addEventListener('click', () => { if (!isListening) showTextInput(); });
    if (textSendBtn && textInput) {
      textSendBtn.addEventListener('click', sendTextMessage);
      textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendTextMessage(); });
    }

    tryStartSTT();
  }

  function tryStartSTT() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !Settings.isMicEnabled()) {
      setState(STATE.IDLE);
      showTextInput();
      return;
    }
    try {
      recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let transcript = '', isFinal = false;
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
          if (event.results[i].isFinal) isFinal = true;
        }
        if (transcript.trim().length > 0) {
          lastUtterance = transcript.trim();
          setState(STATE.LISTENING);
          if (isSpeaking) cancelSpeech();
          clearTimeout(silenceTimer);
          if (isFinal) silenceTimer = setTimeout(() => processUtterance(lastUtterance), 800);
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech') return;
        if (event.error === 'not-allowed') { setState(STATE.IDLE); showTextInput(); return; }
      };

      recognition.onend = () => {
        if (!Settings.isMicEnabled() || Settings.isMuted()) return;
        try { recognition.start(); } catch(e) {}
      };

      recognition.start();
      isListening = true;
      setState(STATE.LISTENING);
      hideTextInput();
    } catch(e) {
      setState(STATE.IDLE);
      showTextInput();
    }
  }

  function processUtterance(text) {
    if (!text || !text.trim()) return;
    const trimmed = text.trim();
    Transcript.addEntry('child', trimmed);
    setState(STATE.THINKING);
    const result = Intents.classify(trimmed);
    if (!result.intentId) { setState(STATE.LISTENING); return; }
    const currentLevel = getCurrentLevel();
    const response = Intents.getResponse(result.intentId, currentLevel);
    speakResponse(response);
    if (onResponse) onResponse(trimmed, response, result.intentId);
  }

  function speakResponse(text) {
    if (!text || !text.trim()) return;
    isSpeaking = true;
    setState(STATE.SPEAKING);
    showSpeech(text);
    Transcript.addEntry('ai', text);

    const settings = Settings.getAll();
    if (settings.muted || !window.speechSynthesis) {
      isSpeaking = false;
      setTimeout(() => { setState(STATE.LISTENING); }, 2000);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = settings.rate || 0.85;
    utterance.volume = settings.volume || 0.9;
    if (settings.voiceURI) {
      const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === settings.voiceURI);
      if (voice) utterance.voice = voice;
    }
    utterance.onend = () => {
      isSpeaking = false;
      setTimeout(() => { hideSpeech(); setState(STATE.LISTENING); }, 1500);
    };
    utterance.onerror = () => { isSpeaking = false; setTimeout(() => setState(STATE.LISTENING), 1000); };
    window.speechSynthesis.speak(utterance);
  }

  function cancelSpeech() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    isSpeaking = false;
    setState(STATE.LISTENING);
  }

  function setState(state) {
    currentState = state;
    if (stateDotEl) { stateDotEl.className = 'ai-state-dot ' + state; stateDotEl.setAttribute('aria-label', 'Botly is ' + state); }
    if (onStateChange) onStateChange(state);
  }

  function showSpeech(text) { if (speechTextEl) speechTextEl.textContent = text; if (speechBubbleEl) speechBubbleEl.classList.add('show'); }
  function hideSpeech() { if (speechBubbleEl) speechBubbleEl.classList.remove('show'); }
  function showTextInput() { if (!textInputArea) return; textInputArea.style.display = 'flex'; textInputVisible = true; if (textInput) textInput.focus(); }
  function hideTextInput() { if (!textInputArea) return; textInputArea.style.display = 'none'; textInputVisible = false; }

  function sendTextMessage() {
    if (!textInput) return;
    const text = textInput.value.trim();
    if (!text) return;
    textInput.value = '';
    hideTextInput();
    processUtterance(text);
  }

  function getCurrentLevel() {
    try {
      const tab = document.querySelector('.level-tab.active');
      return tab ? parseInt(tab.dataset.level) || 1 : 1;
    } catch(e) { return 1; }
  }

  function startIdleTimer() { stopIdleTimer(); idleTimer = setTimeout(() => { if (currentState === STATE.LISTENING) { showVisualIdlePrompt(); } }, 15000); }
  function showVisualIdlePrompt() {
    // Visual-only prompt — Botly never speaks unprompted (passive AI rule)
    if (speechBubbleEl) {
      speechBubbleEl.classList.add('show');
      if (speechTextEl) speechTextEl.textContent = '💬 Tap me or say "Botly" for a hint!';
      setTimeout(() => { if (!isSpeaking) hideSpeech(); }, 5000);
    }
  }
  function stopIdleTimer() { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }
  function resetIdleTimer() { stopIdleTimer(); startIdleTimer(); }

  function getState() { return currentState; }
  function isMicAvailable() { return isListening; }
  function speak(text) { speakResponse(text); }

  function destroy() {
    stopIdleTimer();
    if (recognition) try { recognition.stop(); } catch(e) {}
    cancelSpeech();
  }

  return { init, getState, isMicAvailable, speak, startIdleTimer, stopIdleTimer, resetIdleTimer, destroy };
})();
