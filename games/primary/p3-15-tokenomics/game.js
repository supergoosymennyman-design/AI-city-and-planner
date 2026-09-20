/**
 * game.js — AI Token Exchange: Core Game Logic
 * P3 Lesson 15: Computational Tokenomics & Resource Allocation
 *
 * Students run a digital passport verification dashboard. Each level
 * introduces a NEW real-world AI tokenomics concept with its own mechanic:
 *
 *   L1 "Know Your Costs" — Different tasks cost different amounts
 *   L2 "Choose Your Model" — Premium AI models cost more (GPT-4 vs GPT-3.5)
 *   L3 "Batch & Save" — Batch API discounts (15% off grouped tasks)
 *   L4 "Priority Lane" — Priority/SLA tiers: 2x cost but +5 bonus tokens
 *   L5 "Cache & Optimize" — All mechanics combined + returning-citizen cache
 *   L6 "Nova Demonstrates" — Nova auto-allocates with all mechanics
 *   L7 "Nova at Scale" — 20 citizens, enterprise throughput
 *
 * Core formula:
 *   TokensSpent = sum of task costs, adjusted by model tier, priority, batch, cache
 *   Loss if tokensSpent > budget before objectives met
 */
const Game = (() => {
  'use strict';

  // ── Helpers ──
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }

  // ── Task Costs ──
  const TASK_COSTS   = { text: 2, lookup: 5, image: 10 };
  const PREMIUM_COSTS = { text: 5, lookup: 8, image: 15 };
  const BUDGET = 100;

  // ── Mechanic Constants ──
  const BATCH_DISCOUNT_PCT = 0.15;  // 15% off identical tasks in batch
  const PRIORITY_COST_MULT = 2;      // 2x task cost
  const PRIORITY_BONUS = 5;           // +5 bonus tokens per prioritized citizen
  const CACHE_DISCOUNT_PCT = 0.50;    // 50% off lookup for returning citizens

  // ── Level Definitions ──
  /**
   * Each level defines:
   *   id, name, budget, instruction, targetProcessed
   *   allowPremium, allowBatch, allowPriority, allowCache — feature flags
   *   citizens: array of citizen objects
   *   isNovaAuto, speed
   *   novaLesson: what Nova learns from this level
   */
  const LEVELS = [
    null,
    // ═══ Level 1: Know Your Costs ═══
    {
      id: 1, name: 'Know Your Costs', budget: 100,
      instruction: 'Turn ON the tasks each citizen needs. Text Reading = 2 tokens. App Lookup = 5 tokens. Process all 5 citizens!',
      targetProcessed: 5,
      allowPremium: false, allowBatch: false, allowPriority: false, allowCache: false,
      isNovaAuto: false,
      speed: 'normal',
      novaLesson: 'Different AI tasks consume different amounts of tokens. Text = 2, Lookup = 5, Image = 10.',
      citizens: [
        { name: 'Jane Doe',    available: ['text','lookup'], required: ['text','lookup'], needsModel: {} },
        { name: 'Carlos Ruiz', available: ['text','lookup'], required: ['text','lookup'], needsModel: {} },
        { name: 'Mei Lin',     available: ['text','lookup'], required: ['text','lookup'], needsModel: {} },
        { name: 'Ahmed Khan',  available: ['text','lookup'], required: ['text','lookup'], needsModel: {} },
        { name: 'Sofia Rossi', available: ['text','lookup'], required: ['text','lookup'], needsModel: {} }
      ]
    },
    // ═══ Level 2: Choose Your Model ═══
    {
      id: 2, name: 'Choose Your Model', budget: 120,
      instruction: 'Some citizens need the SUPER scanner for tough documents. Tap STD or PRM to choose. SUPER costs more but handles messy files!',
      targetProcessed: 6,
      allowPremium: true, allowBatch: false, allowPriority: false, allowCache: false,
      isNovaAuto: false,
      speed: 'normal',
      novaLesson: 'Premium AI models (like GPT-4) handle harder tasks but cost more tokens. Use Standard for clean docs, Premium only when needed.',
      citizens: [
        { name: 'Anna Wright', available: ['text','lookup'],       required: ['text','lookup'], needsModel: { text: 'premium', lookup: 'standard' } },
        { name: 'Brian Cole',  available: ['text','lookup','image'], required: ['text','lookup','image'], needsModel: { text: 'premium', lookup: 'standard', image: 'standard' } },
        { name: 'Claire Diaz', available: ['text','lookup'],       required: ['text','lookup'], needsModel: { text: 'standard', lookup: 'standard' } },
        { name: 'Daniel Fox',  available: ['text','lookup'],       required: ['lookup'],         needsModel: { lookup: 'premium' } },
        { name: 'Emma Green',  available: ['text','lookup'],       required: ['text','lookup'], needsModel: { text: 'standard', lookup: 'premium' } },
        { name: 'Felix Hart',  available: ['text','lookup','image'], required: ['text','lookup','image'], needsModel: { text: 'standard', lookup: 'premium', image: 'premium' } }
      ]
    },
    // ═══ Level 3: Batch & Save ═══
    {
      id: 3, name: 'Batch & Save', budget: 100,
      instruction: 'Process friends together and save tokens! Click "Process Group" to do 3 at once. Same tasks in a group cost less. Don\'t let them wait too long!',
      targetProcessed: 9,
      allowPremium: false, allowBatch: true, allowPriority: false, allowCache: false,
      isNovaAuto: false,
      speed: 'normal',
      novaLesson: 'Batching AI requests saves tokens — grouping identical tasks gives a 15% discount, just like real-world batch APIs. Bulk processing = lower cost per request!',
      citizens: [
        // Group 1
        { name: 'Grace Kim',     available: ['text','lookup'], required: ['text','lookup'], needsModel: {}, group: 1, patience: 45 },
        { name: 'Hiro Tanaka',   available: ['text','lookup'], required: ['text','lookup'], needsModel: {}, group: 1, patience: 40 },
        { name: 'Iris Johansson',available: ['text','lookup'], required: ['text','lookup'], needsModel: {}, group: 1, patience: 50 },
        // Group 2
        { name: 'Jack Robinson', available: ['text','lookup'], required: ['text','lookup'], needsModel: {}, group: 2, patience: 40 },
        { name: 'Kate O\'Brien', available: ['text','lookup'], required: ['text','lookup'], needsModel: {}, group: 2, patience: 35 },
        { name: 'Leo Fernandez', available: ['text','lookup'], required: ['text','lookup'], needsModel: {}, group: 2, patience: 45 },
        // Group 3
        { name: 'Maria Santos',  available: ['text','lookup'], required: ['text','lookup'], needsModel: {}, group: 3, patience: 35 },
        { name: 'Nathan Kim',    available: ['text','lookup'], required: ['text','lookup'], needsModel: {}, group: 3, patience: 30 },
        { name: 'Olga Braun',    available: ['text','lookup'], required: ['text','lookup'], needsModel: {}, group: 3, patience: 40 }
      ]
    },
    // ═══ Level 4: Priority Lane ═══
    {
      id: 4, name: 'Priority Lane', budget: 100,
      instruction: 'Some citizens are in a hurry! Turn ON "Priority" for them — costs double but adds +5 bonus tokens. Citizens with ⏰ badge MUST get priority!',
      targetProcessed: 8,
      allowPremium: false, allowBatch: false, allowPriority: true, allowCache: false,
      isNovaAuto: false,
      speed: 'normal',
      novaLesson: 'Priority AI processing (SLA tiers) costs more but adds budget capacity. Real AI services charge premiums for faster responses.',
      citizens: [
        { name: 'Peter Zhang',   available: ['text','lookup'],       required: ['text','lookup'], needsModel: {}, hasDeadline: true },
        { name: 'Quinn Murphy',  available: ['text','lookup','image'], required: ['text','lookup'], needsModel: {}, hasDeadline: false },
        { name: 'Rosa Garcia',   available: ['text','lookup'],       required: ['text','lookup'], needsModel: {}, hasDeadline: true },
        { name: 'Sam Lee',       available: ['text','lookup','image'], required: ['text','lookup','image'], needsModel: {}, hasDeadline: true },
        { name: 'Tina Brown',    available: ['text','lookup'],       required: ['text','lookup'], needsModel: {}, hasDeadline: false },
        { name: 'Uma Devi',      available: ['text','lookup','image'], required: ['text','lookup'], needsModel: {}, hasDeadline: false },
        { name: 'Victor Olaf',   available: ['text','lookup'],       required: ['text','lookup'], needsModel: {}, hasDeadline: false },
        { name: 'Wendy Chu',     available: ['text','lookup','image'], required: ['text','lookup'], needsModel: {}, hasDeadline: true }
      ]
    },
    // ═══ Level 5: Cache & Optimize ═══
    {
      id: 5, name: 'Cache & Optimize', budget: 160,
      instruction: 'Everything together! 🔄 Returning citizens cost less. Use SUPER scanner, priority, and batch groups all at once to save tokens!',
      targetProcessed: 12,
      allowPremium: true, allowBatch: true, allowPriority: true, allowCache: true,
      isNovaAuto: false,
      speed: 'normal',
      novaLesson: 'Real AI optimization combines ALL strategies: choose the right model, batch efficiently, prioritize only when needed, and leverage caching for repeats.',
      citizens: [
        { name: 'Alice Chen',    available: ['text','lookup','image'], required: ['text','lookup'],       needsModel: { text: 'standard', lookup: 'standard' }, hasDeadline: false, isReturning: true,  group: 1 },
        { name: 'Bob Marley',    available: ['text','lookup','image'], required: ['text','lookup','image'], needsModel: { text: 'premium',  lookup: 'premium',  image: 'premium' },  hasDeadline: true,  isReturning: false, group: 1 },
        { name: 'Clara Vega',    available: ['text','lookup'],       required: ['text','lookup'],       needsModel: { text: 'standard', lookup: 'standard' }, hasDeadline: false, isReturning: false, group: 1 },
        { name: 'David Park',    available: ['text','lookup','image'], required: ['lookup'],             needsModel: { lookup: 'premium' },                     hasDeadline: false, isReturning: true,  group: 2 },
        { name: 'Eva Lindgren',  available: ['text','lookup','image'], required: ['text','lookup'],       needsModel: { text: 'standard', lookup: 'standard' }, hasDeadline: false, isReturning: true,  group: 2 },
        { name: 'Frank Okafor',  available: ['text','lookup','image'], required: ['text','lookup','image'], needsModel: { text: 'premium',  lookup: 'premium',  image: 'standard' }, hasDeadline: true,  isReturning: false, group: 2 },
        { name: 'Grace Adams',   available: ['text','lookup','image'], required: ['text','lookup'],       needsModel: { text: 'standard', lookup: 'standard' }, hasDeadline: false, isReturning: false, group: 3 },
        { name: 'Hassan Ahmed',  available: ['text','lookup','image'], required: ['text','lookup'],       needsModel: { text: 'premium',  lookup: 'standard' }, hasDeadline: false, isReturning: true,  group: 3 },
        { name: 'Ivy Winters',   available: ['text','lookup','image'], required: ['lookup'],             needsModel: { lookup: 'standard' },                    hasDeadline: false, isReturning: false, group: 3 },
        { name: 'James Osei',    available: ['text','lookup'],       required: ['text','lookup'],       needsModel: { text: 'standard', lookup: 'premium' },  hasDeadline: true,  isReturning: false, group: 4 },
        { name: 'Kai Nakamura',  available: ['text','lookup','image'], required: ['text','lookup','image'], needsModel: { text: 'standard', lookup: 'premium',  image: 'premium' },  hasDeadline: true,  isReturning: false, group: 4 },
        { name: 'Luna Perez',    available: ['text','lookup','image'], required: ['text','lookup'],       needsModel: { text: 'standard', lookup: 'standard' }, hasDeadline: false, isReturning: true,  group: 4 }
      ]
    },
    // ═══ Level 6: Nova Demonstrates ═══
    {
      id: 6, name: 'Nova Takes Over', budget: 160,
      instruction: 'Watch Nova show off! Nova uses everything you taught to process all citizens perfectly.',
      targetProcessed: 12,
      allowPremium: true, allowBatch: true, allowPriority: true, allowCache: true,
      isNovaAuto: true,
      speed: 'fast',
      novaLesson: 'Nova has mastered ALL tokenomics strategies: model choice, batching, priority balancing, and cache optimization.',
      citizens: [] // Generated dynamically
    },
    // ═══ Level 7: Nova at Scale ═══
    {
      id: 7, name: 'Nova at Scale', budget: 500,
      instruction: 'Nova processes 20 citizens super fast! Watch the AI handle big workloads.',
      targetProcessed: 20,
      allowPremium: true, allowBatch: true, allowPriority: true, allowCache: true,
      isNovaAuto: true,
      speed: 'very-fast',
      novaLesson: 'Nova handles enterprise-scale token allocation — AI is ready for real passport verification systems!',
      citizens: [] // Generated dynamically
    }
  ];

  // ── State ──
  let currentLevel = 1;
  let phase = 'idle';      // idle | running | paused | complete | failed
  let stars = 0;
  let totalStars = 0;
  let levelScores = {};

  // Budget tracking
  let budget = BUDGET;
  let spent = 0;
  let bonusTokens = 0;       // L4: tokens earned from priority
  let cacheHits = 0;          // L5: cache discounts applied

  // Citizen queue
  let citizens = [];
  let currentCitizenIdx = 0;
  let processedCount = 0;

  // Task toggles for current citizen
  let toggles = { text: true, lookup: true, image: true };

  // Model tier selection per task type (L2, L5)
  let modelTiers = { text: 'standard', lookup: 'standard', image: 'standard' };

  // Priority toggle for current citizen (L4, L5)
  let priorityMode = false;

  // Batch state (L3, L5)
  let batchQueue = [];
  let batchActive = false;

  // Patience tracking (L3)
  let patienceInterval = null;

  // Transition lock
  let _transitionLock = false;
  const LOCK_TIMEOUT = 400;

  // Callbacks
  let onStateChange = null;
  let onToggleChange = null;
  let onModelChange = null;
  let onBatchUpdate = null;
  let onCitizenProcessed = null;
  let onLevelComplete = null;
  let onBudgetWarning = null;

  // Debug mode
  let debugMode = false;

  // Nova auto-allocation timer
  let autoTimer = null;

  // ── AI Narrative: Nova Learning ──
  const NOVA_LESSONS = {
    1: { lesson: 'Different AI tasks consume different amounts of tokens. Text = 2, Lookup = 5, Image = 10.' },
    2: { lesson: 'Premium AI models handle harder tasks but cost more. Use Standard for clean docs, Premium only for messy/hard cases.' },
     3: { lesson: 'Batching groups similar tasks together for a 15% discount — like buying in bulk! Real AI APIs charge less for batch requests because processing similar items at once is more efficient. Group citizens with the same task types to save tokens.' },
    4: { lesson: 'Priority processing costs a premium (2x) but adds budget capacity (+5 tokens). Real AI services have SLA tiers.' },
    5: { lesson: 'Real AI optimization combines ALL strategies: model choice, batching, priority balancing, and cache leverage.' },
    6: { lesson: 'Nova has mastered token budget allocation! She chooses optimal models, batches efficiently, and prioritizes perfectly.' },
    7: { lesson: 'Nova handles enterprise-scale token allocation — AI is production-ready for passport verification systems!' }
  };
  let novaKnowledge = {};

  function learnNovaLesson(levelId) {
    if (levelId >= 1 && levelId <= 7) {
      novaKnowledge[levelId] = true;
    }
  }

  function getNovaKnowledge() {
    const result = [];
    for (let i = 1; i <= 7; i++) {
      result.push({
        level: i,
        learned: !!novaKnowledge[i],
        lesson: NOVA_LESSONS[i] ? NOVA_LESSONS[i].lesson : ''
      });
    }
    return result;
  }

  function getNovaLesson(levelId) {
    return NOVA_LESSONS[levelId] ? NOVA_LESSONS[levelId].lesson : '';
  }

  function getNovaProgress() {
    const learned = Object.keys(novaKnowledge).length;
    return { learned, total: 7, pct: Math.round((learned / 7) * 100) };
  }

  // ── Core Math Functions ──

  /** Get base cost for a task type with chosen model tier */
  function getTaskCost(task, tier) {
    if (tier === 'premium') return PREMIUM_COSTS[task];
    return TASK_COSTS[task];
  }

  /** Calculate cost for a citizen given toggle + model + priority + cache state */
  function calcFullCost(toggles, modelTiers, isPriority, citizen) {
    let cost = 0;
    ['text', 'lookup', 'image'].forEach(task => {
      if (toggles[task]) {
        let taskCost = getTaskCost(task, modelTiers[task] || 'standard');
        // Cache discount for returning citizens (L5) — only on lookup
        if (task === 'lookup' && citizen && citizen.isReturning) {
          taskCost = Math.round(taskCost * (1 - CACHE_DISCOUNT_PCT));
        }
        cost += taskCost;
      }
    });
    // Priority doubles the cost (L4)
    if (isPriority) {
      cost *= PRIORITY_COST_MULT;
    }
    return cost;
  }

  /** Simple cost without premium/cache/priority — for backwards compat */
  function calcCitizenCost(toggles) {
    let cost = 0;
    if (toggles.text) cost += TASK_COSTS.text;
    if (toggles.lookup) cost += TASK_COSTS.lookup;
    if (toggles.image) cost += TASK_COSTS.image;
    return cost;
  }

  /** Check if model tier meets citizen's needs */
  function canProcessWithModels(citizen, modelTiers) {
    const tasks = ['text', 'lookup', 'image'];
    for (const task of tasks) {
      const needed = (citizen.needsModel && citizen.needsModel[task]) || 'standard';
      const chosen = modelTiers[task] || 'standard';
      // Premium can handle standard, but standard cannot handle premium
      if (needed === 'premium' && chosen === 'standard') {
        return false;
      }
    }
    return true;
  }

  /** Calculate batch discount for a set of citizens.
   *  Uses per-citizen optimal tiers (citizen only pays Premium if THEY need it). */
  function calcBatchDiscount(batch) {
    // Count occurrences of each (task, tier) combination in batch
    const counts = {};
    batch.forEach(c => {
      // Determine THIS citizen's optimal tier based on their needs
      const level = LEVELS[currentLevel];
      const tiers = {};
      ['text', 'lookup', 'image'].forEach(task => {
        if (level && level.allowPremium && c.needsModel && c.needsModel[task] === 'premium') {
          tiers[task] = 'premium';
        } else {
          tiers[task] = 'standard';
        }
      });
      ['text', 'lookup', 'image'].forEach(task => {
        if (c.available && c.available.includes(task)) {
          const tier = tiers[task] || 'standard';
          const key = task + ':' + tier;
          counts[key] = (counts[key] || 0) + 1;
        }
      });
    });

    // 15% off on the 2nd and 3rd occurrence of each identical (task+tier) pair
    let discount = 0;
    Object.entries(counts).forEach(([key, count]) => {
      if (count >= 2) {
        const [task, tier] = key.split(':');
        const taskCost = getTaskCost(task, tier);
        // Discount applies to duplicate tasks
        const discountedCount = Math.min(count - 1, 2); // up to 2 discounted
        discount += Math.round(discountedCount * taskCost * BATCH_DISCOUNT_PCT);
      }
    });
    return discount;
  }

  /** Calculate priority bonus (L4) */
  function calcPriorityBonus(priorityCount) {
    return priorityCount * PRIORITY_BONUS;
  }

  function calcTotalTaskCount(toggles) {
    let count = 0;
    if (toggles.text) count++;
    if (toggles.lookup) count++;
    if (toggles.image) count++;
    return count;
  }

  /** Get the actual cost to process ONE citizen with current state */
  function computeActualCost(citizen, toggles, modelTiers, priorityMode) {
    let cost = 0;
    ['text', 'lookup', 'image'].forEach(task => {
      if (toggles[task] && citizen.available && citizen.available.includes(task)) {
        let taskCost = getTaskCost(task, modelTiers[task] || 'standard');
        if (task === 'lookup' && citizen.isReturning) {
          taskCost = Math.round(taskCost * (1 - CACHE_DISCOUNT_PCT));
        }
        cost += taskCost;
      }
    });
    if (priorityMode) cost *= PRIORITY_COST_MULT;
    return cost;
  }

  /**
   * Nova's optimal auto-allocation for Levels 6-7
   * Handles ALL mechanics: model choice, batching, priority, cache
   */
  function novaAutoAllocateFull(citizen, remainingBudget, remainingCitizens, allowPremium, allowPriority) {
    const result = {
      text: citizen.required.includes('text'),
      lookup: citizen.required.includes('lookup'),
      image: citizen.required.includes('image')
    };

    const tiers = { text: 'standard', lookup: 'standard', image: 'standard' };
    const priority = false;

    // Choose model tiers — only upgrade to premium when citizen needs it
    if (allowPremium && citizen.needsModel) {
      ['text', 'lookup', 'image'].forEach(task => {
        if (citizen.needsModel[task] === 'premium') {
          tiers[task] = 'premium';
        }
      });
    }

    // Priority only for deadline citizens — but ONLY when there's plenty
    // of budget remaining. Nova must guarantee ALL citizens are processed,
    // so priority is skipped unless there's a large surplus.
    if (allowPriority && citizen.hasDeadline) {
      const baseCost = computeActualCost(citizen, result, tiers, false);
      const priorityCost = baseCost * PRIORITY_COST_MULT;
      const netPriorityCost = priorityCost - PRIORITY_BONUS;

      // Reserve a generous minimum per remaining citizen (8 tokens each)
      // to ensure later citizens don't run out of budget.
      const futureMin = (remainingCitizens - 1) * 8;

      // Only use priority if budget still covers ALL future citizens
      if (remainingBudget - netPriorityCost >= futureMin) {
        result._priority = true;
      }
    }

    // IMPORTANT: Nova only processes REQUIRED tasks (no optional extras).
    // Adding non-required image scans (10 tokens each) drains the budget
    // unpredictably. Nova must guarantee all citizens are processed.
    // Optional tasks are skipped to ensure reliable budget coverage.

    result._tiers = tiers;
    return result;
  }

  // ── Transition Lock ──
  function _acquireLock() {
    if (_transitionLock) return false;
    _transitionLock = true;
    return true;
  }

  function _releaseLock() {
    setTimeout(() => { _transitionLock = false; }, LOCK_TIMEOUT);
  }

  // ── Level Data Generation ──
  function generateLv6Citizens() {
    return [
      { name: 'Anna Wright', available: ['text','lookup','image'], required: ['text','lookup'], needsModel: { text:'standard', lookup:'standard' }, hasDeadline:false, isReturning:true,  group:1 },
      { name: 'Brian Cole',  available: ['text','lookup','image'], required: ['text','lookup','image'], needsModel: { text:'premium',  lookup:'premium',  image:'premium' },  hasDeadline:true,  isReturning:false, group:1 },
      { name: 'Claire Diaz', available: ['text','lookup'],         required: ['text','lookup'],       needsModel: { text:'standard', lookup:'standard' }, hasDeadline:false, isReturning:false, group:1 },
      { name: 'Daniel Fox',  available: ['text','lookup','image'], required: ['lookup'],             needsModel: { lookup:'premium' },                     hasDeadline:false, isReturning:true,  group:2 },
      { name: 'Emma Green',  available: ['text','lookup','image'], required: ['text','lookup'],       needsModel: { text:'standard', lookup:'standard' }, hasDeadline:false, isReturning:true,  group:2 },
      { name: 'Felix Hart',  available: ['text','lookup','image'], required: ['text','lookup','image'], needsModel: { text:'premium',  lookup:'premium',  image:'standard' }, hasDeadline:true,  isReturning:false, group:2 },
      { name: 'Grace Adams', available: ['text','lookup','image'], required: ['text','lookup'],       needsModel: { text:'standard', lookup:'standard' }, hasDeadline:false, isReturning:false, group:3 },
      { name: 'Hassan Ahmed',available: ['text','lookup','image'], required: ['text','lookup'],       needsModel: { text:'premium',  lookup:'standard' }, hasDeadline:false, isReturning:true,  group:3 },
      { name: 'Ivy Winters', available: ['text','lookup','image'], required: ['lookup'],             needsModel: { lookup:'standard' },                    hasDeadline:false, isReturning:false, group:3 },
      { name: 'James Osei',  available: ['text','lookup'],         required: ['text','lookup'],       needsModel: { text:'standard', lookup:'premium' },  hasDeadline:true,  isReturning:false, group:4 },
      { name: 'Kai Nakamura',available: ['text','lookup','image'], required: ['text','lookup','image'], needsModel: { text:'standard', lookup:'premium',  image:'premium' },  hasDeadline:true,  isReturning:false, group:4 },
      { name: 'Luna Perez',  available: ['text','lookup','image'], required: ['text','lookup'],       needsModel: { text:'standard', lookup:'standard' }, hasDeadline:false, isReturning:true,  group:4 }
    ];
  }

  function generateLv7Citizens() {
    const names = [
      'Aria Quinn','Blake Reed','Cora Stone','Drake Thorne','Ella Vine',
      'Finn Wade','Gwen Xu','Hayes York','Ivy Zane','Jude Ames',
      'Kate Banks','Leo Chase','Maya Dune','Nico Edge','Olive Frye',
      'Pax Grey','Reese Hale','Sage Ivy','Tate Joss','Uma Knox'
    ];
    return names.map((name, i) => ({
      name,
      available: ['text','lookup','image'],
      required: i % 4 === 0 ? ['text','lookup','image'] : i % 3 === 0 ? ['text','lookup'] : ['lookup'],
      needsModel: {
        text: i % 5 === 0 ? 'premium' : 'standard',
        lookup: i % 3 === 0 ? 'premium' : 'standard',
        image: i % 4 === 0 ? 'premium' : 'standard'
      },
      hasDeadline: i % 4 === 0,
      isReturning: i % 3 === 0,
      group: Math.floor(i / 4) + 1
    }));
  }

  // ── Initialization ──
  function startGame() {
    levelScores = {};
    totalStars = 0;
    novaKnowledge = {};
    resetLevel(1);
  }

  function init(callbacks) {
    onStateChange = callbacks.onStateChange || (() => {});
    onToggleChange = callbacks.onToggleChange || (() => {});
    onModelChange = callbacks.onModelChange || (() => {});
    onBatchUpdate = callbacks.onBatchUpdate || (() => {});
    onCitizenProcessed = callbacks.onCitizenProcessed || (() => {});
    onLevelComplete = callbacks.onLevelComplete || (() => {});
    onBudgetWarning = callbacks.onBudgetWarning || (() => {});
    startGame();
    onStateChange(getState());
  }

  function resetLevel(levelNum) {
    const level = LEVELS[levelNum];
    if (!level) return;

    if (typeof levelScores !== 'object' || levelScores === null) {
      levelScores = {};
    }

    currentLevel = levelNum;
    phase = 'idle';
    stars = 0;
    budget = level.budget;
    spent = 0;
    bonusTokens = 0;
    cacheHits = 0;
    currentCitizenIdx = 0;
    processedCount = 0;
    batchQueue = [];
    batchActive = false;
    priorityMode = false;
    modelTiers = { text: 'standard', lookup: 'standard', image: 'standard' };

    // Build citizen queue
    if (levelNum === 6) {
      citizens = generateLv6Citizens().map((c, i) => ({ ...c, id: i, status: 'pending', processing: false, spent: 0 }));
    } else if (levelNum === 7) {
      citizens = generateLv7Citizens().map((c, i) => ({ ...c, id: i, status: 'pending', processing: false, spent: 0 }));
    } else {
      citizens = level.citizens.map((c, i) => ({ ...c, id: i, status: 'pending', processing: false, spent: 0 }));
    }

    // Reset toggles — all available tasks start ON
    resetTogglesForCurrent();

    // Reset model tiers — start standard, upgrade if level has premium and citizen needs it
    if (level.allowPremium && getCurrentCitizen() && getCurrentCitizen().needsModel) {
      const c = getCurrentCitizen();
      modelTiers = {
        text: (c.needsModel.text === 'premium') ? 'premium' : 'standard',
        lookup: (c.needsModel.lookup === 'premium') ? 'premium' : 'standard',
        image: (c.needsModel.image === 'premium') ? 'premium' : 'standard'
      };
    }

    // Clear timers
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    stopPatienceTimer();

    onToggleChange({ ...toggles });
    if (onModelChange) onModelChange({ ...modelTiers });
    if (onBatchUpdate) onBatchUpdate([]);
    onStateChange(getState());
  }

  function resetTogglesForCurrent() {
    const c = getCurrentCitizen();
    toggles = {
      text: c ? c.available.includes('text') : true,
      lookup: c ? c.available.includes('lookup') : true,
      image: c ? c.available.includes('image') : true
    };
  }

  // ── Toggle Controls ──
  function setToggle(task, value) {
    const level = LEVELS[currentLevel];
    if (!level || (phase === 'running' && level.isNovaAuto)) return;

    const c = getCurrentCitizen();
    if (!c) return;

    // Don't allow toggling off required tasks
    if (!value && c.required.includes(task)) return;

    toggles[task] = value;
    onToggleChange({ ...toggles });
    onStateChange(getState());
  }

  function toggleTask(task) {
    setToggle(task, !toggles[task]);
  }

  // ── Model Tier Controls ──
  function setModelTier(task, tier) {
    const level = LEVELS[currentLevel];
    if (!level || !level.allowPremium) return;
    if (phase === 'running' && level.isNovaAuto) return;

    modelTiers[task] = tier;
    if (onModelChange) onModelChange({ ...modelTiers });
    onStateChange(getState());
  }

  function toggleModelTier(task) {
    const current = modelTiers[task] || 'standard';
    setModelTier(task, current === 'standard' ? 'premium' : 'standard');
  }

  // ── Priority Controls ──
  function setPriority(value) {
    const level = LEVELS[currentLevel];
    if (!level || !level.allowPriority) return;
    if (phase === 'running' && level.isNovaAuto) return;

    priorityMode = value;
    onStateChange(getState());
  }

  function togglePriority() {
    setPriority(!priorityMode);
  }

  // ── Batch Controls ──
  /** Get the current group's uncompleted citizens (auto-batched by group number).
   *  Includes the current processing citizen + all pending in the same group. */
  function getCurrentBatch() {
    const level = LEVELS[currentLevel];
    if (!level || !level.allowBatch) return [];
    const c = getCurrentCitizen();
    if (!c) return [];
    const currentGroup = c.group;
    if (!currentGroup) return [c];
    // Return ALL not-completed citizens in the same group (processing + pending)
    return citizens.filter(c => c.group === currentGroup && c.status !== 'completed');
  }

  /** Process the current batch (all pending citizens in the current group) */
  function processBatch() {
    if (!_acquireLock()) return;
    const level = LEVELS[currentLevel];
    if (!level || phase !== 'running' || !level.allowBatch) { _releaseLock(); return; }
    if (level.isNovaAuto) { _releaseLock(); return; }

    const batch = getCurrentBatch();
    if (batch.length === 0) {
      onBudgetWarning('No citizens to batch in the current group.');
      _releaseLock();
      return;
    }

    // Calculate batch discount (uses per-citizen optimal tiers)
    const discount = calcBatchDiscount(batch);

    // For each citizen in the batch, determine their OPTIMAL model tier
    // based on their OWN needs (not the global setting).
    // This way citizens who only need Standard don't pay Premium prices.
    function getOptimalTiersForCitizen(citizen) {
      if (!level.allowPremium || !citizen.needsModel) return { text: 'standard', lookup: 'standard', image: 'standard' };
      return {
        text: citizen.needsModel.text === 'premium' ? 'premium' : 'standard',
        lookup: citizen.needsModel.lookup === 'premium' ? 'premium' : 'standard',
        image: citizen.needsModel.image === 'premium' ? 'premium' : 'standard'
      };
    }

    // Calculate total cost — each citizen priced at THEIR optimal tier
    let totalCost = 0;
    const batchCosts = [];
    batch.forEach(c => {
      const cToggles = { text: false, lookup: false, image: false };
      c.available.forEach(t => { cToggles[t] = true; });
      const tiers = getOptimalTiersForCitizen(c);
      const cost = computeActualCost(c, cToggles, tiers, !!(c.hasDeadline && level.allowPriority));
      batchCosts.push({ citizen: c, cost, tiers });
      totalCost += cost;
    });

    // Apply discount
    totalCost -= discount;
    if (totalCost < 0) totalCost = 0;

    // Check budget
    if (spent + totalCost > budget + bonusTokens) {
      onBudgetWarning('Not enough tokens for batch! Group costs ' + totalCost + ' tokens, only ' + (budget + bonusTokens - spent) + ' available. Try processing individually with fewer tasks.');
      _releaseLock();
      return;
    }

    batchActive = true;
    spent += totalCost;

    // Mark all batch citizens as completed — each with their own cost & model
    batchCosts.forEach(({ citizen: c, cost, tiers }) => {
      const cToggles = { text: false, lookup: false, image: false };
      c.available.forEach(t => { cToggles[t] = true; });
      c.status = 'completed';
      c.processing = false;
      c.spent = cost;
      c.modelUsed = tiers;
      c.togglesUsed = cToggles;
      processedCount++;
    });

    // Advance to next citizen after batch
    const maxBatchId = Math.max(...batch.map(c => c.id));
    const nextIdx = citizens.findIndex(c => c.id > maxBatchId && c.status === 'pending');
    if (nextIdx === -1) {
      currentCitizenIdx = citizens.length;
    } else {
      currentCitizenIdx = nextIdx;
    }

    batchActive = false;

    if (onBatchUpdate) onBatchUpdate([]);
    onStateChange(getState());

    // Check level completion
    const allDone = citizens.every(c => c.status !== 'pending');
    if (allDone || processedCount >= level.targetProcessed) {
      setTimeout(() => endLevel(), 500);
    } else if (currentCitizenIdx < citizens.length) {
      moveToNextCitizen();
    } else {
      endLevel();
    }

    _releaseLock();
  }

  function moveToNextCitizen() {
    const nextPending = citizens.findIndex((c, i) => i > currentCitizenIdx && c.status === 'pending');
    if (nextPending !== -1) {
      currentCitizenIdx = nextPending;
    } else {
      // Wrap around
      const firstPending = citizens.findIndex(c => c.status === 'pending');
      if (firstPending !== -1) currentCitizenIdx = firstPending;
    }

    const c = citizens[currentCitizenIdx];
    if (c) {
      c.status = 'processing';
      c.processing = true;
      priorityMode = false;
      resetTogglesForCurrent();
      onToggleChange({ ...toggles });
      onStateChange(getState());
    }
  }

  // ── Patience Timer (L3) ──
  function startPatienceTimer() {
    stopPatienceTimer();
    const level = LEVELS[currentLevel];
    if (!level || !level.allowBatch) return;

    patienceInterval = setInterval(() => {
      let expired = false;
      citizens.forEach(c => {
        if (c.status === 'pending' && c.patience && c.patience > 0) {
          c.patience--;
          if (c.patience <= 0 && c.status === 'pending') {
            c.status = 'expired';
            c.processing = false;
            c.spent = 0;
            expired = true;
          }
        }
      });

      if (expired) {
        onStateChange(getState());
        // Check if still possible to meet target
        const remaining = citizens.filter(c => c.status === 'pending').length;
        const completed = processedCount;
        if (completed + remaining < level.targetProcessed) {
          // Auto-end: too many expired
          stopPatienceTimer();
          setTimeout(() => endLevel(), 300);
        }
      }
    }, 1000);
  }

  function stopPatienceTimer() {
    if (patienceInterval) { clearInterval(patienceInterval); patienceInterval = null; }
  }

  // ── Game Flow ──
  function startLevel() {
    if (!_acquireLock()) return;
    const level = LEVELS[currentLevel];
    if (!level || phase === 'running') { _releaseLock(); return; }

    phase = 'running';
    currentCitizenIdx = 0;
    processedCount = 0;
    spent = 0;
    bonusTokens = 0;
    cacheHits = 0;
    budget = level.budget;
    batchQueue = [];
    batchActive = false;
    priorityMode = false;

    // Reset all citizen statuses
    citizens.forEach((c, i) => {
      c.status = i === 0 ? 'processing' : 'pending';
      c.processing = (i === 0);
      c.spent = 0;
      // Reset patience timers
      if (c.patience === undefined && level.allowBatch && !level.isNovaAuto) {
        c.patience = 40 + randInt(0, 15);
      }
    });

    // Reset toggles for first citizen
    resetTogglesForCurrent();
    modelTiers = { text: 'standard', lookup: 'standard', image: 'standard' };

    onToggleChange({ ...toggles });
    if (onModelChange) onModelChange({ ...modelTiers });
    if (onBatchUpdate) onBatchUpdate([]);
    onStateChange(getState());

    // For Nova auto levels, begin auto-processing
    if (level.isNovaAuto) {
      stopPatienceTimer();
      autoTimer = setTimeout(() => autoProcessNova(0), 1000);
    } else {
      // Start patience timer for batch levels
      if (level.allowBatch) {
        startPatienceTimer();
      }
    }

    _releaseLock();
  }

  /** Process the current citizen with current toggle + model + priority settings */
  function processCitizen() {
    if (!_acquireLock()) return;
    const level = LEVELS[currentLevel];
    if (!level || phase !== 'running') { _releaseLock(); return; }
    if (level.isNovaAuto) { _releaseLock(); return; }

    const c = getCurrentCitizen();
    if (!c) { _releaseLock(); return; }

    // Must select at least one task
    if (calcTotalTaskCount(toggles) === 0) {
      onBudgetWarning('Select at least one task to verify this citizen!');
      _releaseLock();
      return;
    }

    // Check model compatibility
    if (level.allowPremium) {
      if (!canProcessWithModels(c, modelTiers)) {
        onBudgetWarning('This citizen needs a Premium model! Upgrade the model tier.');
        _releaseLock();
        return;
      }
    }

    // Calculate cost using full mechanics
    const cost = computeActualCost(c, toggles, modelTiers, priorityMode);

    // Check budget (accounting for bonus tokens from priority)
    const effectiveBudget = budget + bonusTokens;
    if (spent + cost > effectiveBudget) {
      onBudgetWarning('Not enough tokens! Try toggling off some tasks or changing model tiers.');
      _releaseLock();
      return;
    }

    // Check deadline + priority compliance (L4)
    if (level.allowPriority && c.hasDeadline && !priorityMode) {
      onBudgetWarning(c.name + ' has a deadline! Priority MUST be toggled ON.');
      _releaseLock();
      return;
    }

    // Process
    spent += cost;
    c.status = 'completed';
    c.processing = false;
    c.spent = cost;
    c.togglesUsed = { ...toggles };
    c.modelUsed = { ...modelTiers };
    c.priorityUsed = priorityMode;

    // Apply priority bonus
    if (priorityMode) {
      bonusTokens += PRIORITY_BONUS;
    }

    // Track cache hits
    if (c.isReturning && toggles.lookup) {
      cacheHits++;
    }

    processedCount++;
    priorityMode = false;

    onCitizenProcessed(c);

    // Move to next citizen
    const nextIdx = citizens.findIndex((c, i) => i > currentCitizenIdx && c.status === 'pending');
    if (nextIdx === -1) {
      // All processed
      endLevel();
    } else {
      currentCitizenIdx = nextIdx;
      citizens[nextIdx].status = 'processing';
      citizens[nextIdx].processing = true;
      resetTogglesForCurrent();
      onToggleChange({ ...toggles });
      onStateChange(getState());
    }

    _releaseLock();
  }

  /** Skip the current citizen */
  function skipCitizen() {
    if (!_acquireLock()) return;
    const level = LEVELS[currentLevel];
    if (!level || phase !== 'running') { _releaseLock(); return; }
    if (level.isNovaAuto) { _releaseLock(); return; }

    const c = getCurrentCitizen();
    if (!c) { _releaseLock(); return; }

    c.status = 'skipped';
    c.processing = false;
    c.spent = 0;
    c.togglesUsed = { text: false, lookup: false, image: false };

    const nextIdx = citizens.findIndex((c, i) => i > currentCitizenIdx && c.status === 'pending');
    if (nextIdx === -1) {
      endLevel();
    } else {
      currentCitizenIdx = nextIdx;
      citizens[nextIdx].status = 'processing';
      citizens[nextIdx].processing = true;
      priorityMode = false;
      resetTogglesForCurrent();
      onToggleChange({ ...toggles });
      onStateChange(getState());
    }

    _releaseLock();
  }

  /** Nova auto-processing for levels 6-7 (handles ALL mechanics) */
  function autoProcessNova(idx) {
    const level = LEVELS[currentLevel];
    if (!level || phase !== 'running') return;

    if (idx >= citizens.length) {
      endLevel();
      return;
    }

    const c = citizens[idx];
    // Skip already completed/expired citizens
    if (c.status === 'completed' || c.status === 'expired') {
      autoTimer = setTimeout(() => autoProcessNova(idx + 1), 200);
      return;
    }

    c.status = 'processing';
    c.processing = true;
    currentCitizenIdx = idx;

    const remainingBudget = (budget + bonusTokens) - spent;
    const remainingCitizens = citizens.length - idx;

    // Nova computes optimal allocation using full mechanics
    const optimal = novaAutoAllocateFull(c, remainingBudget, remainingCitizens, level.allowPremium, level.allowPriority);

    toggles = {
      text: optimal.text || false,
      lookup: optimal.lookup || false,
      image: optimal.image || false
    };
    modelTiers = optimal._tiers || { text: 'standard', lookup: 'standard', image: 'standard' };
    const usePriority = optimal._priority || false;

    const cost = computeActualCost(c, toggles, modelTiers, usePriority);

    if (spent + cost <= budget + bonusTokens) {
      spent += cost;
      c.status = 'completed';
      c.spent = cost;
      c.togglesUsed = { ...toggles };
      c.modelUsed = { ...modelTiers };
      c.priorityUsed = usePriority;
      if (usePriority) bonusTokens += PRIORITY_BONUS;
      if (c.isReturning && toggles.lookup) cacheHits++;
      processedCount++;
    } else {
      // Safety fallback: minimal processing
      const minToggles = {
        text: c.required.includes('text'),
        lookup: c.required.includes('lookup'),
        image: c.required.includes('image')
      };
      const minCost = computeActualCost(c, minToggles, { text:'standard',lookup:'standard',image:'standard' }, false);
      if (spent + minCost <= budget + bonusTokens) {
        spent += minCost;
        c.status = 'completed';
        c.spent = minCost;
        c.togglesUsed = { ...minToggles };
        processedCount++;
      } else {
        c.status = 'skipped';
        c.spent = 0;
      }
    }

    c.processing = false;
    onToggleChange({ ...toggles });
    if (onModelChange) onModelChange({ ...modelTiers });
    onCitizenProcessed(c);
    onStateChange(getState());

    const delay = level.speed === 'very-fast' ? 400 : 800;
    autoTimer = setTimeout(() => autoProcessNova(idx + 1), delay);
  }

  function endLevel() {
    if (phase !== 'running') return;
    phase = 'complete';
    stopPatienceTimer();

    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }

    const level = LEVELS[currentLevel];
    const result = evaluateLevel(level);

    stars = result.stars;
    if (result.passed) {
      levelScores[currentLevel] = { stars, passed: true };
      totalStars = Object.values(levelScores).reduce((s, l) => s + (l.stars || 0), 0);
      learnNovaLesson(currentLevel);
    } else {
      levelScores[currentLevel] = { stars: 0, passed: false };
    }

    onLevelComplete(result);
    onStateChange(getState());
  }

  function evaluateLevel(level) {
    const lv = level.id;
    const allProcessed = processedCount >= level.targetProcessed;
    const effectiveBudget = budget + bonusTokens;
    const withinBudget = spent <= effectiveBudget;
    const remaining = effectiveBudget - spent;

    // Check if all citizens expired
    const expiredCount = citizens.filter(c => c.status === 'expired').length;
    if (expiredCount > 0 && !allProcessed) {
      return { passed: false, stars: 0,
        message: expiredCount + ' citizen(s) left due to patience timeout! Process faster or use the batch button.' };
    }

    const allSkipped = citizens.length > 0 && citizens.every(c => c.status === 'skipped');
    if (allSkipped) {
      return { passed: false, stars: 0,
        message: 'Every citizen was skipped! Try processing with some tasks enabled.' };
    }

    if (!allProcessed) {
      return { passed: false, stars: 0,
        message: 'Not enough citizens processed! Process ' + level.targetProcessed + ' to pass.' };
    }

    if (!withinBudget) {
      return { passed: false, stars: 0,
        message: 'Over budget! You spent ' + spent + ' tokens but only had ' + effectiveBudget + '.' };
    }

    // ── Star ratings per level ──
    if (lv === 1) {
      if (remaining >= 50) return { passed: true, stars: 3, message: 'Perfect! All 5 citizens processed with ' + remaining + ' tokens to spare!' };
      return { passed: true, stars: 2, message: 'All 5 citizens processed! Great start to AI token budgeting.' };
    }

    if (lv === 2) {
      // Model choice level — must not waste premium
      const premiumWasted = citizens.some(c => {
        if (!c.modelUsed) return false;
        return Object.entries(c.needsModel || {}).some(([task, needed]) => {
          return needed === 'standard' && c.modelUsed[task] === 'premium';
        });
      });
      if (remaining >= 30 && !premiumWasted) {
        return { passed: true, stars: 3, message: 'Excellent model choices! Premium only where needed, lots of tokens saved.' };
      } else if (allProcessed && withinBudget) {
        return { passed: true, stars: 2, message: 'All citizens processed! Try using Standard models when Premium is not needed.' };
      }
      return { passed: true, stars: 1, message: 'Level complete! Refine your model choices for maximum efficiency.' };
    }

    if (lv === 3) {
      // Batch level — reward using batch
      const usedBatch = citizens.some(c => c.status === 'completed' && c.spent > 0);
      if (remaining >= 15 && usedBatch) {
        return { passed: true, stars: 3, message: 'Batch mastery! You saved tokens by grouping identical tasks — just like real batch APIs!' };
      } else if (allProcessed) {
        return { passed: true, stars: 2, message: 'All citizens processed! Try using the batch button to save even more tokens.' };
      }
      return { passed: true, stars: 1, message: 'Level complete! Batch processing can save you tokens.' };
    }

    if (lv === 4) {
      // Priority level — deadline compliance
      const deadlinesMet = citizens.filter(c => c.hasDeadline).every(c => c.priorityUsed);
      if (deadlinesMet && remaining >= 5) {
        return { passed: true, stars: 3, message: 'Priority mastered! All deadlines met and bonus tokens earned. Like real SLA management!' };
      } else if (allProcessed && deadlinesMet) {
        return { passed: true, stars: 2, message: 'All processed with deadlines met. Smart priority management!' };
      }
      return { passed: true, stars: 1, message: 'Level complete! Remember: deadline citizens MUST have priority toggled on.' };
    }

    if (lv === 5) {
      // All mechanics combined
      const allRequired = citizens.every(c => {
        if (!c.togglesUsed) return true;
        return c.required.every(task => c.togglesUsed[task]);
      });
      if (allProcessed && allRequired && remaining >= 5) {
        return { passed: true, stars: 3, message: 'Optimization master! All mechanics combined perfectly — model choice, batch, priority, and cache!' };
      } else if (allProcessed && withinBudget) {
        return { passed: true, stars: 2, message: 'Complex citizens handled! All critical items processed.' };
      }
      return { passed: false, stars: 0, message: 'Make sure ALL required tasks are on for every citizen!' };
    }

    if (lv === 6) {
      if (allProcessed && withinBudget) {
        return { passed: true, stars: 3, message: 'Nova perfectly allocated tokens for all 12 citizens! AI has mastered every tokenomics strategy.' };
      }
      return { passed: true, stars: 1, message: 'Nova processed the citizens. AI keeps improving!' };
    }

    if (lv === 7) {
      if (allProcessed && withinBudget) {
        return { passed: true, stars: 3, message: 'Nova processed 20 citizens at lightning speed! AI is enterprise-ready for passport verification!' };
      }
      return { passed: true, stars: 1, message: 'Nova handled the scale. AI adapts and improves automatically!' };
    }

    return { passed: true, stars: 1, message: 'Level complete!' };
  }

  // ── Getters ──
  function getState() {
    const level = LEVELS[currentLevel];
    return {
      currentLevel,
      phase,
      level,
      budget,
      spent,
      bonusTokens,
      cacheHits,
      remaining: (budget + bonusTokens) - spent,
      citizens,
      processedCount,
      currentCitizenIdx,
      toggles: { ...toggles },
      modelTiers: { ...modelTiers },
      priorityMode,
      batchQueue: [...batchQueue],
      batchActive,
      stars,
      totalStars,
      levelScores: { ...levelScores },
      debugMode,
      novaKnowledge: { ...novaKnowledge }
    };
  }

  function getCurrentCitizen() {
    if (currentCitizenIdx < citizens.length) {
      // Find the citizen with status 'processing' first
      const proc = citizens.find(c => c.processing);
      if (proc) return proc;
      if (citizens[currentCitizenIdx].status === 'pending') return citizens[currentCitizenIdx];
    }
    // Find first pending citizen
    const pending = citizens.find(c => c.status === 'pending');
    if (pending) return pending;
    return null;
  }

  function getNextCitizen() {
    const idx = citizens.findIndex((c, i) => i > currentCitizenIdx && c.status === 'pending');
    if (idx !== -1) return citizens[idx];
    return null;
  }

  function getCurrentCitizenCost() {
    const c = getCurrentCitizen();
    return computeActualCost(c, toggles, modelTiers, priorityMode);
  }

  function canProcess() {
    if (calcTotalTaskCount(toggles) === 0) return false;
    const c = getCurrentCitizen();
    if (!c) return false;
    const cost = computeActualCost(c, toggles, modelTiers, priorityMode);
    return (spent + cost <= budget + bonusTokens) && c !== null;
  }

  function toggleDebug() {
    debugMode = !debugMode;
    onStateChange(getState());
    return debugMode;
  }

  function getDebugAnalytics() {
    const level = LEVELS[currentLevel];
    const c = getCurrentCitizen();
    let lines = [];
    lines.push('Level: ' + currentLevel + ' | Phase: ' + phase);
    lines.push('Budget: ' + budget + ' | Spent: ' + spent + ' | Bonus: ' + bonusTokens + ' | Remaining: ' + (budget + bonusTokens - spent));
    lines.push('Features: Premium=' + level.allowPremium + ' Batch=' + level.allowBatch + ' Priority=' + level.allowPriority + ' Cache=' + level.allowCache);
    lines.push('Processed: ' + processedCount + '/' + citizens.length + ' | Cache Hits: ' + cacheHits);
    if (c) {
      lines.push('Current: ' + c.name + ' | Deadline: ' + (c.hasDeadline ? 'YES' : 'no') + ' | Returning: ' + (c.isReturning ? 'YES' : 'no'));
      lines.push('Toggles: text=' + toggles.text + ' lookup=' + toggles.lookup + ' image=' + toggles.image);
      lines.push('Models: text=' + modelTiers.text + ' lookup=' + modelTiers.lookup + ' image=' + modelTiers.image);
      lines.push('Priority: ' + priorityMode);
      const cost = computeActualCost(c, toggles, modelTiers, priorityMode);
      lines.push('Current Cost: ' + cost + ' tokens');
    }
    if (batchQueue.length > 0) {
      lines.push('Batch: ' + batchQueue.length + ' citizens | Discount: ' + calcBatchDiscount(batchQueue, modelTiers) + ' tokens');
    }
    lines.push('Stars: ' + stars + ' | Total: ' + totalStars);
    return lines.join('\n');
  }

  // ── Level Navigation ──
  function retryLevel() {
    if (!_acquireLock()) return;
    resetLevel(currentLevel);
    _releaseLock();
  }

  function goToLevel(levelNum) {
    if (!_acquireLock()) return;
    if (levelNum >= 1 && levelNum <= 7) {
      resetLevel(levelNum);
    }
    _releaseLock();
  }

  function goNextLevel() {
    if (!_acquireLock()) return;
    const next = currentLevel + 1;
    if (next <= 7) resetLevel(next);
    _releaseLock();
  }

  return {
    // Core
    init, startGame, resetLevel,
    startLevel, endLevel, retryLevel,
    processCitizen, skipCitizen,
    goToLevel, goNextLevel,

    // Toggles & models
    setToggle, toggleTask,
    setModelTier, toggleModelTier,
    setPriority, togglePriority,

    // Batch (auto-group)
    getCurrentBatch, processBatch,

    // State
    getState, getCurrentCitizen, getNextCitizen,
    getCurrentCitizenCost, canProcess,

    // Math (exposed for tests & UI)
    calcCitizenCost, computeActualCost,
    calcBatchDiscount, calcPriorityBonus,
    canProcessWithModels, getTaskCost,
    novaAutoAllocateFull,

    // Constants
    TASK_COSTS, PREMIUM_COSTS, BUDGET,
    BATCH_DISCOUNT_PCT, PRIORITY_COST_MULT, PRIORITY_BONUS, CACHE_DISCOUNT_PCT,

    // Debug
    toggleDebug, getDebugAnalytics,

    // Levels
    LEVELS,

    // AI narrative
    getNovaKnowledge, getNovaLesson, getNovaProgress,
    NOVA_LESSONS
  };
})();
