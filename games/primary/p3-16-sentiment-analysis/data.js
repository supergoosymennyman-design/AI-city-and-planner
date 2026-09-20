/**
 * data.js — Civic Feedback Router data layer
 *
 * All game data: email cards, department definitions, level configs,
 * and all user-facing text strings (externalized for easy i18n).
 */

const Data = (() => {
  'use strict';

  // ──────────────────────────────────────────────
  // All user-facing text strings
  // ──────────────────────────────────────────────
  const STRINGS = {
    gameTitle: 'Nova\'s AI Sorting Lab',
    gameSubtitle: 'Hi! I\'m Nova! I just got hired at the City Help Center. Companies send me emails, but I have NO idea where they go! Will you teach me? 🥺',
    menuPurpose: '<strong>🧠 7 AI skills to learn:</strong> Keyword Classification · Sentiment Analysis · Priority Routing · Pattern Recognition · Disambiguation · Crisis Response · Autonomous AI',
    startBtn: 'Teach Me! 🚀',
    loadingText: 'Waking up Nova...',
    modelLoading: 'AI is waking up...',
    levelLabel: 'Lesson',
    scoreLabel: 'Score',
    retryBtn: 'Try Again',
    nextBtn: 'Next Lesson',
    menuBtn: 'Lesson Menu',
    playAgainBtn: 'Play Again',
    celebrationTitle: 'City Hero!',
    celebrationMessage: '🧠 <strong>AI concepts learned:</strong><br>• Keyword classification<br>• Sentiment analysis<br>• Priority routing<br>• Pattern recognition<br>• Mixed-topic disambiguation<br>• Crisis response<br>• Autonomous AI deployment',
    transcriptTitle: 'Conversation History',
    settingsTitle: 'Settings',
    doneBtn: 'Done',
    speechSpeedLabel: 'Speech Speed',
    volumeLabel: 'Volume',
    voiceLabel: 'Voice',
    muteLabel: 'Mute',
    micLabel: 'Microphone',
    debugOn: 'Debug mode ON — belt paused',
    debugOff: 'Debug mode OFF — belt running',
    hintKeyword: 'Read the keyword and think: which department handles this? Parks = nature, Transit = transport, Waste = trash!',
    hintChute: 'You are teaching Nova! Every correct sort shows the AI which department handles which keywords.',
    hintSentiment: 'Negative scores = citizen is upset! Routing them correctly teaches Nova to prioritize urgent mail.',
    hintPriorityQueue: 'Arrange from most negative (angriest, most urgent) to most positive (happiest, least urgent). Lower scores first!',
    hintMixed: 'The sentiment score reveals the MAIN problem. Teach Nova how to read between the lines!',
    wrongDrop: 'Oops! Let me learn from that — try once more!',
    correctDrop: 'Yes! I learned that! One more connection in my brain! ⭐',
    beltOverflow: 'Too slow! That one fell off the belt. Speed matters too!',
    keywordCorrect: 'Got it! I learned that keyword! Adding to my memory! ⭐',
    keywordWrong: 'Hmm, that word doesn\'t go there. Try the right department!',
    priorityCorrect: 'Right position! The feeling number tells us the priority order!',
    priorityWrong: 'Not quite — check the feeling number. Angrier = higher priority!',
    allCorrect: 'Perfect! All in the right place!',
    checkOrder: 'Check Order',
    submitOrder: 'Submit Order',
    levelPassed: 'I learned something new! 🎉 One step closer to being a real AI!',
    levelFailed: 'That was tricky. Let\'s try again! Mistakes help me learn what NOT to do.',
    selectLevel: 'Select a lesson to teach Nova how to route citizen emails!',
    beltPaused: '🔧 BELT PAUSED — examine the keywords',
    listening: 'listening',
    thinking: 'thinking',
    speaking: 'speaking',
    idle: 'idle',
    // AI demonstration strings
    aiDemoTitle: 'Nova Takes Over!',
    aiDemoSubtitle: 'Watch what your AI learned to do...',
    aiDemoInstruction: 'Nova watched you sort every email. Now it can sort them ALL by itself — much faster!',
    aiDemoYourScore: 'Your Best Score',
    aiDemoAiScore: 'Nova\'s Score',
    aiDemoPerfect: 'Perfect!',
    aiDemoSpeed: 'Speed',
    aiDemoEmailsSorted: 'emails sorted',
    aiDemoComparison: 'You taught Nova well! It can now sort emails at superhuman speed — reading sentiment and keywords in milliseconds and routing to the right department instantly!',
    aiDemoReplay: 'Watch Again',
    aiDemoContinue: 'Finish',
  };

  // ──────────────────────────────────────────────
  // Department definitions
  // ──────────────────────────────────────────────
  const DEPARTMENTS = {
    parks: {
      id: 'parks',
      name: 'Parks & Recreation',
      chuteLabel: 'Parks',
      color: '#4CAF50',
      colorLight: '#81C784',
      colorDark: '#388E3C',
      colorBg: 'rgba(76, 175, 80, 0.15)',
      keywords: ['park', 'playground', 'garden', 'tree', 'flower', 'bench', 'fountain', 'grass', 'picnic', 'pond', 'trail', 'field', 'swing', 'slide'],
      icon: '🌳',
    },
    transit: {
      id: 'transit',
      name: 'Transit Authority',
      chuteLabel: 'Transit',
      color: '#2196F3',
      colorLight: '#64B5F6',
      colorDark: '#1976D2',
      colorBg: 'rgba(33, 150, 243, 0.15)',
      keywords: ['bus', 'train', 'stop', 'route', 'traffic', 'road', 'sidewalk', 'crossing', 'signal', 'lane', 'station', 'delay', 'schedule', 'track'],
      icon: '🚌',
    },
    waste: {
      id: 'waste',
      name: 'Waste Management',
      chuteLabel: 'Waste',
      color: '#FF9800',
      colorLight: '#FFB74D',
      colorDark: '#F57C00',
      colorBg: 'rgba(255, 152, 0, 0.15)',
      keywords: ['trash', 'bin', 'garbage', 'recycle', 'recycling', 'dump', 'litter', 'overflow', 'pickup', 'waste', 'disposal', 'dumpster', 'collection', 'rubbish', 'landfill'],
      icon: '🗑️',
    },
  };

  /**
   * Compute priority metadata for an email card.
   * PriorityWeight = abs(SentimentScore) * UrgencyMultiplier
   * UrgencyMultiplier = 2 if score <= -3, else 1
   * isUrgent = PriorityWeight > 7
   */
  function computePriority(sentimentScore) {
    const urgencyMultiplier = sentimentScore <= -3 ? 2 : 1;
    const priorityWeight = Math.abs(sentimentScore) * urgencyMultiplier;
    return {
      urgencyMultiplier,
      priorityWeight,
      isUrgent: priorityWeight > 7,
    };
  }

  /**
   * Calculate the score for correctly routing an email card.
   * Negative sentiments are weighted MORE heavily than positive ones.
   * This teaches that urgent/angry emails are more important to get right.
   *
   * Score formula: correctRouteScore = sentimentScore <= 0
   *   ? abs(sentimentScore) * 4 + 5   // negative: high weight (urgent)
   *   : abs(sentimentScore) * 1 + 5   // positive: low weight
   *
   * Range: -5→25, -4→21, -3→17, -2→13, -1→9, 0→5, +1→6, +2→7, +3→8, +4→9, +5→10
   */
  function calculateRouteScore(sentimentScore) {
    const absScore = Math.abs(sentimentScore);
    if (sentimentScore <= 0) {
      return absScore * 4 + 5;  // Negative: urgent, high weight
    } else {
      return absScore * 1 + 5;  // Positive: routine, low weight
    }
  }

  // ──────────────────────────────────────────────
  // Email card pool (shared across levels with some randomization)
  // Sentiment scores: -5 (very angry) to +5 (very happy)
  // ──────────────────────────────────────────────
  const EMAIL_POOL = [
    // ── Parks & Recreation ──
    {
      id: 'p1',
      text: 'The park fountain is broken and water is everywhere!',
      sentimentScore: -4,
      department: 'parks',
      keywords: ['fountain', 'park', 'water']
    },
    {
      id: 'p2',
      text: 'I love the new flowers in the garden! They look beautiful!',
      sentimentScore: 4,
      department: 'parks',
      keywords: ['flowers', 'garden']
    },
    {
      id: 'p3',
      text: 'The playground swings are rusty and dangerous!',
      sentimentScore: -5,
      department: 'parks',
      keywords: ['playground', 'swings']
    },
    {
      id: 'p4',
      text: 'There is a fallen tree blocking the walking trail.',
      sentimentScore: -3,
      department: 'parks',
      keywords: ['tree', 'trail']
    },
    {
      id: 'p5',
      text: 'The new benches in the park are lovely. Thank you!',
      sentimentScore: 3,
      department: 'parks',
      keywords: ['benches', 'park']
    },
    {
      id: 'p6',
      text: 'The grass in the park has not been cut in weeks!',
      sentimentScore: -2,
      department: 'parks',
      keywords: ['grass', 'park']
    },
    {
      id: 'p7',
      text: 'The pond is full of algae and smells terrible!',
      sentimentScore: -4,
      department: 'parks',
      keywords: ['pond']
    },
    {
      id: 'p8',
      text: 'Kids had a wonderful picnic at the park today!',
      sentimentScore: 5,
      department: 'parks',
      keywords: ['picnic', 'park']
    },

    // ── Transit Authority ──
    {
      id: 't1',
      text: 'The bus was late AGAIN! This is the third time this week!',
      sentimentScore: -4,
      department: 'transit',
      keywords: ['bus', 'late']
    },
    {
      id: 't2',
      text: 'The new train schedule is so convenient. Great job!',
      sentimentScore: 4,
      department: 'transit',
      keywords: ['train', 'schedule']
    },
    {
      id: 't3',
      text: 'The traffic light at Main Street is broken! Cars keep honking!',
      sentimentScore: -5,
      department: 'transit',
      keywords: ['traffic', 'signal']
    },
    {
      id: 't4',
      text: 'The sidewalk on Oak Road is cracked and dangerous to walk on.',
      sentimentScore: -3,
      department: 'transit',
      keywords: ['sidewalk', 'road']
    },
    {
      id: 't5',
      text: 'The bus stop near my house finally has a shelter! Happy!',
      sentimentScore: 3,
      department: 'transit',
      keywords: ['bus', 'stop']
    },
    {
      id: 't6',
      text: 'The crossing guard at Elm Street is never there in the morning!',
      sentimentScore: -3,
      department: 'transit',
      keywords: ['crossing']
    },
    {
      id: 't7',
      text: 'The train station is so clean and well-lit now. Impressive!',
      sentimentScore: 4,
      department: 'transit',
      keywords: ['train', 'station']
    },
    {
      id: 't8',
      text: 'The new bike lane on Pine Road is too narrow! Unsafe!',
      sentimentScore: -4,
      department: 'transit',
      keywords: ['road', 'lane']
    },

    // ── Waste Management ──
    {
      id: 'w1',
      text: 'Trash hasn\'t been picked up in weeks! The smell is horrible!',
      sentimentScore: -5,
      department: 'waste',
      keywords: ['trash', 'pickup']
    },
    {
      id: 'w2',
      text: 'The new recycling bins are so easy to use. Thank you!',
      sentimentScore: 4,
      department: 'waste',
      keywords: ['recycle', 'bins']
    },
    {
      id: 'w3',
      text: 'The garbage bin behind the school is overflowing with litter!',
      sentimentScore: -4,
      department: 'waste',
      keywords: ['garbage', 'bin', 'overflow', 'litter']
    },
    {
      id: 'w4',
      text: 'Someone dumped a mattress near the community dumpster!',
      sentimentScore: -3,
      department: 'waste',
      keywords: ['dump', 'dumpster']
    },
    {
      id: 'w5',
      text: 'The waste collection crew waved at my kids. So friendly!',
      sentimentScore: 3,
      department: 'waste',
      keywords: ['waste', 'collection']
    },
    {
      id: 'w6',
      text: 'The landfill smell is reaching our neighborhood. Disgusting!',
      sentimentScore: -5,
      department: 'waste',
      keywords: ['landfill']
    },
    {
      id: 'w7',
      text: 'The recycling pickup is always on time. Great service!',
      sentimentScore: 4,
      department: 'waste',
      keywords: ['recycle', 'pickup']
    },
    {
      id: 'w8',
      text: 'There is litter all over the street after the parade!',
      sentimentScore: -3,
      department: 'waste',
      keywords: ['litter']
    },

    // ── Mixed-topic emails (Level 4) ──
    {
      id: 'm1',
      text: 'I love the park, but the trash bins there are overflowing!',
      sentimentScore: -4,
      department: 'waste',
      keywords: ['park', 'trash', 'bins', 'overflow'],
      isMixed: true,
      mixedDepartments: ['parks', 'waste'],
    },
    {
      id: 'm2',
      text: 'The bus stop is near a beautiful garden, but garbage is piling up!',
      sentimentScore: -3,
      department: 'waste',
      keywords: ['bus', 'stop', 'garden', 'garbage'],
      isMixed: true,
      mixedDepartments: ['transit', 'waste', 'parks'],
    },
    {
      id: 'm3',
      text: 'The playground is wonderful, but the road to the park has huge potholes!',
      sentimentScore: -4,
      department: 'transit',
      keywords: ['playground', 'road', 'park'],
      isMixed: true,
      mixedDepartments: ['parks', 'transit'],
    },
    {
      id: 'm4',
      text: 'I enjoy the train ride to the park, but the benches at the station are broken.',
      sentimentScore: -2,
      department: 'parks',
      keywords: ['train', 'park', 'benches', 'station'],
      isMixed: true,
      mixedDepartments: ['transit', 'parks'],
    },
    {
      id: 'm5',
      text: 'The recycling bins at the bus terminal are always full. Empty them!',
      sentimentScore: -4,
      department: 'waste',
      keywords: ['recycle', 'bins', 'bus'],
      isMixed: true,
      mixedDepartments: ['waste', 'transit'],
    },
    {
      id: 'm6',
      text: 'The picnic area is lovely, but the litter nearby ruins the view.',
      sentimentScore: -3,
      department: 'waste',
      keywords: ['picnic', 'litter'],
      isMixed: true,
      mixedDepartments: ['parks', 'waste'],
    },
    {
      id: 'm7',
      text: 'The sidewalk near the flower garden needs repair, but the flowers are nice!',
      sentimentScore: -1,
      department: 'transit',
      keywords: ['sidewalk', 'flower', 'garden'],
      isMixed: true,
      mixedDepartments: ['transit', 'parks'],
    },
  ];

  // ──────────────────────────────────────────────
  // Level configurations
  // Scoring: each correctly routed email earns points.
  // Negative (urgent) emails are worth MORE — angry citizens need priority.
  // Score formula: negative = abs(score)*4+5, positive = abs(score)*1+5
  // ──────────────────────────────────────────────

  /** Keywords for the Keyword Sorter level (Level 1) */
  const KEYWORD_SORTER_ITEMS = [
    { keyword: 'park', department: 'parks' },
    { keyword: 'playground', department: 'parks' },
    { keyword: 'garden', department: 'parks' },
    { keyword: 'tree', department: 'parks' },
    { keyword: 'bench', department: 'parks' },
    { keyword: 'fountain', department: 'parks' },
    { keyword: 'bus', department: 'transit' },
    { keyword: 'train', department: 'transit' },
    { keyword: 'traffic', department: 'transit' },
    { keyword: 'road', department: 'transit' },
    { keyword: 'sidewalk', department: 'transit' },
    { keyword: 'crossing', department: 'transit' },
    { keyword: 'trash', department: 'waste' },
    { keyword: 'garbage', department: 'waste' },
    { keyword: 'recycle', department: 'waste' },
    { keyword: 'dump', department: 'waste' },
    { keyword: 'litter', department: 'waste' },
    { keyword: 'overflow', department: 'waste' },
  ];

  /** Messages for Priority Queue level (Level 2) */
  const PRIORITY_QUEUE_ITEMS = [
    { text: 'The bus was late AGAIN! I am furious!', sentimentScore: -5 },
    { text: 'Trash hasn\'t been picked up in weeks!', sentimentScore: -5 },
    { text: 'The playground swings are rusty and dangerous!', sentimentScore: -5 },
    { text: 'The park fountain is broken and flooding!', sentimentScore: -4 },
    { text: 'Garbage bin is overflowing with litter!', sentimentScore: -4 },
    { text: 'The sidewalk on Oak Road is cracked.', sentimentScore: -3 },
    { text: 'Someone dumped a mattress near the dumpster.', sentimentScore: -3 },
    { text: 'The grass in the park has not been cut.', sentimentScore: -2 },
    { text: 'The new train schedule is convenient!', sentimentScore: 4 },
    { text: 'The park flowers are beautiful!', sentimentScore: 4 },
  ];

  const LEVELS = {
    1: {
      id: 1,
      type: 'keyword_sort',
      name: 'Day 1: AI Learns Keywords',
      instruction: 'Let\'s start with keywords! Drag each word to the right department. Every one you sort correctly teaches me a new connection! 🎓 AI Lesson: Supervised Learning — AI learns word→department mapping from labeled examples.',
      description: 'Learn AI keyword-to-department mapping.',
      keywords: KEYWORD_SORTER_ITEMS,
      keywordCount: 12,      // 12 keywords per round (randomly selected)
      pointsPerCorrect: 10,
      minScore: 80,           // 80/120 = need 8/12 correct
      spawnInterval: 0,       // All at once
      newMechanic: 'Keyword-to-department matching',
      stars: { 120: 3, 100: 2, 80: 1 },
    },
    2: {
      id: 2,
      type: 'priority_order',
      name: 'Day 2: AI Learns Urgency',
      instruction: 'Two emails — one angry, one happy. The feeling number tells us who needs help FIRST! Negative = urgent! 🎓 AI Lesson: Sentiment = Urgency — AI reads emotions in text to decide priority.',
      description: 'Order by sentiment score, negative first.',
      messages: PRIORITY_QUEUE_ITEMS,
      messageCount: 6,        // 6 messages per round
      pointsPerCorrect: 15,
      minScore: 60,           // 60/90 = need 4/6 correct
      spawnInterval: 0,
      newMechanic: 'Sentiment-based priority ordering',
      stars: { 90: 3, 75: 2, 60: 1 },
    },
    3: {
      id: 3,
      type: 'belt',
      name: 'Day 3: AI Pattern Recognition',
      instruction: 'So many emails! But I\'m getting faster — I already know "bus" means Transit. Practice makes AI faster too! 🎓 AI Lesson: Pattern Recognition — AI classifies faster as it sees more examples.',
      description: 'Basic one-email routing.',
      emailIds: ['p2', 't1', 'w3'],
      emailCount: 3,
      beltSpeed: 0.4,
      minScore: 35,
      spawnInterval: 4000,
      newMechanic: 'Basic email routing',
      stars: { 50: 3, 42: 2, 35: 1 },
    },
    4: {
      id: 4,
      type: 'belt',
      name: 'Day 4: AI Learns Priority',
      instruction: 'Angry citizens need faster help! Route the negative-score emails before the happy ones. Emotion tells us priority! 🎓 AI Lesson: Priority Routing — negative sentiment = urgent, handled before positive.',
      description: 'Negative sentiment = urgent.',
      emailIds: ['p3', 'w1', 't2', 'p5', 't5', 'w5'],
      emailCount: 6,
      beltSpeed: 0.5,
      minScore: 60,
      spawnInterval: 3500,
      newMechanic: 'Priority routing (negative first)',
      stars: { 78: 3, 70: 2, 60: 1 },
      priorityMode: true,
    },
    5: {
      id: 5,
      type: 'belt',
      name: 'Day 5: AI Speeds Up',
      instruction: 'Whoa, so many emails flooding in at once! But all those examples you showed me made me faster. Let\'s sort them before they overflow! 🎓 AI Lesson: Throughput — AI handles volume at speed once patterns are learned.',
      description: 'Speed and volume.',
      emailIds: ['p1', 'p6', 't3', 't4', 'w2', 'w4', 'p7', 't6', 'w6', 'p4', 't7', 'w8'],
      emailCount: 8,
      beltSpeed: 0.7,
      minScore: 95,
      spawnInterval: 2800,
      newMechanic: 'Conveyor belt + time pressure',
      stars: { 130: 3, 110: 2, 95: 1 },
    },
    6: {
      id: 6,
      type: 'belt',
      name: 'Day 6: AI Disambiguation',
      instruction: 'Tricky! This email talks about TWO things. "I love the park but the trash is overflowing!" — which is the REAL problem? The feeling number tells us! 🎓 AI Lesson: Disambiguation — when keywords conflict, emotion reveals the real issue.',
      description: 'Mixed-topic disambiguation.',
      emailIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'],
      emailCount: 7,
      beltSpeed: 0.6,
      minScore: 80,
      spawnInterval: 3200,
      newMechanic: 'Mixed-topic disambiguation',
      stars: { 110: 3, 95: 2, 80: 1 },
      mixedMode: true,
    },
    7: {
      id: 7,
      type: 'belt',
      name: 'Day 7: AI Crisis Mode',
      instruction: 'EMERGENCY! A storm hit the city! 12 angry emails everywhere. Everything we\'ve practiced — keywords, urgency, speed, tricky emails — all together NOW! 🎓 AI Lesson: Crisis Response — all AI skills combine under extreme pressure.',
      description: 'Crisis mode — high intensity negative feedback.',
      emailIds: ['p3', 'w1', 't3', 'p1', 'w3', 't8', 'p7', 'w6', 't4', 'm1', 'w4', 't1'],
      emailCount: 12,
      beltSpeed: 1.0,
      minScore: 210,
      spawnInterval: 2000,
      newMechanic: 'Crisis speed + high urgency',
      stars: { 245: 3, 225: 2, 210: 1 },
      crisisMode: true,
    },
  };

  // ──────────────────────────────────────────────
  // Level 8 — AI Demonstration
  // After teaching Nova through 7 lessons, the AI shows
  // what it learned by sorting emails at superhuman speed.
  // ──────────────────────────────────────────────
  const AI_DEMO = {
    id: 8,
    type: 'ai_demo',
    name: 'Day 8: Autonomous AI',
    instruction: 'This is it! Watch me sort emails all by myself — faster than any human. Everything you taught me, in action! 🎓 AI Lesson: Autonomous AI — fully trained model operates at superhuman speed without human input.',
    emailIds: ['p3', 't1', 'w1', 'p1', 't3', 'w3', 'p7', 't8', 'w6', 'm1', 't4', 'w4', 'm3', 'p5', 'w2'],
    emailCount: 15,
    aiSpeed: 400,
  };

  // ──────────────────────────────────────────────
  // Sound effect generators (Web Audio API)
  // ──────────────────────────────────────────────
  const SOUNDS = {
    correct: { freq: [523, 659, 784], duration: [0.1, 0.1, 0.2], type: 'sine' },
    wrong: { freq: [330, 262], duration: [0.15, 0.3], type: 'square' },
    levelComplete: { freq: [523, 659, 784, 1047], duration: [0.15, 0.15, 0.15, 0.4], type: 'sine' },
    celebration: { freq: [523, 659, 784, 1047, 1319], duration: [0.1, 0.1, 0.1, 0.1, 0.5], type: 'triangle' },
    urgentPulse: { freq: [200], duration: [0.1], type: 'square' },
    cardDrop: { freq: [440], duration: [0.05], type: 'sine' },
  };

  // ──────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────

  /** Get a department by ID */
  function getDepartment(id) {
    return DEPARTMENTS[id] || null;
  }

  /** Get all departments */
  function getDepartments() {
    return Object.values(DEPARTMENTS);
  }

  /** Get department by matching keywords in text (word-boundary aware) */
  function findDepartmentByKeywords(text) {
    const lower = text.toLowerCase();
    for (const dept of Object.values(DEPARTMENTS)) {
      for (const kw of dept.keywords) {
        // Use word boundary check to avoid partial matches (e.g. "street" matching "tree")
        const regex = new RegExp('\\b' + kw + '\\b', 'i');
        if (regex.test(lower)) return dept;
      }
    }
    return null;
  }

  /** Get a fully expanded email card by ID */
  function getEmail(emailId) {
    const base = EMAIL_POOL.find(e => e.id === emailId);
    if (!base) return null;
    const priority = computePriority(base.sentimentScore);
    return {
      ...base,
      ...priority,
      departmentName: DEPARTMENTS[base.department] ? DEPARTMENTS[base.department].name : '',
      departmentColor: DEPARTMENTS[base.department] ? DEPARTMENTS[base.department].color : '',
      departmentIcon: DEPARTMENTS[base.department] ? DEPARTMENTS[base.department].icon : '',
    };
  }

  /** Get level configuration with computed scores */
  function getLevel(levelNum) {
    const cfg = LEVELS[levelNum];
    if (!cfg) return null;

    if (cfg.type === 'keyword_sort') {
      // Randomly select keywords for this round
      const shuffled = [...cfg.keywords].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, cfg.keywordCount);
      const maxScore = selected.length * cfg.pointsPerCorrect;
      return { ...cfg, keywords: selected, maxScore };
    }

    if (cfg.type === 'priority_order') {
      // Select random messages, then determine the CORRECT order by sentiment
      const shuffled = [...cfg.messages].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, cfg.messageCount);
      // Sort by sentiment score ascending (most negative = highest priority = position 1)
      const correctOrder = [...selected].sort((a, b) => a.sentimentScore - b.sentimentScore);
      // Assign relativeOrder based on sorted position
      const withOrder = selected.map(msg => ({
        ...msg,
        relativeOrder: correctOrder.findIndex(c => c.text === msg.text) + 1,
      }));
      const maxScore = selected.length * cfg.pointsPerCorrect;
      return { ...cfg, messages: withOrder, maxScore, correctOrder };
    }

    // Belt-type level: expand emails with scores
    const emails = cfg.emailIds ? cfg.emailIds.map(id => getEmail(id)).filter(Boolean).map(email => ({
      ...email,
      routeScore: calculateRouteScore(email.sentimentScore),
    })) : [];
    const maxScore = emails.reduce((sum, e) => sum + e.routeScore, 0);
    return { ...cfg, emails, maxScore };
  }

  /** Get all level configs */
  function getLevels() {
    return Object.values(LEVELS).map(cfg => {
      const emails = cfg.emailIds.map(id => getEmail(id)).filter(Boolean);
      return { ...cfg, emails };
    });
  }

  /** Get a random subset of emails from the pool (optionally weighted by department) */
  function getRandomEmails(count, excludeIds = []) {
    const available = EMAIL_POOL.filter(e => !excludeIds.includes(e.id))
      .map(e => {
        const priority = computePriority(e.sentimentScore);
        return { ...e, ...priority, departmentName: DEPARTMENTS[e.department]?.name || '', departmentColor: DEPARTMENTS[e.department]?.color || '' };
      });
    // Fisher-Yates shuffle
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    return available.slice(0, Math.min(count, available.length));
  }

  /** Get level-specific hint */
  function getLevelHint(levelNum) {
    switch (levelNum) {
      case 1: return STRINGS.hintKeyword;
      case 2: return STRINGS.hintPriorityQueue;
      case 3: return STRINGS.hintChute;
      case 4: return STRINGS.hintSentiment;
      case 5: return 'You are teaching Nova speed! Route fast but accurate. Angry emails are worth more points!';
      case 6: return STRINGS.hintMixed;
      case 7: return 'Crisis mode! Every angry email you route correctly teaches Nova how to handle emergencies!';
      default: return STRINGS.hintChute;
    }
  }

  /** Generate emails for the AI demo grand finale */
  function getFinaleEmails(count) {
    const pool = EMAIL_POOL.map(e => {
      const priority = computePriority(e.sentimentScore);
      return { ...e, ...priority };
    });
    const result = [];
    while (result.length < count) {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const needed = count - result.length;
      result.push(...shuffled.slice(0, Math.min(needed, shuffled.length)));
    }
    return result;
  }

  /** Get level name (short) */
  function getLevelName(levelNum) {
    const cfg = LEVELS[levelNum];
    return cfg ? cfg.name : 'Unknown';
  }

  /** Get AI demonstration data */
  function getAiDemo() {
    const emails = AI_DEMO.emailIds.map(id => getEmail(id)).filter(Boolean).map(email => ({
      ...email,
      routeScore: calculateRouteScore(email.sentimentScore),
    }));
    const maxScore = emails.reduce((sum, e) => sum + e.routeScore, 0);
    return { ...AI_DEMO, emails, maxScore };
  }

  return {
    STRINGS,
    DEPARTMENTS,
    EMAIL_POOL,
    LEVELS,
    AI_DEMO,
    SOUNDS,
    KEYWORD_SORTER_ITEMS,
    PRIORITY_QUEUE_ITEMS,
    getDepartment,
    getDepartments,
    findDepartmentByKeywords,
    getEmail,
    getLevel,
    getLevels,
    getRandomEmails,
    getFinaleEmails,
    getLevelHint,
    getLevelName,
    computePriority,
    calculateRouteScore,
    getAiDemo,
  };
})();
