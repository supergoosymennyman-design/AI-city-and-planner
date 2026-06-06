/**
 * Utility Functions for AI Teaching Games
 * Handles TTS, STT, API calls, canvas, and localStorage
 *
 * IMPORTANT: This file must be loaded AFTER config.js
 * CONFIG should be available as a global variable
 */

// Ensure CONFIG is available (loaded from config.js)
const CONFIG =
  typeof window !== "undefined" && window.loadConfig
    ? loadConfig()
    : typeof DEFAULT_CONFIG !== "undefined"
      ? DEFAULT_CONFIG
      : {};

/**
 * Text-to-Speech using Chrome Web Speech API
 * @param {string} text - Text to speak
 * @param {Object} options - Optional overrides for rate, pitch, voice
 */
function speakText(text, options = {}) {
  if (!CONFIG.ttsEnabled && !options.force) return;

  // Cancel any ongoing speech
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate ?? CONFIG.ttsRate;
  utterance.pitch = options.pitch ?? CONFIG.ttsPitch;

  // Set voice if specified or configured
  if ((options.voice || CONFIG.ttsVoice) && "speechSynthesis" in window) {
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(
      (v) => v.name === (options.voice || CONFIG.ttsVoice),
    );
    if (voice) utterance.voice = voice;
  }

  // Optional callback when done speaking
  if (options.onEnd) {
    utterance.onend = options.onEnd;
  }

  if ("speechSynthesis" in window) {
    speechSynthesis.speak(utterance);
  }
  return utterance;
}

/**
 * Speech-to-Text using Chrome Web Speech API
 * @returns {Promise<string>} - Transcribed text
 */
async function listenForSpeech(options = {}) {
  if (!CONFIG.sttEnabled) {
    throw new Error("Speech recognition is disabled in settings");
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    throw new Error("Speech recognition not supported in this browser");
  }

  return new Promise((resolve, reject) => {
    const recognition = new SpeechRecognition();
    recognition.lang = options.language || CONFIG.sttLanguage;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (options.onStart) options.onStart();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      if (options.onResult) options.onResult(transcript);
      resolve(transcript);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      reject(new Error(`Speech error: ${event.error}`));
    };

    recognition.onend = () => {
      if (options.onEnd) options.onEnd();
    };

    // Start listening
    try {
      recognition.start();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Call local llama-server API (text-only)
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Optional API parameters
 */
async function queryLLM(prompt, options = {}) {
  const endpoint = CONFIG.apiEndpoint;

  const payload = {
    prompt: prompt,
    n_predict: options.maxTokens ?? CONFIG.maxTokens,
    temperature: options.temperature ?? CONFIG.temperature,
    stream: false,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(CONFIG.apiTimeout),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content?.trim() || data.response?.trim() || "";
  } catch (error) {
    console.error("LLM query failed:", error);
    throw error;
  }
}

/**
 * Call llama-server with vision support (image + text)
 * @param {string} prompt - Text prompt
 * @param {string} imageBase64 - Base64-encoded image (without data:image/png;base64, prefix)
 */
async function queryLLMWithVision(prompt, imageBase64, options = {}) {
  const endpoint = CONFIG.apiEndpoint;

  // Format for llama.cpp vision: [img-<id>]\n<prompt>
  const visionPrompt = `[img-100]\n${prompt}`;

  // FIXED: Proper syntax for image_data array
  const payload = {
    prompt: visionPrompt,
    image_data: [{ data: imageBase64, id: 100 }],
    n_predict: options.maxTokens ?? CONFIG.maxTokens,
    temperature: options.temperature ?? CONFIG.temperature,
    stream: false,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(CONFIG.apiTimeout),
    });

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content?.trim() || data.response?.trim() || "";
  } catch (error) {
    console.error("Vision query failed:", error);
    throw error;
  }
}

/**
 * Convert canvas element to base64 string (for vision API)
 */
function canvasToBase64(canvas) {
  // Remove the "image/png;base64," prefix for API
  return canvas.toDataURL("image/png").split(",")[1];
}

/**
 * Capture a frame from video element as base64
 */
function videoFrameToBase64(video, maxWidth = 400) {
  const canvas = document.createElement("canvas");
  const scale = maxWidth / video.videoWidth;
  canvas.width = maxWidth;
  canvas.height = video.videoHeight * scale;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return canvasToBase64(canvas);
}

/**
 * localStorage helpers for "learned" items
 */
const LearningMemory = {
  learn(item, category = "default") {
    const data = JSON.parse(localStorage.getItem("aiLearned") || "{}");
    if (!data[category]) data[category] = [];
    const normalizedName = item.toLowerCase().trim();
    if (!data[category].includes(normalizedName)) {
      data[category].push(normalizedName);
      localStorage.setItem("aiLearned", JSON.stringify(data));
      return true;
    }
    return false;
  },

  hasLearned(item, category = "default") {
    const data = JSON.parse(localStorage.getItem("aiLearned") || "{}");
    const items = data[category] || [];
    return items.includes(item.toLowerCase().trim());
  },

  getLearned(category = "default") {
    const data = JSON.parse(localStorage.getItem("aiLearned") || "{}");
    return data[category] || [];
  },

  clear(category = null) {
    if (category) {
      const data = JSON.parse(localStorage.getItem("aiLearned") || "{}");
      delete data[category];
      localStorage.setItem("aiLearned", JSON.stringify(data));
    } else {
      localStorage.removeItem("aiLearned");
    }
  },
};

/**
 * Simple debounce utility
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Initialize voices when page loads (Chrome quirk)
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = () => {};
}

// Export for module usage if needed
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CONFIG,
    speakText,
    listenForSpeech,
    queryLLM,
    queryLLMWithVision,
    canvasToBase64,
    videoFrameToBase64,
    LearningMemory,
    debounce,
    escapeHtml,
  };
}
