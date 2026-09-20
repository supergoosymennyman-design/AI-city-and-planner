/**
 * intents.js — Piper intent classification + response templates for Sonic Leak Hunter
 *
 * Matches child utterances to intents using keyword/phrase matching.
 * Supports both direct pattern matching and fallback to generic responses.
 *
 * Intents by priority (higher = checked first):
 * - help (95): "Piper help", "how to play"
 * - hint (90): "Piper hint", "where is it"
 * - check (85): "Piper check", "am I right"
 * - explain_level (75): "what does this level teach"
 * - ai_concept (70): "what is supervised learning", concept definitions
 * - encourage (60): "good", "nice", positive feedback
 * - greeting (50): "hi", "hello", "Piper"
 * - off_topic (0): fallback
 *
 * Level mapping (6 levels):
 *   L1 Sort the Sounds · L2 Tune the Sensitivity · L3 Edge Case Patrol ·
 *   L4 Confidence Command · L5 Final City Scan · L6 Water Dept. Briefing (quiz)
 */

const Intents = (() => {

  /**
   * Response templates keyed by intent + level/context
   */
  const templates = {
    greeting: [
      "Hi there, Detective! Ready to hunt some leaks?",
      "Hello! I'm Piper. Let's save WaterCity's water!",
      "Hey! Need help finding leaks? Just ask!"
    ],
    help: [
      "I can give you hints, check your answers, or explain AI concepts. Just say 'Piper hint' or 'Piper check'!",
      "Try tapping on the waves or blocks. If you're stuck, say 'Piper hint' and I'll help!",
      "Tap the city blocks to hear their waves. Leaks sound spiky — safe pipes sound smooth!"
    ],
    hint: {
      lv1: [
        "Look for the wave with sharp, jagged spikes — that's the leak! The smooth one is safe.",
        "Spiky = leaky! Tap the wave that looks messy, not the smooth one."
      ],
      lv2: [
        "Move the slider until the red line only crosses the big spike, not the smooth sections.",
        "Too high = you miss leaks. Too low = you get false alarms. Find the sweet spot!"
      ],
      lv3: [
        "Piper never heard these sounds before! Ask: does this pattern look like a real leak spike, or just everyday noise?",
        "Regular, repeating sounds (like a jackhammer or a train) are usually noise. A sudden big spike is worth investigating!"
      ],
      lv4: [
        "Piper gives a confidence % for each alert. Over 80% = trust it. Under 60% = probably a false alarm — check the reason!",
        "If the reason has another explanation (rain, traffic, construction), the alert is probably a false alarm."
      ],
      lv5: [
        "Orbit the pipes by dragging. Tap a pipe to see Piper's report and its sensor data!",
        "Piper flags pipes by color: red = says leak, yellow = unsure, green = normal. But check the sensor data yourself!",
        "You only have 2 repair crews — save them for the REAL leaks. Inspect before you decide!"
      ],
      lv6: [
        "Read each question carefully. Think about what you learned in the game!",
        "Remember: AI learns from examples, needs to filter noise, and sometimes needs human help."
      ]
    },
    check: {
      lv1: [
        "That looks like a good choice! The leak wave should be jagged and spiky.",
        "Check if the wave has sharp spikes — that means it's a leak."
      ],
      lv2: [
        "Check the false alarm counter! If it's going up, lower your sensitivity a bit.",
        "The red line should touch the spike but not the smooth parts of the wave."
      ],
      lv3: [
        "Is this pattern a sharp spike (threat) or a regular everyday sound (noise)?",
        "Compare it to what you learned: leaks have one big sudden spike."
      ],
      lv4: [
        "If Piper is very confident (over 80%), you can trust it. Low confidence needs your judgment!",
        "Read the reason! If the sound is explainable by something else, it's probably not a leak."
      ],
      lv5: [
        "Tap a pipe, then hit Inspect to see its sensor wave. Big spike = leak, smooth = safe!",
        "Red pipes look urgent but check the reason — some are false alarms. Spend crews wisely!",
        "Don't forget the green pipes — Piper can miss things. Inspect a few of those too!"
      ],
      lv6: [
        "Read all the choices before picking one. Think about what you learned!",
        "Eliminate the wrong answers first, then pick the best one."
      ]
    },
    explain_level: {
      lv1: "In Level 1, you're training Piper! You show it what a leak sounds like versus a safe pipe. This is called Supervised Learning — AI learns from labeled examples.",
      lv2: "In Level 2, you tune Piper's sensitivity. Set it too high and you get false alarms. Too low and you miss leaks. Finding the balance is the Threshold Tradeoff!",
      lv3: "In Level 3, Piper hears sounds it was NEVER trained on — trucks, rain, festivals. When AI sees something new, it can get confused. You decide: noise or threat?",
      lv4: "In Level 4, Piper reports alerts with confidence percentages. AI gives probabilities, not certainties. You judge which alerts to trust — that's human-in-the-loop!",
      lv5: "In Level 5, you're the pipe inspector! Piper pre-scans the 3D pipe network and colors the suspicious pipes — but it can miss leaks and raise false alarms. You inspect the sensor data and decide what to fix. AI is a tool, not a boss!",
      lv6: "Level 6 is your Water Department briefing! The department asks you questions about how AI finds leaks. Answer correctly to clear Piper for the whole city!"
    },
    ai_concept: {
      supervised_learning: "Supervised Learning is how AI learns from labeled examples. You show it 'this is safe' and 'this is a leak' — then it learns the difference!",
      classification: "Classification is when AI takes something new and decides which category it belongs to — like 'safe pipe' or 'leaking pipe'!",
      signal_vs_noise: "Signal is the real data you want. Noise is random junk that confuses AI. Good AI needs to filter out noise!",
      threshold: "A threshold is a cutoff line. The Threshold Tradeoff means balancing between catching all leaks and avoiding false alarms.",
      edge_cases: "Edge cases are NEW situations the AI never saw in its training — like rain, trucks, or festivals. AI can get confused by them, so humans stay in the loop!",
      probability: "AI gives probabilities, not certainties. 'I'm 72% sure' means it's likely but not guaranteed. Humans decide how much confidence to trust!",
      human_in_the_loop: "Human-in-the-Loop means AI asks a person for help when it's not sure. AI + human judgment = better together!",
      batch_processing: "Batch Processing means AI checks lots of things at once instead of one at a time. Faster, but it might be less sure about some!",
      default: "That's a great question about AI! In this game, AI learns by seeing examples and finding patterns — kind of like how you learn!"
    },
    encourage: [
      "You're doing great, Detective!",
      "Nice work! Piper is learning a lot from you!",
      "Excellent detective skills! Keep going!",
      "Wow, you're a natural at this!",
      "Great job! The Water Department's pipes are safer thanks to you!"
    ],
    off_topic: [
      "That's interesting! But right now, WaterCity needs us to find leaks. Want to keep hunting?",
      "I'd love to chat about that later! For now, let's focus on training me to find leaks. Ready?",
      "Good question! But let's get back to our mission — WaterCity is losing water! Ready to help?"
    ],
    idle_prompts: [
      // Level 1: Sort the Sounds — animated wave classification
      { levels: [1], prompts: [
        "Watch the wave, then sort it: NORMAL or LEAK! Say 'Piper' if you need help.",
        "Each wave is different — some are smooth, some are spiky. Sort it!",
        "Trust your ears! Compare the wave and tap NORMAL or LEAK."
      ]},
      // Level 2: Tune the Sensitivity — threshold slider
      { levels: [2], prompts: [
        "Move the slider so the red line ONLY touches the leak spike!",
        "Too high = miss leaks! Too low = false alarms! Find the sweet spot.",
        "Adjust the sensitivity until the red line just touches the spike. Say 'Piper' for help!"
      ]},
      // Level 3: Edge Case Patrol
      { levels: [3], prompts: [
        "Piper hears brand new sounds! Decide: just noise, or investigate?",
        "These sounds weren't in Piper's training. Use your judgment!",
        "Is that pattern a threat or everyday noise? Tap your answer!"
      ]},
      // Level 4: Confidence Command
      { levels: [4], prompts: [
        "Piper gives a confidence % for each alert. Decide: trust, inspect, or dismiss?",
        "High confidence = trust it. Low confidence = check the reason carefully!",
        "AI says 'I'm X% sure' — you make the final call!"
      ]},
      // Level 5: Pipe Vision Inspector
      { levels: [5], prompts: [
        "Orbit the pipe network and tap a pipe to inspect it!",
        "Piper colored the pipes — but check the sensor data yourself!",
        "2 repair crews, 4 hidden leaks. Choose wisely!"
      ]},
      // Level 6: Water Department Briefing (quiz)
      { levels: [6], prompts: [
        "The Water Department is waiting! Answer their questions to clear Piper!",
        "You've got this! Read each question and pick the best answer.",
        "Show the department what you learned! Tap the correct answer."
      ]},
      // Default (any other level)
      { levels: [], prompts: [
        "I'm here if you need help! Just say 'Piper' or tap the mic.",
        "Need a hint? Just ask me!",
        "Say 'Piper help' to get started!"
      ]}
    ]
  };

  /**
   * Get a random item from an array or the value if it's a string
   */
  function pick(arr) {
    if (typeof arr === 'string') return arr;
    if (Array.isArray(arr)) return arr[Math.floor(Math.random() * arr.length)];
    return arr;
  }

  /**
   * Get level-specific template
   */
  function getLevelTemplate(intent, level) {
    if (templates[intent] && templates[intent][`lv${level}`]) {
      return pick(templates[intent][`lv${level}`]);
    }
    // Fallback to general
    if (templates[intent]) {
      return pick(templates[intent]);
    }
    return null;
  }

  /**
   * Classify the user's utterance and return { intent, response, priority }
   * @param {string} text - the child's transcribed text
   * @param {number} level - current game level (1-6)
   * @param {object} context - additional context (e.g. current state)
   */
  function classify(text, level = 1, context = {}) {
    const lower = text.toLowerCase().trim();
    
    // Must contain "piper" or be a direct question to trigger AI
    const hasPiper = lower.includes('piper') || lower.includes('ai') || lower.includes('bot');
    const isQuestion = lower.includes('?') || 
      lower.startsWith('what') || lower.startsWith('how') || 
      lower.startsWith('who') || lower.startsWith('why') ||
      lower.startsWith('can') || lower.startsWith('where');

    // Don't respond to unaddressed speech (passive AI rule)
    if (!hasPiper && !isQuestion && lower.length < 8) {
      return { intent: 'ignore', response: null, priority: 0 };
    }

    // Helper: check if text matches any keywords
    const matches = (...keywords) => keywords.some(k => lower.includes(k));

    // ─── Intent Matching ──────────────────────

    // help
    if (matches('help', 'how to play', 'how do i', 'what do i do', 'i don\'t get it', 'confused')) {
      return { intent: 'help', response: pick(templates.help), priority: 95 };
    }

    // hint
    if (matches('hint', 'where is', 'which one', 'clue', 'tip', 'i\'m stuck', 'show me')) {
      return { intent: 'hint', response: getLevelTemplate('hint', level), priority: 90 };
    }

    // check
    if (matches('check', 'am i right', 'is this right', 'is this correct', 'did i', 'look right')) {
      return { intent: 'check', response: getLevelTemplate('check', level), priority: 85 };
    }

    // explain_level
    if (matches('what does this level', 'explain this level', 'what is level', 'what are we doing')) {
      return { intent: 'explain_level', response: getLevelTemplate('explain_level', level), priority: 75 };
    }

    // ai_concept
    if (matches('supervised learning', 'what is supervised')) {
      return { intent: 'ai_concept', response: templates.ai_concept.supervised_learning, priority: 70 };
    }
    if (matches('classification', 'how does it classify', 'what is classification')) {
      return { intent: 'ai_concept', response: templates.ai_concept.classification, priority: 70 };
    }
    if (matches('signal', 'noise', 'filtering', 'what is signal')) {
      return { intent: 'ai_concept', response: templates.ai_concept.signal_vs_noise, priority: 70 };
    }
    if (matches('threshold', 'sensitivity', 'false alarm', 'false positive')) {
      return { intent: 'ai_concept', response: templates.ai_concept.threshold, priority: 70 };
    }
    if (matches('edge case', 'edge cases', 'new sound', 'never heard', 'out of distribution')) {
      return { intent: 'ai_concept', response: templates.ai_concept.edge_cases, priority: 70 };
    }
    if (matches('probability', 'probabilistic', 'percent', 'percentage', 'how sure', 'confidence')) {
      return { intent: 'ai_concept', response: templates.ai_concept.probability, priority: 70 };
    }
    if (matches('batch', 'human in the loop', 'hitl')) {
      return { intent: 'ai_concept', response: templates.ai_concept.human_in_the_loop, priority: 70 };
    }
    if (matches('what is ai', 'how does ai', 'ai concept', 'explain ai')) {
      return { intent: 'ai_concept', response: templates.ai_concept.default, priority: 68 };
    }

    // encourage
    if (matches('good', 'nice', 'cool', 'awesome', 'done it', 'got it', 'yay', 'great', 'i did it', 'finished')) {
      return { intent: 'encourage', response: pick(templates.encourage), priority: 60 };
    }

    // greeting
    if (matches('hi', 'hello', 'hey', 'piper', 'yo')) {
      return { intent: 'greeting', response: pick(templates.greeting), priority: 50 };
    }

    // off_topic fallback
    if (hasPiper || isQuestion) {
      return { intent: 'off_topic', response: pick(templates.off_topic), priority: 0 };
    }

    // Unaddressed speech — ignore
    return { intent: 'ignore', response: null, priority: -1 };
  }

  /**
   * Get a level-specific idle prompt for the visual hint
   */
  function getIdlePrompt(level) {
    const prompts = templates.idle_prompts;
    // Find a prompt group matching the current level
    const match = prompts.find(p => p.levels && p.levels.includes(level));
    if (match) return pick(match.prompts);
    // Fallback: find the default (empty levels array)
    const def = prompts.find(p => p.levels && p.levels.length === 0);
    return def ? pick(def.prompts) : "Say 'Piper help' if you need me!";
  }

  return {
    classify,
    getIdlePrompt,
    templates
  };
})();

window.Intents = Intents;
