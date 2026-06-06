/**
 * Configuration Manager for AI Teaching Games
 * Handles loading/saving settings to localStorage with sensible defaults
 * Works in browser by attaching to window object
 */

const DEFAULT_CONFIG = {
  // API Settings
  apiEndpoint: "http://localhost:8080/completion",
  apiTimeout: 30000,
  temperature: 0.7,
  maxTokens: 100,

  // Voice Settings (TTS)
  ttsEnabled: true,
  ttsRate: 1.0,
  ttsPitch: 1.0,
  ttsVoice: "",

  // Speech Recognition (STT)
  sttEnabled: true,
  sttLanguage: "en-US",
  sttAutoSend: true,

  // UI Preferences
  showTranscripts: true,
  autoScroll: true,
  theme: "colorful",

  // Lesson-Specific Defaults
  lesson1: {
    defaultShapes: ["circle", "square", "triangle"],
    enableVision: true,
  },
  lesson2: {
    defaultCategories: ["color", "size"],
    enableCamera: true,
  },
};

/**
 * Load configuration from localStorage or return defaults
 */
function loadConfig() {
  try {
    const saved = localStorage.getItem("aiLessonsConfig");
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    console.warn("Failed to load config, using defaults:", e);
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save configuration to localStorage
 */
function saveConfig(config) {
  try {
    localStorage.setItem("aiLessonsConfig", JSON.stringify(config));
    return true;
  } catch (e) {
    console.error("Failed to save config:", e);
    return false;
  }
}

/**
 * Reset to default configuration
 */
function resetConfig() {
  localStorage.removeItem("aiLessonsConfig");
  return { ...DEFAULT_CONFIG };
}

/**
 * Get available TTS voices (async, browser-dependent)
 */
async function getAvailableVoices() {
  return new Promise((resolve) => {
    if ("speechSynthesis" in window) {
      const loadVoices = () => {
        const voices = speechSynthesis.getVoices();
        resolve(voices.map((v) => ({ name: v.name, lang: v.lang })));
      };
      loadVoices();
      speechSynthesis.onvoiceschanged = loadVoices;
      setTimeout(() => resolve([]), 1000);
    } else {
      resolve([]);
    }
  });
}

// Export for browser: attach to window so other scripts can access
if (typeof window !== "undefined") {
  window.DEFAULT_CONFIG = DEFAULT_CONFIG;
  window.loadConfig = loadConfig;
  window.saveConfig = saveConfig;
  window.resetConfig = resetConfig;
  window.getAvailableVoices = getAvailableVoices;
}

// Also support Node.js-style exports if needed
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_CONFIG,
    loadConfig,
    saveConfig,
    resetConfig,
    getAvailableVoices,
  };
}
