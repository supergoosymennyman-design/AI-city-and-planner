/**
 * conversation.js — Nova Jr. conversational AI
 * PASSIVE: Always listening but NEVER initiates speech.
 * Only responds when child says "Nova" or taps avatar.
 */
const Conversation = (() => {
  'use strict';

  const STATE = { IDLE: 'idle', LISTENING: 'listening', THINKING: 'thinking', SPEAKING: 'speaking' };
  let currentState = STATE.IDLE;
  let recognition = null;
  let isListening = false;
  let onStateChange = null;
  let stateDotEl, speechEl, speechTextEl, avatarEl, inputArea, inputEl, sendBtn;

  function init(callbacks) {
    onStateChange = callbacks.onStateChange || (() => {});
    stateDotEl = document.getElementById('nova-state-dot');
    speechEl = document.getElementById('nova-speech');
    speechTextEl = document.getElementById('nova-text');
    avatarEl = document.getElementById('nova-avatar');
    inputArea = document.getElementById('nova-input-area');
    inputEl = document.getElementById('nova-input');
    sendBtn = document.getElementById('nova-send');

    if (avatarEl) {
      avatarEl.addEventListener('click', () => {
        Audio.click();
        showInput();
      });
    }
    if (sendBtn && inputEl) {
      sendBtn.addEventListener('click', handleTextInput);
      inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleTextInput(); });
    }
    tryStartSTT();
  }

  function showInput() {
    inputArea.style.display = 'flex';
    inputEl.focus();
  }

  function handleTextInput() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    inputArea.style.display = 'none';
    Transcript.add('you', text);
    processInput(text);
  }

  function tryStartSTT() {
    if (!Settings.get('mic')) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            const text = e.results[i][0].transcript.trim();
            if (text) {
              Transcript.add('you', text);
              processInput(text);
            }
          }
        }
      };
      recognition.onend = () => {
        if (Settings.get('mic')) {
          try { recognition.start(); } catch (e) {}
        }
      };
      recognition.start();
      isListening = true;
    } catch (e) {
      // Mic unavailable — text input only
    }
  }

  function processInput(text) {
    // Check if Nova was addressed
    const addressed = /nova/i.test(text) || /^(hey|hello|hi) /i.test(text) || /^[?]/i.test(text);

    setState(STATE.THINKING);

    setTimeout(() => {
      // If not addressed, ignore (passive rule)
      if (!addressed && text.length < 15) {
        setState(STATE.IDLE);
        return;
      }

      const response = Intents.match(text);
      if (!response) {
        // Fallback
        speak('Hmm, I am not sure! Try asking me about buildings, connecting, or scanning!');
        return;
      }

      speak(response);
    }, 400);
  }

  function speak(text) {
    setState(STATE.SPEAKING);
    speechTextEl.textContent = '';
    speechEl.style.display = 'block';

    // Type-out effect
    let i = 0;
    const interval = setInterval(() => {
      speechTextEl.textContent += text[i];
      i++;
      if (i >= text.length) {
        clearInterval(interval);
        // TTS
        if (!Settings.get('muted')) {
          const utter = new SpeechSynthesisUtterance(text);
          utter.rate = Settings.get('rate');
          utter.volume = Settings.get('volume');
          const voiceName = Settings.get('voice');
          if (voiceName) {
            const voices = speechSynthesis.getVoices();
            const v = voices.find(v => v.name === voiceName);
            if (v) utter.voice = v;
          }
          utter.onend = () => {
            setState(STATE.IDLE);
            // Auto-hide speech after 5s
            setTimeout(() => { if (currentState === STATE.IDLE) speechEl.style.display = 'none'; }, 5000);
          };
          speechSynthesis.speak(utter);
        } else {
          setState(STATE.IDLE);
          setTimeout(() => { speechEl.style.display = 'none'; }, 5000);
        }
      }
    }, 25);

    Transcript.add('nova', text);
  }

  function setState(s) {
    currentState = s;
    if (stateDotEl) {
      stateDotEl.className = 'state-dot ' + s;
    }
    onStateChange(s);
  }

  function getState() { return currentState; }

  return { init, getState };
})();
