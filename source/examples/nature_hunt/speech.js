const Speech = (() => {
  let ttsReady = false;
  let recognition = null;
  let isListening = false;
  let onResultCallback = null;
  let onEndCallback = null;
  let sttAvailable = false;

  async function initTTS() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://www.masswerk.at/mespeak/mespeak.js';
      script.onload = () => {
        if (window.meSpeak) {
          window.meSpeak.loadVoice('en/en-us', () => {
            ttsReady = true;
            resolve();
          });
        } else {
          reject(new Error('meSpeak not available'));
        }
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function initSTT() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      sttAvailable = false;
      return false;
    }
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim();
      if (onResultCallback) onResultCallback(transcript);
    };

    recognition.onend = () => {
      isListening = false;
      if (onEndCallback) onEndCallback();
    };

    recognition.onerror = (event) => {
      console.warn('STT error:', event.error);
      isListening = false;
      if (onEndCallback) onEndCallback();
    };

    sttAvailable = true;
    return true;
  }

  function speak(text, callback) {
    if (ttsReady && window.meSpeak) {
      window.meSpeak.speak(text, {
        amplitude: 90,
        pitch: 60,
        speed: 150,
        wordgap: 4,
        variant: 'f2',
      }, callback);
      return true;
    }
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.85;
      utterance.pitch = 1.2;
      utterance.volume = 1;
      if (callback) utterance.onend = callback;
      window.speechSynthesis.speak(utterance);
      return true;
    }
    return false;
  }

  function startListening(onResult, onEnd) {
    if (!recognition || isListening) return false;
    onResultCallback = onResult;
    onEndCallback = onEnd;
    try {
      recognition.start();
      isListening = true;
      return true;
    } catch {
      isListening = false;
      return false;
    }
  }

  function stopListening() {
    if (!recognition || !isListening) return;
    try {
      recognition.stop();
    } catch {}
    isListening = false;
  }

  function isSTTAvailable() {
    return sttAvailable;
  }

  function isListeningNow() {
    return isListening;
  }

  return {
    initTTS,
    initSTT,
    speak,
    startListening,
    stopListening,
    isSTTAvailable,
    isListeningNow,
  };
})();
