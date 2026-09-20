/**
 * conversation.js — Nova conversational AI (Subsurface Signal Decoder)
 * Passive: ONLY responds when child says "Nova" / "AI" / "drone" or asks a direct question.
 * Falls back to text input when microphone unavailable.
 * State machine: IDLE → LISTENING → THINKING → SPEAKING → LISTENING
 */
const Conversation = (() => {
  'use strict';

  const STATE = { IDLE: 'idle', LISTENING: 'listening', THINKING: 'thinking', SPEAKING: 'speaking' };
  let currentState = STATE.IDLE;
  let recognition = null;
  let isListening = false;
  let isSpeaking = false;
  let silenceTimer = null;
  let lastUtterance = '';
  let textInputVisible = false;
  let stateDotEl = null;
  let speechBubbleEl = null;
  let speechTextEl = null;
  let avatarEl = null;
  let textInputArea = null;
  let textInput = null;
  let textSendBtn = null;
  let onStateChange = null;
  let onResponse = null;
  let idleTimer = null;

  function init(callbacks) {
    onStateChange = callbacks.onStateChange || null;
    onResponse = callbacks.onResponse || null;

    stateDotEl = document.getElementById('nova-state-dot');
    speechBubbleEl = document.getElementById('nova-speech');
    speechTextEl = document.getElementById('speech-text');
    avatarEl = document.getElementById('nova-avatar');
    textInputArea = document.getElementById('text-input-area');
    textInput = document.getElementById('nova-text-input');
    textSendBtn = document.getElementById('text-send-btn');

    if (avatarEl) {
      avatarEl.addEventListener('click', () => {
        // Show text input on tap — so kids without mics can still talk to Nova
        showTextInput();
      });
    }
    if (textSendBtn && textInput) {
      textSendBtn.addEventListener('click', sendTextMessage);
      textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendTextMessage();
      });
    }

    tryStartSTT();
    startIdleTimer();
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
        let transcript = '';
        let isFinal = false;
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
          if (event.results[i].isFinal) isFinal = true;
        }
        if (transcript.trim().length > 0) {
          lastUtterance = transcript.trim();
          setState(STATE.LISTENING);
          resetIdleTimer();
          if (isSpeaking) cancelSpeech();
          clearTimeout(silenceTimer);
          if (isFinal) {
            silenceTimer = setTimeout(() => processUtterance(lastUtterance), 800);
          }
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech') return;
        if (event.error === 'not-allowed') {
          setState(STATE.IDLE);
          showTextInput();
          return;
        }
      };

      recognition.onend = () => {
        if (!Settings.isMicEnabled() || Settings.isMuted()) return;
        try { recognition.start(); } catch (e) { /* ignore */ }
      };

      recognition.start();
      isListening = true;
      setState(STATE.LISTENING);
      hideTextInput();
    } catch (e) {
      setState(STATE.IDLE);
      showTextInput();
    }
  }

  function restartSTT() {
    if (recognition) {
      try { recognition.stop(); } catch (e) { /* ignore */ }
      recognition = null;
      isListening = false;
    }
    tryStartSTT();
  }

  function processUtterance(text) {
    if (!text || !text.trim()) return;
    const trimmed = text.trim();
    Transcript.addEntry('child', trimmed);
    setState(STATE.THINKING);
    const result = Intents.classify(trimmed);
    if (!result.intentId) {
      // Child spoke but didn't address Nova — stay silent (passive AI rule)
      setState(STATE.LISTENING);
      return;
    }
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
      // Visual-only response
      isSpeaking = false;
      setTimeout(() => {
        setState(STATE.LISTENING);
      }, 2500);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = settings.rate || 0.9;
    utterance.volume = settings.volume || 0.9;
    utterance.pitch = 1.05;
    if (settings.voiceURI) {
      const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === settings.voiceURI);
      if (voice) utterance.voice = voice;
    }
    utterance.onend = () => {
      isSpeaking = false;
      setTimeout(() => {
        hideSpeech();
        setState(STATE.LISTENING);
      }, 1500);
    };
    utterance.onerror = () => {
      isSpeaking = false;
      setTimeout(() => setState(STATE.LISTENING), 1000);
    };
    window.speechSynthesis.speak(utterance);
  }

  function cancelSpeech() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    isSpeaking = false;
    setState(STATE.LISTENING);
  }

  function setState(state) {
    currentState = state;
    if (stateDotEl) {
      stateDotEl.className = 'ai-state-dot ' + state;
      stateDotEl.setAttribute('aria-label', 'Nova is ' + state);
    }
    if (onStateChange) onStateChange(state);
  }

  function showSpeech(text) {
    if (speechTextEl) speechTextEl.textContent = text;
    if (speechBubbleEl) speechBubbleEl.classList.add('show');
  }

  function hideSpeech() {
    if (speechBubbleEl) speechBubbleEl.classList.remove('show');
  }

  function showTextInput() {
    if (!textInputArea) return;
    // Ensure the parent speech bubble is visible so the text input shows
    if (speechBubbleEl) speechBubbleEl.classList.add('show');
    textInputArea.style.display = 'flex';
    textInputVisible = true;
    if (textInput) textInput.focus();
  }

  function hideTextInput() {
    if (!textInputArea) return;
    // Keep visible — kids need a text fallback even when mic is available
    textInputVisible = false;
    // Only hide the bubble if not speaking
    if (!isSpeaking && speechBubbleEl) speechBubbleEl.classList.remove('show');
  }

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
      if (typeof Game !== 'undefined' && Game.getCurrentLevelNum) {
        return Game.getCurrentLevelNum();
      }
    } catch (e) { /* ignore */ }
    return 1;
  }

  // ── Idle visual prompt (VISUAL ONLY — Nova never auto-speaks) ──
  function startIdleTimer() {
    stopIdleTimer();
    idleTimer = setTimeout(() => {
      if (currentState === STATE.LISTENING || currentState === STATE.IDLE) {
        showVisualIdlePrompt();
      }
    }, 15000);
  }

  function showVisualIdlePrompt() {
    if (speechBubbleEl) {
      speechBubbleEl.classList.add('show');
      if (speechTextEl) speechTextEl.textContent = Intents.getIdlePrompt();
      setTimeout(() => {
        if (!isSpeaking) hideSpeech();
      }, 5000);
    }
  }

  function stopIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function resetIdleTimer() {
    stopIdleTimer();
    startIdleTimer();
  }

  // ── Public API ──
  function getState() { return currentState; }
  function isMicAvailable() { return isListening; }
  function speak(text) { speakResponse(text); }

  function destroy() {
    stopIdleTimer();
    if (recognition) {
      try { recognition.stop(); } catch (e) { /* ignore */ }
    }
    cancelSpeech();
  }

  return {
    init,
    getState,
    isMicAvailable,
    speak,
    startIdleTimer,
    stopIdleTimer,
    resetIdleTimer,
    destroy,
    restartSTT
  };
})();
