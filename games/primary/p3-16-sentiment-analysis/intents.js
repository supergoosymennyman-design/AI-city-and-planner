/**
 * intents.js — Nova intent definitions & response templates
 *
 * Classifies child utterances addressed to Nova and returns
 * short, child-friendly responses. All responses are 15-25 words,
 * P1-P3 vocabulary, emotionally expressive.
 */
const Intents = (() => {
  'use strict';

  const INTENTS = [
    {
      id: 'help',
      triggerPatterns: [
        /nova.*help/i, /^help/i, /what.*do/i, /how.*play/i,
        /how.*(route|sort|drag)/i, /how.*work/i, /what.*(game|this)/i,
      ],
      responses: [
        'Drag each email to the right department! "Bus" goes to Transit. "Trash" goes to Waste. "Park" goes to Parks. You are my teacher!',
        'Sort emails to teach me! Every correct drag shows me which words belong where. Start with the ones on the belt!',
      ],
      priority: 95,
    },
    {
      id: 'hint',
      triggerPatterns: [
        /nova.*hint/i, /^hint/i, /where.*(go|put)/i,
        /which.*(chute|department)/i, /stuck/i, /not.*sure/i,
      ],
      responses: [
        'Look for clue words! "Bus" = Transit (blue). "Trash" = Waste (orange). "Park" = Parks (green). Angry faces = hurry!',
        'Angry emails need fast help! The feeling number -5 means "help me NOW!" Happy +5 means "just saying thanks!"',
      ],
      priority: 90,
    },
    {
      id: 'what_is_sentiment',
      triggerPatterns: [
        /what.*(feeling|emotion|sentiment|score|number)/i,
        /score.*mean/i, /why.*number/i,
        /(negative|positive).*mean/i,
      ],
      responses: [
        'The feeling number! -5 means super angry — help them first! +5 means super happy. You taught me that!',
        '-5 is an angry person who needs help NOW. +5 is a happy person saying thanks. Angry = go first!',
      ],
      priority: 85,
    },
    {
      id: 'narrative_progress',
      triggerPatterns: [
        /what.*(learn|know)/i, /nova.*(learn|know)/i,
        /how.*(nova|i).*doing/i, /what.*i.*taught/i,
        /nova.*(progress|words|smart)/i,
      ],
      responses: [
        '__NARRATIVE_PROGRESS__',
        'I am learning lots! Every email you sort teaches me new words and feelings. Keep going, teacher!',
      ],
      priority: 82,
    },
    {
      id: 'what_is_keyword',
      triggerPatterns: [
        /what.*keyword/i, /what.*key.*word/i, /what.*topic/i,
        /how.*keyword/i, /how.*know.*(where|department)/i,
      ],
      responses: [
        'Keywords are clue words! "Bus" is a clue for Transit. "Park" is a clue for Parks. You teach me these!',
        '"Bus", "train", "road" = Transit words. "Tree", "flower", "bench" = Parks words. I learn from you!',
      ],
      priority: 80,
    },
    {
      id: 'narrative_learn',
      triggerPatterns: [
        /how.*(ai|nova).*(learn|train|teach)/i, /how.*work/i,
        /ai.*train/i, /why.*sort.*(teach|learn)/i,
      ],
      responses: [
        'It is like teaching a friend! Each email you sort right shows me one more thing. More examples = smarter me!',
        'You show me examples — I learn the pattern! "Bus" → Transit. "Trash" → Waste. Show me enough and I can do it myself!',
      ],
      priority: 78,
    },
    {
      id: 'explain_level',
      triggerPatterns: [
        /what.*level/i, /which.*level/i, /explain.*level/i,
        /what.*(do|now|next)/i,
      ],
      responses: [
        '__LEVEL_DYNAMIC__',
        'Every level teaches me something new! Keywords first, then urgency, then speed, then tricky emails, then a big crisis!',
      ],
      priority: 75,
    },
    {
      id: 'why_routing',
      triggerPatterns: [
        /why.*(route|sort|drag|department)/i,
        /why.*ai/i, /why.*nova/i,
      ],
      responses: [
        'Cities get tons of emails! I sort them fast so the right people fix the right problems. You train me to do it!',
        'I am an AI helper for the city! You teach me how to sort emails. The more you teach, the better I get!',
      ],
      priority: 70,
    },
    {
      id: 'greeting',
      triggerPatterns: [
        /^(hi|hello|hey)/i, /^nova$/i, /good (morning|afternoon|evening)/i,
      ],
      responses: [
        'Hi friend! Ready to sort some emails together? I am Nova, your AI student!',
        'Hey there! I have been waiting to learn from you! Ready to teach me?',
      ],
      priority: 50,
    },
    {
      id: 'off_topic',
      triggerPatterns: [/.*/],
      responses: [
        'Cool! But emails are piling up — can you sort that one first?',
        'That is fun! Now let me show you this email — where does it go?',
      ],
      priority: 0,
    },
  ];

  const LEVEL_EXPLANATIONS = {
    1: 'Level 1: First Words. Drag each word to its department! "Bus" goes to Transit. "Park" goes to Parks. Teach me my first words!',
    2: 'Level 2: Who Needs Help First? Order from angriest to happiest. Angry emails go FIRST — they need fast help!',
    3: 'Level 3: Speed Up! Emails are coming fast. I know keywords now — let me show you how fast I can sort!',
    4: 'Level 4: Tricky Emails. Some emails talk about TWO things. Read the feeling number to find the real problem!',
    5: 'Level 5: The Big Storm! A storm hit the city. Angry emails everywhere. Use everything you taught me!',
    6: 'Level 6: Watch Me! I will sort emails all by myself — super fast! You taught me everything I know.',
    7: 'Level 7: Something New! New words I have never seen. A smart AI knows when to ask for help!',
    8: 'Level 8: Nova Graduates! Watch me use everything you taught me at super speed!',
  };

  /**
   * Classify a child utterance against intent patterns.
   * Only responds if addressed to "Nova".
   */
  function classify(text) {
    if (!text || !text.trim()) return { intentId: null, confidence: 0 };

    const trimmed = text.trim();

    // Check if addressed to Nova
    if (!isAddressed(trimmed)) {
      return { intentId: null, confidence: 0 };
    }

    // Sort by priority descending, match patterns
    const sorted = [...INTENTS].sort((a, b) => b.priority - a.priority);
    for (const intent of sorted) {
      for (const pattern of intent.triggerPatterns) {
        if (pattern.test(trimmed)) {
          return { intentId: intent.id, confidence: intent.priority / 100 };
        }
      }
    }

    return { intentId: 'off_topic', confidence: 0.3 };
  }

  /**
   * Get a response for an intent, with level context.
   */
  function getResponse(intentId, level) {
    // Dynamic: level explanation
    if (intentId === 'explain_level' && level && LEVEL_EXPLANATIONS[level]) {
      return LEVEL_EXPLANATIONS[level];
    }

    // Dynamic: narrative progress from LearningDashboard
    if (intentId === 'narrative_progress') {
      if (window.LearningDashboard) {
        const m = LearningDashboard.getMetrics();
        const words = m.keywordCount || 0;
        const sent = m.sentimentPercent || 0;
        const topic = m.disambiguationPercent || 0;
        if (words === 0) {
          return 'I do not know any words yet! Start sorting to teach me!';
        }
        return 'I know ' + words + ' words so far! Feeling: ' + sent + '%. Tricky topics: ' + topic + '%. Keep teaching!';
      }
      const responses = INTENTS.find(i => i.id === 'narrative_progress').responses;
      const real = responses.filter(r => !r.startsWith('__'));
      return real[Math.floor(Math.random() * real.length)];
    }

    const intent = INTENTS.find(i => i.id === intentId);
    if (!intent || !intent.responses || !intent.responses.length) {
      return 'Hmm. Try asking me about sorting emails!';
    }

    const realResponses = intent.responses.filter(r => !r.startsWith('__'));
    if (!realResponses.length) {
      return 'Let me help you sort those emails!';
    }

    return realResponses[Math.floor(Math.random() * realResponses.length)];
  }

  /**
   * Check if text is addressed to Nova.
   * Only "Nova" (or "hey Nova", "Nova help") triggers.
   */
  function isAddressed(text) {
    if (!text || !text.trim()) return false;
    const trimmed = text.trim();
    // Simplified: only "nova" triggers, plus common friendly variants
    return /^nova\b/i.test(trimmed) || /(nova)[,.\s]/.test(trimmed) ||
      /(hey|hi|hello)\s*(nova)/i.test(trimmed);
  }

  return { classify, getResponse, isAddressed, LEVEL_EXPLANATIONS };
})();
