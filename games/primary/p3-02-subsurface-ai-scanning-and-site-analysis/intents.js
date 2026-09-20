/**
 * intents.js — Nova AI intent definitions & response templates (v2)
 * Nova the Survey Drone: passive conversational AI for Subsurface Signal Decoder
 * Only responds when child says "Nova" / "AI" / "drone" or asks a direct question.
 *
 * v2 extensions: new vocab explainers (threshold, training, confidence, sensor,
 * false alarm, miss, fuse), updated hints + success for 5 new AI-teaching levels.
 */
const Intents = (() => {
  'use strict';

  const INTENTS = [
    {
      id: 'help',
      triggerPatterns: [/nova.*help/i, /help.*nova/i, /^help$/i, /what.*do/i, /how.*play/i, /how.*(scan|survey|play)/i],
      responses: [
        'Train me by labeling signal samples, tune my sensitivity, and fuse my sensors. Together we will survey this site!',
        'You teach me what hazards look like, then I help you scan the grid. I get better the more you teach me!',
        'Each level teaches a new AI skill. Start by labeling signals so I can learn the difference between safe and hazard.'
      ],
      priority: 95
    },
    {
      id: 'hint',
      triggerPatterns: [/nova.*hint/i, /hint.*nova/i, /^hint$/i, /give.*hint/i, /where.*(is|are)/i, /which.*cell/i, /stuck/i],
      responses: [],
      priority: 90
    },
    {
      id: 'check',
      triggerPatterns: [/nova.*check/i, /check.*nova/i, /^check$/i, /am.*(right|correct|done)/i, /did.*find/i],
      responses: [
        'Check the threshold line on the chart. Hazards are above it, safe below. Does it look right to you?',
        'Look at where the green dots and orange dots cluster on the chart. The threshold line should split them!',
        'If my labels look wrong, you can teach me more! Tap a cell I got wrong to add a new label.'
      ],
      priority: 85
    },
    {
      id: 'what_is_threshold',
      triggerPatterns: [/what.*threshold/i, /threshold.*mean/i, /explain.*threshold/i],
      responses: [
        'A threshold is a cutoff line! Everything above it is a hazard, everything below is safe. You teach me where to draw that line by labeling samples.',
        'Think of the threshold like a fence. Safe ground is below the fence, hazards are above it. You help me place the fence in the right spot!'
      ],
      priority: 82
    },
    {
      id: 'what_is_training_data',
      triggerPatterns: [/what.*training/i, /training.*data/i, /how.*learn/i, /how.*you.*learn/i, /teach.*you/i],
      responses: [
        'You are my training data! Every time you label a cell Safe or Hazard, I learn from it. More labels = better learning. Small training sets make mistakes — that is why I need your help!',
        'Training data is the labeled samples you give me. I find the best threshold to split them. If you only show me a few samples, I might get some wrong!'
      ],
      priority: 81
    },
    {
      id: 'what_is_confidence',
      triggerPatterns: [/what.*confidence/i, /confidence.*mean/i, /how.*sure/i, /how.*certain/i],
      responses: [
        'Confidence is how sure I am! If a cell is far from the threshold, I am very confident. But cells near the line — I might be only 60% sure. That is when I ask you to double-check!',
        'Confidence is a percentage. 95% means I am almost certain. 50% means I am guessing. Human-in-the-loop means you check the ones I am unsure about!'
      ],
      priority: 80
    },
    {
      id: 'what_is_sensor',
      triggerPatterns: [/what.*sensor/i, /sensor.*(do|mean|work)/i, /explain.*seismic/i, /explain.*gpr/i, /explain.*em/i],
      responses: [
        'I have three sensors! Seismic feels vibrations, GPR uses radar waves, and EM detects magnetic fields. Different sensors see different things — some hazards are invisible to one sensor but clear to another!',
        'Seismic (green) is good at finding underground cavities. GPR (cyan) spots pipes and cables. EM (orange) finds metal objects. Fusing them together is better than any single one!'
      ],
      priority: 76
    },
    {
      id: 'what_is_fuse',
      triggerPatterns: [/what.*fuse/i, /fuse.*mean/i, /how.*fuse/i, /combine.*sensor/i, /sensor.*fusion/i],
      responses: [
        'Fusing means combining all three sensors! A cell is only a confirmed hazard when at least 2 out of 3 sensors agree. One sensor alone can be fooled, but three together are much smarter!',
        'Sensor fusion is like getting a second opinion. If only one sensor sees a hazard, I am not sure. But if two or three agree — we can be confident! That is why we cross-check.'
      ],
      priority: 83
    },
    {
      id: 'what_is_false_alarm',
      triggerPatterns: [/what.*false.*alarm/i, /false.*alarm.*mean/i, /why.*false/i],
      responses: [
        'A false alarm is when I say "hazard!" but there is nothing there. It wastes drill tokens. If you set my sensitivity too high, I will flag too many cells and cost us tokens!',
        'False alarms happen when my threshold is too low — I get jumpy and see hazards everywhere. That is why tuning sensitivity matters: catch real hazards without wasting tokens on fake ones!'
      ],
      priority: 78
    },
    {
      id: 'what_is_miss',
      triggerPatterns: [/what.*miss/i, /miss.*mean/i, /why.*miss/i],
      responses: [
        'A miss is when I say "safe" but there is actually a hazard underground. That is dangerous! If my threshold is too high, I miss real hazards — and a building could collapse!',
        'A miss means I failed to spot a real danger. That happens when I am not sensitive enough. We have to balance: catch hazards without too many false alarms.'
      ],
      priority: 77
    },
    {
      id: 'explain_level',
      triggerPatterns: [/nova.*(what|explain|level)/i, /what.*(level|do|this)/i, /explain.*(level|this|game)/i, /tell.*about.*level/i],
      responses: [
        'This level teaches an AI skill. In Level 1 you train me. In Level 2 you tune my sensitivity. Level 3 adds noise. Level 4 fuses sensors. Level 5 — I survey on my own!',
        'Each level builds on the last one. By Level 5, the AI you trained will be able to survey a whole site by itself. That is the power of teaching an AI well!'
      ],
      priority: 75
    },
    {
      id: 'why',
      triggerPatterns: [/why.*(scan|survey|before|build|ai)/i, /why.*(this|that|need)/i, /what.*(point|purpose)/i],
      responses: [
        'We scan before building so we do not put buildings on top of underground hazards! Real surveyors use AI to read sensor data — just like you are doing now.',
        'Surveying the subsurface keeps construction safe. AI helps us see what is hidden underground, but AI needs a human to teach it, tune it, and check its work!'
      ],
      priority: 70
    },
    {
      id: 'signal_concepts',
      triggerPatterns: [/noise/i, /spike/i, /signal/i, /depth/i, /deep/i, /shallow/i, /baseline/i, /amplitude/i],
      responses: [
        'Amplitude is how strong the signal is — higher means more likely a hazard. Noise is random wiggles that make it harder to see the real pattern.',
        'Different hazards create different signal strengths. That is why we need a threshold: to separate the real danger signals from the background noise!'
      ],
      priority: 65
    },
    {
      id: 'encourage',
      triggerPatterns: [/good/i, /nice/i, /great/i, /done/i, /yay/i, /finished/i, /cool/i, /awesome/i],
      responses: [
        'Fantastic! You are teaching me to be a better surveyor every time you label a cell.',
        'Nice work, operator! The AI you trained is getting smarter with every decision.',
        'Brilliant! Real AI engineers do exactly what you just did — train, tune, and verify.'
      ],
      priority: 60
    },
    {
      id: 'greeting',
      triggerPatterns: [/^(hi|hello|hey)/i, /^nova$/i, /^ai$/i, /^drone$/i],
      responses: [
        'Hi there! I am Nova, your survey drone. Ready to train me? Ask me anything about thresholds, sensors, or scanning!',
        'Hello, operator! I am here to learn from you. Say "Nova, what is a threshold?" if you want to understand how I think!',
        'Hey! I am hovering above the site. Teach me what hazards look like and I will help you survey!'
      ],
      priority: 50
    },
    {
      id: 'off_topic',
      triggerPatterns: [/.*/],
      responses: [
        'That is interesting! For now, let us focus on finding those underground hazards — want to know about thresholds or sensors?',
        'Hmm, I am still learning about subsurface scanning! Ask me about false alarms, sensor fusion, or confidence instead.',
        'I am best at survey questions! Try asking "Nova, what is sensor fusion?" or "Nova, help!"'
      ],
      priority: 0
    }
  ];

  // Level-specific hints (shown when kid says "Nova, hint!")
  const LEVEL_HINTS = {
    1: 'Label the signal samples! Tap Hazard for high signals, Safe for low ones. After 4-6 labels, I will draw a threshold line — but I might get 1-2 wrong. Tap any wrong cell to teach me more!',
    2: 'Use the Sensitivity stepper! Higher catches more hazards but makes more false alarms. Watch the meters as you tune. False alarms cost tokens — find the best balance!',
    3: 'I have three sensors now! Toggle between Seismic, GPR, and EM. A cell is only a hazard if at least 2 of 3 sensors agree. Some hazards are invisible to one sensor — cross-check!',
    4: 'I will auto-classify most cells! Watch for the ones marked "Uncertain" — those need your approval. A missed hazard makes a building collapse, so check carefully!'
  };

  // Level success messages (visual text + SFX only, never auto-spoken)
  const LEVEL_SUCCESS = {
    1: 'You taught Nova to read signals! The threshold line came from YOUR labels. Dr. Chen smiles: "Nova is learning! The crew can start preparing." That is supervised learning — AI learns from the data humans give it!',
    2: 'Perfect sensitivity tuning! You balanced catching hazards against false alarms. Dr. Chen nods: "You saved the budget and caught the hazards. Well done." That is the precision-recall tradeoff!',
    3: 'Sensor fusion victory! You cross-referenced all three sensors. Dr. Chen grins: "Three sensors, one truth. You fused them perfectly. Nova is ready for the big test." Fusing data beats any one source!',
    4: 'Nova surveyed the site on her own — because YOU taught her! Dr. Chen shakes your hand: "Certified. I could not have done it without you two." The AI that knew nothing in Level 1 just certified an 8×8 site. AI is not magic; it is built and checked by people like you!'
  };

  const IDLE_PROMPTS = [
    'Need help? Tap me or say "Nova, hint!" for guidance.',
    'Stuck on a signal? Just say "Nova, help!" and I will guide you.',
    'Curious about AI? Ask "Nova, what is a threshold?" or "Nova, what is sensor fusion?"'
  ];

  /**
   * Classify a child utterance. Returns null intent if Nova not addressed.
   */
  function classify(text) {
    if (!text || !text.trim()) return { intentId: null, confidence: 0 };
    const trimmed = text.trim();
    const addressed = /nova|ai|drone/i.test(trimmed);
    const isQuestion = /^(what|how|why|where|can|did|am|is|are)|.*\?$/i.test(trimmed);
    if (!addressed && !isQuestion) return { intentId: null, confidence: 0 };

    const sorted = [...INTENTS].sort((a, b) => b.priority - a.priority);
    for (const intent of sorted) {
      for (const pattern of intent.triggerPatterns) {
        if (pattern.test(trimmed)) return { intentId: intent.id, confidence: intent.priority / 100 };
      }
    }
    return { intentId: 'off_topic', confidence: 0.3 };
  }

  function getResponse(intentId, level) {
    if (intentId === 'hint' && level && LEVEL_HINTS[level]) return LEVEL_HINTS[level];
    const intent = INTENTS.find(i => i.id === intentId);
    if (!intent || !intent.responses.length) return 'Hmm, I am not sure about that. Try asking about thresholds, sensors, or confidence!';
    return intent.responses[Math.floor(Math.random() * intent.responses.length)];
  }

  function getLevelSuccess(level) { return LEVEL_SUCCESS[level] || LEVEL_SUCCESS[1]; }
  function getIdlePrompt() { return IDLE_PROMPTS[Math.floor(Math.random() * IDLE_PROMPTS.length)]; }
  function getLevelHint(level) { return LEVEL_HINTS[level] || LEVEL_HINTS[1]; }

  return { classify, getResponse, getLevelSuccess, getIdlePrompt, getLevelHint };
})();
