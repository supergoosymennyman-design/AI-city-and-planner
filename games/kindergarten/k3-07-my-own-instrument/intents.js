/**
 * intents.js — Intent classification with address-trigger detection
 * for K3-07 My Own Instrument.
 *
 * The AI is always listening (VAD active) but ONLY responds when the
 * child addresses it directly. This module detects address triggers
 * and classifies the intent of addressed utterances.
 */

var GameIntents = (() => {
  /**
   * Address trigger phrases — the child must use one of these
   * for the AI to respond. Without these, the AI stays silent.
   */
  const TRIGGER_PATTERNS = [
    /\bai\b/i,
    /\brobot\b/i,
    /\bbot\b/i,
    /\b(hey|hi|hello)\s+(ai|robot|bot|friend)\b/i,
    /\b(what|who|how|can|could|will|do|does|is|are)\s+(is|this|that|it|my|the|you)\b/i,
    /\byou\b.*\?/i,
    /\?$/  // Any question — if uncertain, assume addressed
  ];

  /**
   * Intent definitions with response templates.
   * Each intent has patterns to match and response generators.
   */
  const INTENTS = {
    GREETING: {
      patterns: [
        /\b(hi|hello|hey|good morning|good afternoon)\b/i,
        /\bhow are you\b/i
      ],
      getResponse: (context) => {
        const greetings = [
          "Hi there! I'm learning about your instrument!",
          "Hello! Ready to make some sounds?",
          "Hey! I've been listening to your song!"
        ];
        return greetings[Math.floor(Math.random() * greetings.length)];
      }
    },

    ASK_SOUND: {
      patterns: [
        /\b(what|which)\s+(sound|is this|did I)\b/i,
        /\bcan you (hear|guess)\b/i,
        /\blisten\b/i
      ],
      getResponse: (context) => {
        if (context.currentSound) {
          return `That's your "${context.currentSound}" sound! I like it!`;
        }
        return "I hear you making sounds! Each one teaches me about your instrument.";
      }
    },

    ASK_PATTERN: {
      patterns: [
        /\b(what|how)\s+(do you think|is the pattern|does it sound)\b/i,
        /\bdo you (like|hear) (my|the)\s+(song|pattern|beat|rhythm)\b/i,
        /\bis it (good|cool|nice)\b/i
      ],
      getResponse: (context) => {
        const feedback = [
          "Your pattern is really interesting! I love how the sounds come together!",
          "I can hear the rhythm you made! It sounds like a real song!",
          "You arranged those sounds so well! I'm learning from your pattern!",
          "That beat makes me want to move! You're a great musician!"
        ];
        return feedback[Math.floor(Math.random() * feedback.length)];
      }
    },

    TEACH_SOUND: {
      patterns: [
        /\b(this is a|it's a|it is a|here is|listen to my)\b/i,
        /\bi (made|recorded|created|have)\b/i,
        /\bname (it|this)\b/i,
        /\bcall it\b/i
      ],
      getResponse: (context) => {
        return "You're teaching me your instrument! Every sound helps me understand!";
      }
    },

    GENERAL_QUESTION: {
      patterns: [
        /\b(why|what|when|where|how)\b.*\?/i,
        /\bcan (i|you|we)\b.*\?/i
      ],
      getResponse: (context) => {
        const responses = [
          "That's a great question! Right now I'm learning all about your instrument sounds!",
          "Hmm, let me think! I'm busy learning your song pattern!",
          "Good question! Why don't we keep making music and find out together?"
        ];
        return responses[Math.floor(Math.random() * responses.length)];
      }
    },

    OFF_TOPIC: {
      patterns: [],  // Catch-all after checking all other intents
      getResponse: (context) => {
        const offTopicResponses = [
          "That's interesting! Now let's get back to our instrument sounds!",
          "Cool! But I really want to hear more of your song!",
          "Tell me more about that later! Right now, let's make music together!"
        ];
        return offTopicResponses[Math.floor(Math.random() * offTopicResponses.length)];
      }
    }
  };

  /**
   * Check if a transcript contains an address trigger.
   * @param {string} text - The transcribed speech text
   * @returns {boolean} - Whether the AI is being addressed
   */
  function isAddressed(text) {
    if (!text || text.trim().length === 0) return false;
    return TRIGGER_PATTERNS.some(pattern => pattern.test(text));
  }

  /**
   * Classify the intent of an addressed utterance.
   * @param {string} text - The transcribed speech text
   * @param {object} context - Game context (current state, sound name, etc.)
   * @returns {string} - The intent name
   */
  function classify(text, context = {}) {
    if (!text || text.trim().length === 0) return null;

    // Check each intent's patterns (except OFF_TOPIC which is catch-all)
    for (const [name, intent] of Object.entries(INTENTS)) {
      if (name === 'OFF_TOPIC') continue;
      if (intent.patterns.some(p => p.test(text))) {
        return name;
      }
    }

    // Default: treat as off-topic if addressed but no pattern matched
    return 'OFF_TOPIC';
  }

  /**
   * Generate a response for a classified intent.
   * @param {string} intentName - The classified intent
   * @param {object} context - Game context
   * @returns {string} - The response text
   */
  function getResponse(intentName, context = {}) {
    const intent = INTENTS[intentName] || INTENTS.OFF_TOPIC;
    return intent.getResponse(context);
  }

  /**
   * Get conversational response that connects to the lesson topic.
   * Used for off-topic responses: 1 sentence answer + 1 sentence nudge.
   * @param {string} childText - What the child said
   * @returns {string} - Brief response under 25 words
   */
  function getLessonNudge(childText) {
    const nudge = [
      "You're doing great! Let's keep making our song!",
      "I love learning from you! What sound should we add next?",
      "You're teaching me so much about your instrument!",
      "Let's get back to our beat grid — tap a square!",
      "I'm learning your rhythm patterns! They're wonderful!",
    ];
    return nudge[Math.floor(Math.random() * nudge.length)];
  }

  /**
   * Process a full utterance: detect address, classify, and generate response.
   * @param {string} text - Transcribed text
   * @param {object} context - Game context
   * @returns {{addressed: boolean, intent: string|null, response: string|null}}
   */
  function processUtterance(text, context = {}) {
    if (!text || text.trim().length === 0) {
      return { addressed: false, intent: null, response: null };
    }

    const addressed = isAddressed(text);
    if (!addressed) {
      return { addressed: false, intent: null, response: null };
    }

    const intent = classify(text, context);
    const response = getResponse(intent, context);

    return { addressed: true, intent, response };
  }

  return {
    TRIGGER_PATTERNS,
    INTENTS,
    isAddressed,
    classify,
    getResponse,
    getLessonNudge,
    processUtterance
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameIntents };
}
