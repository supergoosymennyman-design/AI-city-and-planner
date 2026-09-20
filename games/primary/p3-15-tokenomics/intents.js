/**
 * intents.js — Nova AI intent definitions for AI Token Exchange
 *
 * Nova only responds when addressed ("Nova" or direct question).
 * Context: token budgets, model tiers, batch processing, priority, caching.
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
        'You run a passport verification office! Different AI tasks cost different tokens. Text = 2, Lookup = 5, Image = 10. Some levels add Premium models, batch discounts, priority lanes, or cache savings!',
        'Each level teaches a new AI tokenomics concept. Level 1 is basic costs. Level 2 lets you choose Standard vs Premium models. Level 3 adds batch discounts. Level 4 has priority lanes. Level 5 combines everything!',
        'Look at each citizen\'s tasks and badges. Some need Premium models, some have deadlines, some are returning citizens with cache discounts. Toggle tasks and model tiers, then Process!'
      ],
      priority: 95
    },
    {
      id: 'hint',
      triggerPatterns: [
        /nova.*hint/i, /hint.*nova/i, /^hint$/i,
        /give.*hint/i, /what.*do$/i
      ],
      responses: [
        'Check which badges each citizen has — deadline means priority required, premium badge means upgrade the model tier.',
        'For batch levels, add 2-3 citizens to the batch and Process Batch for a 15% discount on identical tasks!',
        'Keep an eye on your remaining budget at the top. Use Standard models when Premium is not needed!'
      ],
      priority: 90
    },
    {
      id: 'explain_tasks',
      triggerPatterns: [
        /what.*(text|reading)/i, /text.*cost/i,
        /what.*lookup/i, /lookup.*cost/i,
        /what.*image/i, /image.*cost/i,
        /explain.*task/i, /task.*cost/i
      ],
      responses: [
        'Text reading checks the name — Standard costs 2 tokens, Premium handles messy handwriting for 5 tokens.',
        'Application lookups search databases — Standard is 5 tokens, Premium cross-references multiple databases for 8 tokens.',
        'Image face matching uses computer vision — Standard is 10 tokens, Premium adds liveness detection for 15 tokens.',
        'Text = 2 (STD) / 5 (PRM), Lookup = 5 (STD) / 8 (PRM), Image = 10 (STD) / 15 (PRM). Premium handles harder cases!'
      ],
      priority: 85
    },
    {
      id: 'tokens',
      triggerPatterns: [
        /token/i, /budget/i, /cost/i, /price/i,
        /spend/i, /save/i, /money/i, /coin/i
      ],
      responses: [
        'Tokens are your budget for AI processing. Different tasks cost different amounts, and Premium models cost more. Plan your spending carefully!',
        'Your token budget is like money — spend it wisely! Text is cheap, images are expensive. Premium models cost extra but handle harder tasks.',
        'Budget varies per level. Some levels give bonus tokens from priority processing. Don\'t run out before processing everyone!'
      ],
      priority: 70
    },
    {
      id: 'model_tiers',
      triggerPatterns: [
        /premium/i, /standard/i, /model.*(tier|choice)/i,
        /std/i, /prm/i, /gpt/i
      ],
      responses: [
        'Standard models are cheaper but can only handle clean, simple tasks. Premium models cost more but handle messy handwriting, database cross-references, and advanced image detection.',
        'Premium models are like GPT-4 — powerful but expensive! Standard is like GPT-3.5 — cheaper and fine for basic tasks. Use Premium only when a citizen needs it.',
        'Look at the citizen\'s badges to see if they need Premium. A purple P badge means premium required for that task!'
      ],
      priority: 80
    },
    {
      id: 'batch',
      triggerPatterns: [
        /batch/i, /group/i, /bundle/i, /discount/i, /save.*token/i
      ],
      responses: [
        'Batch processing groups citizens together for a 15% discount on identical tasks. Add 2-3 citizens to the batch, then hit Process Batch!',
        'Batching groups similar tasks together for a 15% discount — like buying in bulk! Real AI APIs charge less for batch requests. Group citizens with the same tasks to save tokens.',
        'Tap citizens in the queue to add them to the batch. The discount shows a green badge. More identical tasks = more savings!'
      ],
      priority: 80
    },
    {
      id: 'priority',
      triggerPatterns: [
        /priority/i, /deadline/i, /sla/i, /urgent/i, /bonus/i
      ],
      responses: [
        'Priority mode doubles the task cost but gives you +5 bonus tokens! Citizens with the clock badge MUST be prioritized — they have deadlines.',
        'Priority is like real AI service tiers (SLA). You pay more for faster processing but gain budget capacity for more citizens.',
        'Only toggle Priority for citizens with deadline badges. Optional priority on others gives bonus tokens if you have spare budget!'
      ],
      priority: 75
    },
    {
      id: 'cache',
      triggerPatterns: [
        /cache/i, /return/i, /repeat/i, /revisit/i, /again/i
      ],
      responses: [
        'Returning citizens get 50% off lookup costs — their data is already cached! Look for the green checkmark badge on citizens.',
        'AI caches make repeated queries cheaper. Just like when you visit a website again and it loads faster — returning citizens cost less for database lookups!',
        'Process returning citizens early to benefit from cache discounts. Their lookup tasks cost half the normal price!'
      ],
      priority: 75
    },
    {
      id: 'levels',
      triggerPatterns: [
        /level/i, /next/i, /unlock/i, /progress/i, /stage/i
      ],
      responses: [
        'There are 7 levels! Each teaches a new AI tokenomics concept: costs, model tiers, batch discounts, priority lanes, caching, and combined optimization.',
        'All levels are unlocked! L1 = basic costs, L2 = model choice, L3 = batch, L4 = priority, L5 = all combined, L6-L7 = watch me demonstrate!',
        'Use the L1-L7 buttons at the top to jump between levels. Try getting 3 stars on each!'
      ],
      priority: 65
    },
    {
      id: 'nova_learn',
      triggerPatterns: [
        /nova.*learn/i, /learn.*nova/i, /teach.*nova/i,
        /nova.*know/i, /what.*nova.*know/i
      ],
      responses: [
        'I am learning from you! Each level teaches me a new tokenomics concept — model choice, batching, priority, and caching. Check my progress bar!',
        'You are teaching me how to optimize AI token spending! After 5 levels, I demonstrate what I have learned in levels 6 and 7.',
        'I start knowing nothing about token budgets. You show me by making decisions about model tiers, batches, and priority!'
      ],
      priority: 60
    },
    {
      id: 'greeting',
      triggerPatterns: [
        /^(hi|hello|hey).*nova/i, /nova.*(hi|hello|hey)/i,
        /^nova$/i, /^hey$/i
      ],
      responses: [
        'Hi! I am Nova, your AI token advisor. Need help with model tiers, batch processing, or priority lanes? Just ask!',
        'Hello! Ready to optimize some AI token budgets? Remember — Premium costs more, batching saves tokens, and returning citizens get discounts!',
        'Hey! I am here to help with token allocation. Say "Nova, help" if you need a hint!'
      ],
      priority: 50
    },
    {
      id: 'off_topic',
      triggerPatterns: [/.?/],
      responses: [
        'That is interesting! But right now, these citizens need their passports verified. Need help with token allocation?',
        'I am still learning about that! But I do know about AI tokenomics — want a hint about model tiers or batching?',
        'Good question! For now, let us focus on processing these citizens within our token budget.'
      ],
      priority: 0
    }
  ];

  const LEVEL_HINTS = {
    1: 'All 5 citizens need text and lookup. That is 7 tokens each — 35 total. Easy! Just keep everything on and process.',
    2: 'Check each citizen\'s model needs! The purple P badge means Premium required. Upgrade only those tasks to save tokens.',
    3: 'Add 2-3 citizens to the batch for a 15% discount! Watch the patience timers — process before they expire.',
    4: 'Toggle Priority ON for citizens with the clock badge. Priority costs more but gives you +5 bonus tokens each.',
    5: 'All mechanics active! Choose model tiers, batch groups, prioritize deadlines, and leverage cache for returning citizens.'
  };

  const LEVEL_SUCCESS_RESPONSES = {
    1: 'Great start! You learned that different AI tasks cost different amounts of tokens.',
    2: 'Smart model choices! You learned to use Premium only when needed — just like choosing between GPT-4 and GPT-3.5.',
    3: 'Batch mastery! You saved tokens by grouping identical tasks — just like real batch API discounts.',
    4: 'Priority managed! You balanced cost vs bonus tokens and met all deadlines.',
    5: 'Optimization master! You combined all strategies — model choice, batching, priority, and caching.'
  };

  function classify(text, forceAddressed) {
    if (!text || !text.trim()) return { intentId: null, confidence: 0 };
    const trimmed = text.trim();

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
      return 'Hmm, I am not sure. Try asking "Nova, help"!';
    }
    return intent.responses[Math.floor(Math.random() * intent.responses.length)];
  }

  function getLevelSuccess(level) {
    return LEVEL_SUCCESS_RESPONSES[level] || 'Level complete! Great work with AI token allocation.';
  }

  return { classify, getResponse, getLevelSuccess, LEVEL_HINTS, LEVEL_SUCCESS_RESPONSES };
})();
