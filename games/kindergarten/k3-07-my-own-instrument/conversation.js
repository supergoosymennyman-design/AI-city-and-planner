/**
 * conversation.js — Voice pipeline for K3-07 My Own Instrument
 *
 * Provides STT (SpeechRecognition), TTS (speechSynthesis), and VAD
 * (Web Audio API RMS-based voice activity detection).
 *
 * The AI is always listening but NEVER initiates speech.
 * It only responds when the child directly addresses it.
 *
 * State machine: PASSIVE_LISTENING → CHILD_ADDRESSES_AI → CLASSIFY_INTENT
 *                → THINKING → RESPONDING → PASSIVE_LISTENING
 *
 * State indicator colors:
 *   Green pulsing dot = listening (VAD active)
 *   Yellow animated dots = thinking (classifying/generating)
 *   Blue wave bars = speaking (TTS active)
 *   Grey dim dot = idle/off
 */

var ConversationManager = (() => {
  const VAD_THRESHOLD = 0.015;
  const EOU_SILENCE_MS = 800;

  /**
   * @param {object} config
   * @param {Function} config.onStateChange - Called with state name string
   * @param {Function} config.onTranscription - Called with interim/final text
   * @param {Function} config.onIntentDetected - Called when child addresses AI
   * @param {Function} config.onUtteranceEnd - Called when speech segment ends
   * @param {object} config.ttsSettings - { speechRate, volume, voiceURI, mute }
   */
  class ConversationManager {
    constructor(config = {}) {
      this.onStateChange = config.onStateChange || (() => {});
      this.onTranscription = config.onTranscription || (() => {});
      this.onIntentDetected = config.onIntentDetected || (() => {});
      this.onUtteranceEnd = config.onUtteranceEnd || (() => {});
      this.ttsSettings = config.ttsSettings || {};
      this.isMicEnabled = config.micEnabled !== false;

      this.recognition = null;
      this.audioContext = null;
      this.analyser = null;
      this.micStream = null;

      this.isAiSpeaking = false;
      this.isUserSpeaking = false;
      this.state = 'idle';
      this.lastTranscript = '';
      this.lastAudioVolumeTime = Date.now();
      this.vadRAF = null;
      this.utteranceTimer = null;

      this._voiceBuffer = [];  // Buffer speech chunks
      this._speakingQueue = []; // Queue of sentences to speak

      // Bind TTS settings change handler
      this._onSettingsChange = this._onSettingsChange.bind(this);
    }

    /**
     * Initialize the microphone, STT, and VAD.
     * @returns {Promise<boolean>} - Whether initialization succeeded
     */
    async initialize() {
      try {
        // Request microphone
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        // Set up AudioContext for VAD
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = this.audioContext.createMediaStreamSource(this.micStream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;
        source.connect(this.analyser);

        // Set up SpeechRecognition (STT)
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          this.recognition = new SpeechRecognition();
          this.recognition.continuous = true;
          this.recognition.interimResults = true;
          this.recognition.lang = 'en-US';
          this._setupRecognition();
        }

        // Start listening
        this._setState('idle');
        if (this.isMicEnabled) {
          this.startListening();
        }

        return true;
      } catch (err) {
        console.warn('ConversationManager: initialization failed', err);
        this._setState('error');
        return false;
      }
    }

    /**
     * Start STT and VAD monitoring.
     */
    startListening() {
      if (!this.isMicEnabled) return;
      if (this.recognition) {
        try {
          this.recognition.start();
        } catch (e) {
          // May already be started
        }
      }
      this._startVAD();
      this._setState('listening');
    }

    /**
     * Stop STT and VAD monitoring.
     */
    stopListening() {
      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch (e) {}
      }
      if (this.vadRAF) {
        cancelAnimationFrame(this.vadRAF);
        this.vadRAF = null;
      }
      this._setState('idle');
    }

    // ---- Speech-to-Text ----

    _setupRecognition() {
      this.recognition.onresult = (event) => {
        let finalText = '';
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0].transcript;
          } else {
            interimText += result[0].transcript;
          }
        }

        const text = finalText || interimText;
        if (text.trim().length > 0) {
          this.lastTranscript = text.trim();
          this.onTranscription({
            text: text.trim(),
            isFinal: !!finalText
          });

          // Check for barge-in
          if (this.isAiSpeaking || this.state === 'speaking') {
            this._bargeIn();
          }
        }
      };

      this.recognition.onerror = (event) => {
        if (event.error !== 'no-speech') {
          console.warn('STT error:', event.error);
        }
      };

      this.recognition.onend = () => {
        // Auto-restart if still enabled
        if (this.isMicEnabled && this.state !== 'idle' && this.state !== 'error') {
          try {
            this.recognition.start();
          } catch (e) {}
        }
      };
    }

    // ---- Voice Activity Detection ----

    _startVAD() {
      if (!this.analyser) return;

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);

      const checkAudio = () => {
        if (!this.analyser) return;
        this.analyser.getFloatTimeDomainData(dataArray);

        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          sumSquares += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sumSquares / bufferLength);

        if (rms > VAD_THRESHOLD) {
          if (!this.isUserSpeaking) {
            this.isUserSpeaking = true;
            // Barge-in if AI is speaking and child starts talking
            if (this.isAiSpeaking || this.state === 'speaking') {
              this._bargeIn();
            }
          }
          this.lastAudioVolumeTime = Date.now();
        } else {
          // Check for end of utterance (silence after speech)
          if (this.isUserSpeaking &&
              Date.now() - this.lastAudioVolumeTime > EOU_SILENCE_MS) {
            this.isUserSpeaking = false;
            // Process the utterance end
            if (this.lastTranscript) {
              this.onUtteranceEnd(this.lastTranscript);
            }
          }
        }

        this.vadRAF = requestAnimationFrame(checkAudio);
      };

      this.vadRAF = requestAnimationFrame(checkAudio);
    }

    // ---- Barge-in Handling ----

    _bargeIn() {
      this.isAiSpeaking = false;
      this._speakingQueue = [];
      this._voiceBuffer = [];

      // Cancel current TTS
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      this._setState('listening');
    }

    // ---- Text-To-Speech ----

    /**
     * Speak a text string using speechSynthesis.
     * @param {string} text - Text to speak
     * @param {Function} [onEnd] - Called when speech finishes
     * @param {boolean} [force=false] - Force speak even if muted
     */
    speak(text, onEnd, force = false) {
      if (!text || text.trim().length === 0) return;

      const settings = this.ttsSettings;
      if (settings.mute && !force) {
        if (onEnd) setTimeout(onEnd, 100);
        return;
      }

      // Cancel previous speech
      window.speechSynthesis.cancel();

      // Split into sentences for natural pauses
      const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];

      this._setState('speaking');
      this.isAiSpeaking = true;

      const speakNext = (index) => {
        if (index >= sentences.length || !this.isAiSpeaking) {
          this.isAiSpeaking = false;
          this._setState('listening');
          if (onEnd) onEnd();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(sentences[index].trim());
        utterance.rate = settings.speechRate || 0.85;
        utterance.pitch = 1.1;
        utterance.volume = settings.mute ? 0 : ((settings.volume || 90) / 100);

        // Set voice if specified
        if (settings.voiceURI) {
          const voices = window.speechSynthesis.getVoices();
          const voice = voices.find(v => v.voiceURI === settings.voiceURI);
          if (voice) utterance.voice = voice;
        }

        utterance.onend = () => {
          // Small pause between sentences
          setTimeout(() => speakNext(index + 1), 300);
        };

        utterance.onerror = () => {
          speakNext(index + 1);
        };

        window.speechSynthesis.speak(utterance);
      };

      speakNext(0);
    }

    /**
     * Cancel any ongoing TTS and reset speaking state.
     */
    cancelSpeech() {
      window.speechSynthesis.cancel();
      this.isAiSpeaking = false;
      this._speakingQueue = [];
      this._voiceBuffer = [];
      this._setState('listening');
    }

    // ---- Settings Integration ----

    _onSettingsChange(settings) {
      this.ttsSettings = settings;
      if ('micEnabled' in settings) {
        this.isMicEnabled = settings.micEnabled;
        if (settings.micEnabled && this.state === 'idle') {
          this.startListening();
        } else if (!settings.micEnabled) {
          this.stopListening();
        }
      }
      if (settings.mute) {
        this.cancelSpeech();
      }
    }

    connectSettings(settingsModule) {
      settingsModule.onChange(this._onSettingsChange);
      this.ttsSettings = settingsModule.getAll();
      this.isMicEnabled = this.ttsSettings.micEnabled;
    }

    // ---- State Management ----

    _setState(state) {
      this.state = state;
      this.onStateChange(state);
    }

    setThinking() {
      this._setState('thinking');
    }

    setListening() {
      this._setState('listening');
    }

    // ---- Cleanup ----

    destroy() {
      this.cancelSpeech();
      this.stopListening();
      if (this.micStream) {
        this.micStream.getTracks().forEach(t => t.stop());
        this.micStream = null;
      }
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }
      this.analyser = null;
    }
  }

  return ConversationManager;
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ConversationManager };
}
