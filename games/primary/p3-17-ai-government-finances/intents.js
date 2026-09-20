/**
 * intents.js — Nova AI intent definitions & response templates
 * for the Compute Fee Meter game.
 *
 * Nova only responds when addressed ("Nova" or direct question).
 */
const Intents = (() => {
  'use strict';

  const INTENTS = [
    {
      id: 'help',
      triggerPatterns: [
        /nova.*help/i, /help.*nova/i, /^help$/i,
        /what.*do/i, /how.*play/i, /how.*work/i
      ],
      responses: [
        'You are running a data center billing system! Adjust the sliders to set how much each file costs to process. Higher fees keep the server stable but may overcharge small businesses.',
        'Your job is to set the Page Count Multiplier and RAM Premium Fee so the AI Document Parser charges fairly. Press Start to process the files!',
        'Look at the file sizes and RAM usage. Bigger files with high RAM need higher fees to keep the system from crashing.'
      ],
      priority: 95
    },
    {
      id: 'hint',
      triggerPatterns: [
        /nova.*hint/i, /hint.*nova/i, /^hint$/i,
        /give.*hint/i, /what.*setting/i, /what.*slider/i
      ],
      responses: [
        // Level-specific hints will override
        'Try moving one slider at a time and watch how the system responds.',
        'Check the file details — pages and RAM tell you what slider to adjust.',
        'The meters on the left show system load. Keep it out of the red zone!'
      ],
      priority: 90
    },
    {
      id: 'explain_slider',
      triggerPatterns: [
        /what.*(page|multiplier)/i, /page.*(count|multiplier)/i,
        /what.*ram/i, /ram.*premium/i, /explain.*slider/i
      ],
      responses: [
        'The Page Count Multiplier charges per page. More pages = bigger files need a higher multiplier.',
        'The RAM Premium Fee covers complex data processing. Files that use lots of RAM cost more to compute.',
        'Both sliders work together! Pages measure size, RAM measures complexity. Adjust both for the right price.'
      ],
      priority: 85
    },
    {
      id: 'fairness',
      triggerPatterns: [
        /fair/i, /fairness/i, /overcharge/i,
        /small.*business/i, /too.*much/i
      ],
      responses: [
        'Fairness matters! Small businesses with tiny files should not pay the same as giant corporations. Keep fees proportional.',
        'If you charge small files too much, fairness drops. Find a balance between covering costs and being fair.',
        'Overcharging small businesses lowers your fairness rating. Keep it above 75% to pass the level.'
      ],
      priority: 80
    },
    {
      id: 'system_load',
      triggerPatterns: [
        /load/i, /system.*load/i, /crash/i,
        /overload/i, /cool/i, /danger/i, /red.*zone/i
      ],
      responses: [
        'System load shows how hard the server is working. High fees help cool it down by throttling uploads.',
        'When system load hits 100%, the server crashes! Raise fees to slow down incoming files.',
        'Watch the load meter! If it turns yellow, start adjusting. If it turns red, you are in danger.'
      ],
      priority: 75
    },
    {
      id: 'tokens',
      triggerPatterns: [
        /token/i, /billed/i, /cost/i, /price/i,
        /charge/i, /revenue/i, /money/i
      ],
      responses: [
        'Tokens are the currency of cloud computing. Each file costs tokens based on its size and complexity.',
        'Billed tokens = (Pages \u00D7 Page Multiplier) + (RAM \u00D7 RAM Premium). Adjust the sliders to change the total.',
        'You need to collect enough tokens to cover the compute costs. But do not overcharge!'
      ],
      priority: 70
    },
    {
      id: 'levels',
      triggerPatterns: [
        /level/i, /next/i, /unlock/i, /progress/i
      ],
      responses: [
        'There are 5 levels. Each one teaches a new part of AI billing. Click the L1-L5 tabs to jump between them.',
        'All levels are unlocked! Start at Level 1 and work your way up. Each level gets more challenging.',
        'Use the tabs at the top to pick any level. Try to get 3 stars on each one!'
      ],
      priority: 65
    },
    {
      id: 'greeting',
      triggerPatterns: [
        /^(hi|hello|hey).*nova/i, /nova.*(hi|hello|hey)/i,
        /^nova$/i, /^hey$/i
      ],
      responses: [
        'Hi there! I am Nova, your data center AI assistant. Need help with the billing sliders? Just ask!',
        'Hello! Ready to manage the compute fees? Adjust the sliders and press Start to begin.',
        'Hey! I monitor the servers and can help with pricing. Say "Nova, help" if you are stuck!'
      ],
      priority: 50
    },
    {
      id: 'off_topic',
      triggerPatterns: [/.?/],
      responses: [
        'That is interesting! For now, let us focus on pricing these compute fees. Need help with the sliders?',
        'I am still learning about that! But I do know about cloud billing — want a hint?',
        'Good question! But right now, these corporate audits need pricing. Adjust the sliders!'
      ],
      priority: 0
    }
  ];

  const LEVEL_HINTS = {
    1: 'This is a big file! The Page Count Multiplier controls the total cost. Aim for exactly 510 tokens — try setting the multiplier to 5.',
    2: 'These spreadsheets are super complex with high RAM usage! Raise the RAM Premium Fee high to keep the system load cool.',
    3: 'Both sliders matter now! High page count files need the first slider. High RAM files need the second slider. Crank both to cool the load below 70%.',
    4: 'Careful with small business files! Small page counts or low RAM mean they cannot pay as much. Keep fairness above 75% while collecting 500 tokens.',
    5: 'You have 45 seconds! Match billed tokens to physical costs as closely as you can. Watch every file and adjust sliders fast.'
  };

  const LEVEL_SUCCESS_RESPONSES = {
    1: 'Great pricing! You matched the compute cost perfectly. The AI now knows big files cost more to process.',
    2: 'The system stayed cool! You learned that complex files need higher RAM premiums, not just page-based pricing.',
    3: 'Crisis averted! You balanced both sliders to handle the mixed workload. The AI now adjusts both parameters.',
    4: 'Fair and profitable! You balanced the budget while keeping small business fees reasonable.',
    5: 'Master of the billing matrix! You survived tax season with optimal pricing. The AI can now auto-scale with your settings.'
  };

  function classify(text, forceAddressed) {
    if (!text || !text.trim()) return { intentId: null, confidence: 0 };
    const trimmed = text.trim();

    // Only respond when explicitly addressed (by name OR avatar tap)
    const addressed = /nova/i.test(trimmed);
    if (!addressed && !forceAddressed) return { intentId: null, confidence: 0 };

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

  function getResponse(intentId, level) {
    if (intentId === 'hint' && level && LEVEL_HINTS[level]) {
      return LEVEL_HINTS[level];
    }
    const intent = INTENTS.find(i => i.id === intentId);
    if (!intent || !intent.responses.length) {
      return 'Hmm, I am not sure. Try asking "Nova, help" instead!';
    }
    return intent.responses[Math.floor(Math.random() * intent.responses.length)];
  }

  function getLevelSuccess(level) {
    return LEVEL_SUCCESS_RESPONSES[level] || 'Level complete! Great work with the billing system.';
  }

  return { classify, getResponse, getLevelSuccess, LEVEL_HINTS, LEVEL_SUCCESS_RESPONSES };
})();
