/**
 * intents.js — Intent classification for shape+color matching
 * for K3-03 AI Architect.
 *
 * Detects shape names, color names, confirmation words, and
 * general address triggers from STT output.
 *
 * The AI is always listening but ONLY responds when addressed.
 */

var GameIntents = (() => {
  'use strict';

  /** Shape names the child might say */
  const SHAPE_WORDS = {
    circle: ['circle', 'circles', 'round', 'ring'],
    square: ['square', 'squares', 'box'],
    triangle: ['triangle', 'triangles', 'triang'],
    star: ['star', 'stars'],
    rectangle: ['rectangle', 'rectangles']
  };

  /** Color names the child might say */
  const COLOR_WORDS = {
    red: ['red', 'reds'],
    blue: ['blue', 'blues'],
    yellow: ['yellow', 'yellows'],
    green: ['green', 'greens'],
    orange: ['orange', 'oranges'],
    purple: ['purple', 'purples']
  };

  /** Confirmation words */
  const YES_WORDS = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'right', 'correct', 'good'];
  const NO_WORDS = ['no', 'nope', 'nah', 'not', 'wrong', 'incorrect'];

  /** Address trigger patterns — strict: only respond when child addresses Botly directly */
  const TRIGGER_PATTERNS = [
    /\b(botly|ai|friend|robot)\b/i,
    /\b(hey|hi|hello)\s+(botly|ai|robot|friend)\b/i,
    /\byou\b.*\?/i,
    /\?$/  // Any question is treated as addressing AI (child is talking to the tablet)
  ];

  /** Part names */
  const PART_WORDS = {
    roof: ['roof', 'top', 'roofs'],
    door: ['door', 'doors', 'entrance'],
    windows: ['window', 'windows', 'win']
  };

  /**
   * Check if a transcript contains an address trigger.
   */
  function isAddressed(text) {
    if (!text || text.trim().length === 0) return false;
    return TRIGGER_PATTERNS.some(pattern => pattern.test(text));
  }

  /**
   * Extract a shape name from text.
   * @returns {string|null} Shape key or null
   */
  function extractShape(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const [shape, words] of Object.entries(SHAPE_WORDS)) {
      if (words.some(w => lower.includes(w))) {
        return shape;
      }
    }
    return null;
  }

  /**
   * Extract a color name from text.
   * @returns {string|null} Color key or null
   */
  function extractColor(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const [color, words] of Object.entries(COLOR_WORDS)) {
      if (words.some(w => lower.includes(w))) {
        return color;
      }
    }
    return null;
  }

  /**
   * Extract a part name from text.
   * @returns {string|null} Part key or null
   */
  function extractPart(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const [part, words] of Object.entries(PART_WORDS)) {
      if (words.some(w => lower.includes(w))) {
        return part;
      }
    }
    return null;
  }

  /**
   * Check if text is affirmative.
   */
  function isYes(text) {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    return YES_WORDS.some(w => lower === w || lower.startsWith(w + ' ') || lower.endsWith(' ' + w));
  }

  /**
   * Check if text is negative.
   */
  function isNo(text) {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    return NO_WORDS.some(w => lower === w || lower.startsWith(w + ' ') || lower.endsWith(' ' + w));
  }

  /**
   * Extract a shape+color pair from text.
   * Returns { shape, color } if both found, or partial match.
   */
  function extractShapeColor(text) {
    return {
      shape: extractShape(text),
      color: extractColor(text)
    };
  }

  /**
   * Check if a shape name matches the expected shape (for quiz).
   */
  function matchesShape(text, expectedShape) {
    const found = extractShape(text);
    return found === expectedShape;
  }

  /**
   * Check if a color name matches the expected color (for quiz).
   */
  function matchesColor(text, expectedColor) {
    const found = extractColor(text);
    return found === expectedColor;
  }

  /**
   * Process an utterance for Part A quiz: check if child named the correct shape/color.
   */
  function processQuizAnswer(text, expected) {
    const shape = extractShape(text);
    const color = extractColor(text);

    if (expected.type === 'shape') {
      return {
        correct: shape === expected.value,
        shape: shape,
        expected: expected.value
      };
    }
    if (expected.type === 'color') {
      return {
        correct: color === expected.value,
        color: color,
        expected: expected.value
      };
    }
    return { correct: false };
  }

  /**
   * Process an utterance for Part B: extract shape+color assignment.
   */
  function processPartAssignment(text) {
    const result = extractShapeColor(text);
    const part = extractPart(text);
    return {
      part: part,
      shape: result.shape,
      color: result.color,
      hasPart: !!part,
      hasShape: !!result.shape,
      hasColor: !!result.color
    };
  }

  /**
   * Extract ALL part-shape-color assignments from a multi-part utterance.
   * Handles phrases like "star window, red roof, blue door" or
   * "circle door and triangle windows".
   * @param {string} text - Full utterance text
   * @returns {Array<{part:string, shape:string|null, color:string|null}>}
   */
  function extractAllAssignments(text) {
    if (!text) return [];
    const results = [];
    const seen = new Set();

    // Split by commas, "and", "then", "also"
    const segments = text.split(/,|\band\b|\bthen\b|\balso\b/i).map(s => s.trim()).filter(Boolean);

    for (const segment of segments) {
      const part = extractPart(segment);
      if (!part) continue; // skip segments without a part reference
      const sc = extractShapeColor(segment);
      if (!sc.shape && !sc.color) continue; // need at least shape or color
      const key = part + ':' + (sc.shape || '') + ':' + (sc.color || '');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ part, shape: sc.shape || null, color: sc.color || null });
    }

    return results;
  }

  /**
   * Main utterance processing: detect address, classify intent, generate response.
   * @param {string} text - Transcribed speech
   * @param {object} context - Game context
   * @returns {{addressed: boolean, intent: string|null, response: string|null, data: object}}
   */
  function processUtterance(text, context = {}) {
    if (!text || text.trim().length === 0) {
      return { addressed: false, intent: null, response: null, data: {} };
    }

    // In quiz or assignment mode, process even without trigger
    const isQuizMode = context.quizMode === 'shape' || context.quizMode === 'color';
    const isAssignmentMode = context.assignmentMode;

    const addressed = isAddressed(text) || isQuizMode || isAssignmentMode;
    if (!addressed) {
      return { addressed: false, intent: null, response: null, data: {} };
    }

    // Detect intent
    let intent = 'GENERAL';
    let data = {};

    if (isYes(text)) {
      intent = 'AFFIRM';
      data = { yes: true };
    } else if (isNo(text)) {
      intent = 'DENY';
      data = { no: true };
    }

    const shapeColor = extractShapeColor(text);
    if (shapeColor.shape || shapeColor.color) {
      if (isQuizMode) {
        intent = 'QUIZ_ANSWER';
        data = processQuizAnswer(text, { type: isQuizMode, value: context.quizValue });
      } else if (isAssignmentMode) {
        intent = 'ASSIGNMENT';
        data = processPartAssignment(text);
      } else {
        intent = 'SHAPE_COLOR_MENTION';
        data = shapeColor;
      }
    }

    if (intent === 'GENERAL' && !addressed) {
      return { addressed: false, intent: null, response: null, data: {} };
    }

    const response = generateResponse(intent, data, context);

    return { addressed: true, intent, response, data };
  }

  /**
   * Generate a response based on intent.
   */
  function generateResponse(intent, data, context) {
    switch (intent) {
      case 'AFFIRM':
        return ['Great!', 'Awesome!', 'Yes!', 'Wonderful!', 'Perfect!'][Math.floor(Math.random() * 5)];

      case 'DENY':
        return ['Let\'s try again!', 'No problem, try again!', 'That\'s okay, what is it?', 'Hmm, let me try again!'][Math.floor(Math.random() * 4)];

      case 'QUIZ_ANSWER':
        if (data.correct) {
          return data.shape
            ? `Yes! That's a ${data.shape}! You're so smart!`
            : `Yes! That's ${data.color}! Great job!`;
        }
        return data.shape
          ? `Hmm, that's not quite ${data.expected}. Can you try again?`
          : `Hmm, that's not quite ${data.expected}. Want to tap it?`;

      case 'ASSIGNMENT':
        // Handled in main game logic
        return '';

      case 'SHAPE_COLOR_MENTION':
        if (data.shape && data.color) {
          return `A ${data.color} ${data.shape}! That's a great choice!`;
        }
        if (data.shape) {
          return `A ${data.shape}! I like that shape!`;
        }
        if (data.color) {
          return `${data.color.charAt(0).toUpperCase() + data.color.slice(1)}! Nice color!`;
        }
        return '';

      default:
        return getLessonNudge();
    }
  }

  /**
   * Get a lesson-connected nudge for off-topic responses.
   */
  function getLessonNudge() {
    const nudges = [
      'You\'re doing great! Let\'s keep building our house!',
      'I love learning from you! What should we add next?',
      'You\'re teaching me so much about shapes and colors!',
      'Let\'s get back to our house — pick a shape!',
      'I\'m learning all about houses from you!',
      'Great question! Now let\'s build our house together!'
    ];
    return nudges[Math.floor(Math.random() * nudges.length)];
  }

  return {
    SHAPE_WORDS,
    COLOR_WORDS,
    TRIGGER_PATTERNS,
    isAddressed,
    extractShape,
    extractColor,
    extractPart,
    extractShapeColor,
    isYes,
    isNo,
    matchesShape,
    matchesColor,
    processQuizAnswer,
    processPartAssignment,
    extractAllAssignments,
    processUtterance,
    getLessonNudge
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameIntents };
}
