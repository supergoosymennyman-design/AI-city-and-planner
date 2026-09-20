/**
 * conversation.js — Voice pipeline (STT + TTS + VAD) for K3-03 AI Architect
 *
 * Provides passive AI listening: always listening, never initiates speech.
 * Uses SpeechRecognition for STT, speechSynthesis for TTS, and Web Audio
 * API RMS for simple VAD.
 *
 * State machine: PASSIVE_LISTENING → CHILD_ADDRESSES_AI → CLASSIFY_INTENT
 *                → THINKING → RESPONDING → PASSIVE_LISTENING
 */

var ConversationManager = (() => {
  'use strict';

  const VAD_THRESHOLD = 0.015;
  const EOU_SILENCE_MS = 800;

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
      this._speakingQueue = [];

      this._onSettingsChange = this._onSettingsChange.bind(this);
    }

    /**
     * Initialize mic, STT, and VAD.
     * @returns {Promise<boolean>}
     */
    async initialize() {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = this.audioContext.createMediaStreamSource(this.micStream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;
        source.connect(this.analyser);

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          this.recognition = new SpeechRecognition();
          this.recognition.continuous = true;
          this.recognition.interimResults = true;
          this.recognition.lang = 'en-US';
          this._setupRecognition();
        }

        this._setState('idle');
        if (this.isMicEnabled) {
          this.startListening();
        }

        return true;
      } catch (err) {
        console.warn('ConversationManager init failed:', err);
        this._setState('error');
        return false;
      }
    }

    startListening() {
      if (!this.isMicEnabled) return;
      if (this.recognition) {
        try { this.recognition.start(); } catch (e) {}
      }
      this._startVAD();
      this._setState('listening');
    }

    stopListening() {
      if (this.recognition) {
        try { this.recognition.stop(); } catch (e) {}
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
        if (this.isMicEnabled && this.state !== 'idle' && this.state !== 'error') {
          try { this.recognition.start(); } catch (e) {}
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
            if (this.isAiSpeaking || this.state === 'speaking') {
              this._bargeIn();
            }
          }
          this.lastAudioVolumeTime = Date.now();
        } else {
          if (this.isUserSpeaking &&
              Date.now() - this.lastAudioVolumeTime > EOU_SILENCE_MS) {
            this.isUserSpeaking = false;
            if (this.lastTranscript) {
              this.onUtteranceEnd(this.lastTranscript);
            }
          }
        }

        this.vadRAF = requestAnimationFrame(checkAudio);
      };

      this.vadRAF = requestAnimationFrame(checkAudio);
    }

    // ---- Barge-in ----

    _bargeIn() {
      this.isAiSpeaking = false;
      this._speakingQueue = [];
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      this._setState('listening');
    }

    // ---- Text-to-Speech ----

    speak(text, onEnd, force = false) {
      if (!text || text.trim().length === 0) return;

      const settings = this.ttsSettings;
      if (settings.mute && !force) {
        if (onEnd) setTimeout(onEnd, 100);
        return;
      }

      window.speechSynthesis.cancel();

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
        utterance.rate = settings.speechRate || 0.7;
        utterance.pitch = 1.1;
        utterance.volume = settings.mute ? 0 : ((settings.volume || 90) / 100);

        if (settings.voiceURI) {
          const voices = window.speechSynthesis.getVoices();
          const voice = voices.find(v => v.voiceURI === settings.voiceURI);
          if (voice) utterance.voice = voice;
        }

        utterance.onend = () => {
          setTimeout(() => speakNext(index + 1), 300);
        };
        utterance.onerror = () => {
          speakNext(index + 1);
        };

        window.speechSynthesis.speak(utterance);
      };

      speakNext(0);
    }

    cancelSpeech() {
      window.speechSynthesis.cancel();
      this.isAiSpeaking = false;
      this._speakingQueue = [];
      this._setState('listening');
    }

    // ---- Settings ----

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

    // ---- State ----

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
