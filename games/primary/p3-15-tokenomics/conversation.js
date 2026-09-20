/**
 * conversation.js — Nova conversational AI for Passport Budget Allocator
 *
 * PASSIVE AI RULE: Nova is always listening (VAD continuous) but NEVER
 * initiates speech. She only responds when the child says "Nova" or taps
 * her avatar.
 *
 * Falls back to text input when microphone unavailable.
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

  let onStateChange = null;
  let onResponse = null;

  let stateDotEl, speechBubbleEl, speechTextEl, avatarEl;
  let textInputArea, textInput, textSendBtn;
  let idleTimer = null;
  let _avatarTapped = false;

  function init(callbacks) {
    onStateChange = callbacks.onStateChange || (() => {});
    onResponse = callbacks.onResponse || (() => {});

    stateDotEl = document.getElementById('ai-state-dot');
    speechBubbleEl = document.getElementById('nova-speech-bubble');
    speechTextEl = document.getElementById('nova-speech-text');
    avatarEl = document.getElementById('nova-avatar');
    textInputArea = document.getElementById('text-input-area');
    textInput = document.getElementById('botly-text-input');
    textSendBtn = document.getElementById('text-send-btn');

    if (avatarEl) {
      avatarEl.addEventListener('click', () => {
        _avatarTapped = true;
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

    const forceAddressed = _avatarTapped;
    _avatarTapped = false;

    const result = Intents.classify(trimmed, forceAddressed);
    if (!result.intentId) {
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
      isSpeaking = false;
      setTimeout(() => {
        setState(STATE.LISTENING);
        hideSpeech();
      }, 2500);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = settings.rate || 0.85;
    utterance.volume = settings.volume || 0.9;
    if (settings.voiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.voiceURI === settings.voiceURI);
      if (voice) utterance.voice = voice;
    }
    utterance.onend = () => {
      isSpeaking = false;
      setTimeout(() => {
        hideSpeech();
        setState(STATE.LISTENING);
      }, 1200);
    };
    utterance.onerror = () => {
      isSpeaking = false;
      setTimeout(() => setState(STATE.LISTENING), 1000);
    };
    window.speechSynthesis.speak(utterance);
  }

  function cancelSpeech() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
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
    textInputArea.classList.add('show');
    if (textInput) textInput.focus();
  }

  function hideTextInput() {
    if (!textInputArea) return;
    textInputArea.classList.remove('show');
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
      const state = Game.getState();
      return state ? state.currentLevel : 1;
    } catch(e) {
      return 1;
    }
  }

  function startIdleTimer() {
    stopIdleTimer();
    idleTimer = setTimeout(() => {
      if (currentState === STATE.LISTENING) showVisualPrompt();
    }, 20000);
  }

  function showVisualPrompt() {
    // Don't show the prompt if the level is complete or failed
    try {
      const gameState = Game.getState();
      if (gameState && (gameState.phase === 'complete' || gameState.phase === 'failed')) {
        return;
      }
    } catch(e) {
      // Game not initialized yet — still safe to show prompt
    }

    if (speechBubbleEl && speechTextEl) {
      speechBubbleEl.classList.add('show');
      speechTextEl.textContent = 'Tap me or say "Nova" for help!';
      setTimeout(() => {
        if (!isSpeaking) hideSpeech();
      }, 5000);
    }
  }

  function stopIdleTimer() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  function resetIdleTimer() {
    stopIdleTimer();
    startIdleTimer();
  }

  function getState() { return currentState; }
  function getIsListening() { return isListening; }

  function destroy() {
    stopIdleTimer();
    if (recognition) try { recognition.stop(); } catch(e) {}
    cancelSpeech();
  }

  return {
    init, getState, getIsListening,
    startIdleTimer, stopIdleTimer, resetIdleTimer,
    showTextInput, hideTextInput,
    speak: speakResponse, destroy
  };
})();
