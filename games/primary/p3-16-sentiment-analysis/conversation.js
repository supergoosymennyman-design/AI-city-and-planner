/**
 * conversation.js — Nova conversational AI
 *
 * PASSIVE AI RULE: Nova is always listening (continuous VAD) but
 * NEVER initiates speech. Only responds when the child says "Nova".
 *
 * Falls back to text input when microphone unavailable.
 * Uses Nova's SVG face for expression changes.
 */
const Conversation = (() => {
  'use strict';

  const STATE = {
    IDLE: 'idle',
    LISTENING: 'listening',
    THINKING: 'thinking',
    SPEAKING: 'speaking',
  };

  let currentState = STATE.IDLE;
  let recognition = null;
  let isListening = false;
  let isSpeaking = false;
  let silenceTimer = null;
  let lastUtterance = '';

  // DOM refs (all pointing to Nova's unified elements)
  let speechBubbleEl = null;
  let speechTextEl = null;
  let textInputArea = null;
  let textInput = null;
  let textSendBtn = null;

  function init() {
    // Nova's speech bubble (unified — narrative + conversation share this)
    speechBubbleEl = document.getElementById('nova-speech');
    speechTextEl = document.getElementById('nova-speech-text');
    textInputArea = document.getElementById('text-input-area');
    textInput = document.getElementById('nova-text-input');
    textSendBtn = document.getElementById('text-send-btn');

    // Avatar tap → show text input
    const avatar = document.getElementById('nova-avatar');
    if (avatar) {
      avatar.addEventListener('click', () => {
        if (!isListening) showTextInput();
      });
    }

    // Text input send
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
        let transcript = '';
        let isFinal = false;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
          if (event.results[i].isFinal) isFinal = true;
        }

        if (transcript.trim().length > 0) {
          lastUtterance = transcript.trim();
          setState(STATE.LISTENING);

          if (isSpeaking) cancelSpeech();

          clearTimeout(silenceTimer);
          if (isFinal) {
            silenceTimer = setTimeout(() => {
              processUtterance(lastUtterance);
            }, 800);
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
        if (event.error === 'network' || event.error === 'aborted') {
          setTimeout(() => {
            if (Settings.isMicEnabled() && !isListening) tryStartSTT();
          }, 2000);
        }
      };

      recognition.onend = () => {
        if (!Settings.isMicEnabled()) return;
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

    // Check if addressed to Nova
    if (!Intents.isAddressed(trimmed)) {
      setState(STATE.LISTENING);
      return;
    }

    // Addressed — record and respond
    if (window.Transcript) Transcript.addEntry('child', trimmed);

    setState(STATE.THINKING);

    // Set Nova's SVG expression
    if (window.NovaSVG) NovaSVG.setExpression('thinking');

    setTimeout(() => {
      const result = Intents.classify(trimmed);
      if (!result.intentId) {
        setState(STATE.LISTENING);
        return;
      }

      const level = parseInt(document.getElementById('level-label')?.dataset?.level || '1');
      const response = Intents.getResponse(result.intentId, level);
      speakResponse(response);
    }, 400 + Math.random() * 300);
  }

  function speakResponse(text) {
    if (!text || !text.trim()) return;
    isSpeaking = true;
    setState(STATE.SPEAKING);
    showSpeech(text);
    if (window.Transcript) Transcript.addEntry('ai', text);

    // Set Nova's expression for speaking
    if (window.NovaSVG) NovaSVG.setExpression('confident');

    const settings = Settings.getAll();

    if (settings.muted || !window.speechSynthesis) {
      setTimeout(() => {
        isSpeaking = false;
        hideSpeech();
        setState(STATE.LISTENING);
        if (window.NovaSVG) NovaSVG.setExpression('curious');
      }, 3000);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = settings.rate || 0.75;
    utterance.volume = settings.volume || 0.9;

    if (settings.voiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.voiceURI === settings.voiceURI);
      if (voice) utterance.voice = voice;
    }

    utterance.onend = () => {
      isSpeaking = false;
      hideSpeech();
      setState(STATE.LISTENING);
      if (window.NovaSVG) NovaSVG.setExpression('curious');
    };

    utterance.onerror = () => {
      isSpeaking = false;
      hideSpeech();
      setState(STATE.LISTENING);
    };

    window.speechSynthesis.speak(utterance);
  }

  function setState(state) {
    currentState = state;
    // Update Nova's SVG state dot
    if (window.NovaSVG) NovaSVG.setState(state);
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
    textInputArea.style.display = 'flex';
    if (textInput) textInput.focus();
  }

  function hideTextInput() {
    if (!textInputArea) return;
    textInputArea.style.display = 'none';
  }

  function sendTextMessage() {
    if (!textInput) return;
    const text = textInput.value.trim();
    if (!text) return;
    textInput.value = '';
    hideTextInput();
    processUtterance(text);
  }

  function cancelSpeech() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    isSpeaking = false;
    setState(STATE.LISTENING);
  }

  function destroy() {
    if (recognition) {
      try { recognition.stop(); } catch(e) {}
    }
    cancelSpeech();
  }

  function getState() { return currentState; }
  function isMicAvailable() { return isListening; }

  return {
    init, getState, isMicAvailable,
    speak: speakResponse, destroy,
  };
})();
