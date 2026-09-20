/**
 * piper.js — Piper AI Assistant for Sonic Leak Hunter
 * 
 * Implements the PASSIVE AI pattern:
 * - VAD is always hot but Piper NEVER speaks unprompted
 * - Only responds when directly addressed ("Piper", "AI", etc.)
 * - Visual state indicator: idle → listening → thinking → speaking
 * 
 * Features:
 * - Speech-to-text via webkitSpeechRecognition / SpeechRecognition
 * - Text-to-speech via SpeechSynthesisUtterance
 * - Text fallback when mic unavailable
 * - Intent matching via Intents module
 * - State machine: PASSIVE_LISTENING → CHILD_ADDRESSES → CLASSIFY → THINKING → RESPONDING
 */

const Piper = (() => {
  // ─── State ───────────────────────────────────
  const States = {
    IDLE: 'idle',               // Mic not started / off
    PASSIVE_LISTENING: 'passive_listening',  // VAD active, waiting for address
    CLASSIFYING: 'classifying', // Analyzing intent
    THINKING: 'thinking',       // Generating response
    SPEAKING: 'speaking'        // TTS outputting
  };

  let state = States.IDLE;
  let recognition = null;
  let currentLevel = 1;
  let isMuted = false;
  let visualContainer = null;
  let stateIndicator = null;
  let textInputContainer = null;
  let speechBubble = null;
  let micFallback = false; // true when STT unavailable

  // Callbacks
  let onStateChange = null;
  let onResponse = null;
  let onTranscript = null;

  // ─── Initialization ──────────────────────────

  function init(config = {}) {
    currentLevel = config.level || 1;
    isMuted = config.muted || false;
    visualContainer = config.container || null;
    onStateChange = config.onStateChange || null;
    onResponse = config.onResponse || null;
    onTranscript = config.onTranscript || null;

    // Check if speech recognition is available
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setupSpeechRecognition(SpeechRecognition);
      setState(States.PASSIVE_LISTENING);
    } else {
      console.warn('Speech recognition not available — using text input fallback');
      enableTextFallback();
    }

    // Setup TTS
    setupTTS();
  }

  function setupSpeechRecognition(SpeechRecognition) {
    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        
        if (transcript.trim()) {
          if (onTranscript) onTranscript(transcript.trim());
          setState(States.CLASSIFYING);
          processUtterance(transcript.trim());
        }
      };

      recognition.onerror = (err) => {
        if (err.error === 'not-allowed') {
          console.warn('Microphone denied — enabling text fallback');
          enableTextFallback();
        } else if (err.error !== 'no-speech' && err.error !== 'aborted') {
          console.error('STT error:', err.error);
        }
      };

      recognition.onend = () => {
        if (state === States.PASSIVE_LISTENING && !micFallback) {
          try { recognition.start(); } catch (e) { /* ignore */ }
        }
      };

      recognition.start();
    } catch (e) {
      console.error('Failed to start STT:', e);
      enableTextFallback();
    }
  }

  function enableTextFallback() {
    micFallback = true;
    setState(States.IDLE);
    
    // Target the .piper-text-input element inside the container, not the container itself
    if (visualContainer) {
      const textInputEl = visualContainer.querySelector('.piper-text-input');
      if (textInputEl) textInputEl.style.display = 'flex';
    }
    
    // Show idle prompt
    showBubble('Type a message or tap the mic! 👇', 3000);
  }

  function setupTTS() {
    // Pre-warm TTS
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }

  // ─── State Management ────────────────────────

  function setState(newState) {
    state = newState;
    if (onStateChange) onStateChange(newState);
    updateIndicator();
  }

  function updateIndicator() {
    if (!stateIndicator) return;
    
    // Remove all state classes
    stateIndicator.classList.remove('piper-idle', 'piper-listening', 'piper-thinking', 'piper-speaking');
    
    switch (state) {
      case States.IDLE:
        stateIndicator.classList.add('piper-idle');
        stateIndicator.setAttribute('aria-label', 'Piper is idle');
        break;
      case States.PASSIVE_LISTENING:
        stateIndicator.classList.add('piper-listening');
        stateIndicator.setAttribute('aria-label', 'Piper is listening');
        break;
      case States.CLASSIFYING:
      case States.THINKING:
        stateIndicator.classList.add('piper-thinking');
        stateIndicator.setAttribute('aria-label', 'Piper is thinking');
        break;
      case States.SPEAKING:
        stateIndicator.classList.add('piper-speaking');
        stateIndicator.setAttribute('aria-label', 'Piper is speaking');
        break;
    }
  }

  // ─── Utterance Processing ────────────────────

  function processUtterance(text) {
    setState(States.THINKING);

    // Classify intent
    const result = Intents.classify(text, currentLevel, {});
    
    if (result.intent === 'ignore') {
      // Unaddressed speech — stay silent
      setState(States.PASSIVE_LISTENING);
      return;
    }

    // Add to transcript
    if (window.Transcript) {
      Transcript.add('child', text);
    }

    // Generate response
    setTimeout(() => {
      respond(result.response, result.intent);
    }, 500 + Math.random() * 500); // Slight delay to feel natural
  }

  function respond(text, intent) {
    if (!text) {
      setState(States.PASSIVE_LISTENING);
      return;
    }

    // Add to transcript
    if (window.Transcript) {
      Transcript.add('piper', text);
    }

    // Show speech bubble
    showBubble(text, 5000);

    // Speak the response
    speak(text).then(() => {
      setState(States.PASSIVE_LISTENING);
    }).catch(() => {
      setState(States.PASSIVE_LISTENING);
    });

    if (onResponse) onResponse({ text, intent });
  }

  // ─── TTS ─────────────────────────────────────

  function speak(text) {
    return new Promise((resolve) => {
      if (isMuted || !window.speechSynthesis || Settings.get('muted')) {
        resolve();
        return;
      }

      setState(States.SPEAKING);
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Apply settings
      if (window.Settings) {
        Settings.applyToUtterance(utterance);
      }
      
      utterance.rate = Settings.get('speechRate') || 0.85;
      utterance.volume = Settings.get('volume') / 100 || 0.9;
      
      // Set voice if configured
      const voiceURI = Settings.get('voiceURI');
      if (voiceURI) {
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.voiceURI === voiceURI);
        if (voice) utterance.voice = voice;
      }

      utterance.onend = () => {
        if (!window.speechSynthesis.speaking) {
          resolve();
        }
      };

      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
      
      // Safety timeout — resolve after text length estimation
      const estimatedDuration = text.length * 60; // ~60ms per character
      setTimeout(resolve, Math.max(estimatedDuration, 2000));
    });
  }

  // ─── Visual Output ───────────────────────────

  function showBubble(text, duration = 5000) {
    if (!speechBubble && visualContainer) {
      const el = visualContainer.querySelector('.piper-bubble');
      if (el) speechBubble = el;
    }
    
    if (!speechBubble) return;
    
    speechBubble.textContent = text;
    speechBubble.style.display = 'block';
    speechBubble.classList.add('piper-bubble-visible');
    
    // Auto-hide
    clearTimeout(speechBubble._timeout);
    speechBubble._timeout = setTimeout(() => {
      speechBubble.classList.remove('piper-bubble-visible');
      setTimeout(() => {
        if (speechBubble) speechBubble.style.display = 'none';
      }, 300);
    }, duration);
  }

  // ─── Text Input Fallback ─────────────────────

  function handleTextInput(text) {
    if (!text.trim()) return;
    processUtterance(text.trim());
  }

  // ─── Level Update ────────────────────────────

  function setLevel(level) {
    currentLevel = level;
  }

  // ─── Idle Prompt ─────────────────────────────

  function showIdlePrompt() {
    const prompt = Intents.getIdlePrompt(currentLevel);
    showBubble(prompt, 4000);
  }

  // ─── Get/Set State ───────────────────────────

  function getState() {
    return state;
  }

  function getStateLabel() {
    const labels = {
      idle: 'Idle',
      passive_listening: 'Listening (passive)',
      classifying: 'Understanding...',
      thinking: 'Thinking...',
      speaking: 'Speaking'
    };
    return labels[state] || state;
  }

  // ─── Tear Down ───────────────────────────────

  function destroy() {
    if (recognition) {
      try { recognition.stop(); } catch (e) { /* ignore */ }
      recognition = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  return {
    States,
    init,
    setLevel,
    handleTextInput,
    showIdlePrompt,
    showBubble,
    getState,
    getStateLabel,
    setState,
    destroy,
    speak,
    get isMuted() { return isMuted; },
    set isMuted(v) { isMuted = v; },
    get micFallback() { return micFallback; }
  };
})();

window.Piper = Piper;
