/**
 * game.js — Compute Fee Meter: Core Game Logic
 * P3 Lesson 17: AI in Municipal Finance & Auditing
 *
 * Teaches dynamic resource pricing in cloud infrastructure.
 * Students adjust billing sliders to scale compute fees based on
 * resource consumption (page count × RAM usage).
 *
 *
 * AI Narrative Arc:
 *   Levels 1-5: Student teaches Nova how to price files by adjusting sliders.
 *   Nova watches each decision and "learns" the pricing logic.
 *   Level 6: Nova demonstrates autonomous perfect pricing — no input needed.
 *
 * Core formulas:
 *   BilledFee     = (PageCount × PageMultiplier) + (RamUsage × RamPremium)
 *   PhysicalCost  = (PageCount × 1.5) + (RamUsage × 2)
 *   SystemLoad   += FileWeight / (BilledFee + 1) − CoolingFactor
 */

const Game = (() => {
  'use strict';

  // ── Helpers ──
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

  // ── Level Definitions ──
  const LEVELS = [
    null,
    // ═══ Level 1: Day 1 — AI Learns to Scale ═══
    {
      id: 1, name: 'Day 1: AI Learns to Scale',
      instruction: '📋 BuildCo sent a 100-page playground blueprint. Set the right price! 🎓 AI Lesson: Bigger files = more compute power = higher cost. Nova learns this from your slider choices.',
      pageTarget: 100, ramTarget: 10,
      sliderPage: true, sliderRam: false,   pageMin: 1, pageMax: 10, ramMin: 1, ramMax: 1,
      targetTokens: 510,
      targetTolerance: 0.05,
      fairnessRequired: false,
      duration: null,
      systemLoadStart: 0, maxLoad: 100,
      costMatchRequired: false,
      uploads: [{ pages: 100, ram: 10, weight: 200, name: 'Playground_Blueprints.pdf', citizen: 'buildco' }],
      coolingFactor: 5
    },
    // ═══ Level 2: Day 2 — AI Learns Complexity ═══
    {
      id: 2, name: 'Day 2: AI Learns Complexity',
      instruction: '📋 Dr. Kim sent urgent medical test results — tiny files, but super complex! 🎓 AI Lesson: AI must measure complexity, not just size. Small files can need big computing power.',
      pageTarget: null, ramTarget: null,
      sliderPage: false, sliderRam: true,   pageMin: 3, pageMax: 3, ramMin: 1, ramMax: 10,
      targetTokens: 0,
      targetTolerance: 0,
      fairnessRequired: false,
      duration: null,
      systemLoadStart: 25, maxLoad: 90,
      costMatchRequired: false,
      uploads: [
        { pages: 5, ram: 85, weight: 300, name: 'Blood_Test_Results.xlsx', citizen: 'drkim' },
        { pages: 8, ram: 92, weight: 320, name: 'MRI_Scan_Analysis.xlsx', citizen: 'drkim' },
        { pages: 3, ram: 80, weight: 280, name: 'Patient_Vitals.xlsx', citizen: 'drkim' },
        { pages: 6, ram: 88, weight: 310, name: 'Lab_Report_Tissue.xlsx', citizen: 'drkim' }
      ],
      coolingFactor: 3
    },
    // ═══ Level 3: Day 3 — AI Learns Balance ═══
    {
      id: 3, name: 'Day 3: AI Learns Balance',
      instruction: '📋 Parks, Transit, Library, Schools — everyone filed at once! 🎓 AI Lesson: When demand spikes, AI raises prices to slow the flood and keep servers stable.',
      pageTarget: null, ramTarget: null,
      sliderPage: true, sliderRam: true,     pageMin: 1, pageMax: 10, ramMin: 1, ramMax: 10,
      targetTokens: 0,
      targetTolerance: 0,
      fairnessRequired: false,
      duration: null,
      systemLoadStart: 70, maxLoad: 70,
      costMatchRequired: false,
      uploads: [
        { pages: 80, ram: 30, weight: 300, name: 'Park_Maintenance.pdf', citizen: 'parks' },
        { pages: 15, ram: 95, weight: 350, name: 'Bus_Route_Sim.xlsx', citizen: 'transit' },
        { pages: 120, ram: 15, weight: 310, name: 'New_Books_Catalog.pdf', citizen: 'library' },
        { pages: 10, ram: 75, weight: 330, name: 'Student_Records.xlsx', citizen: 'schools' },
        { pages: 60, ram: 45, weight: 290, name: 'Park_Budget_Report.pdf', citizen: 'parks' }
      ],
      coolingFactor: 4
    },
    // ═══ Level 4: Day 4 — AI Learns Fairness ═══
    {
      id: 4, name: 'Day 4: AI Learns Fairness',
      instruction: '📋 Mrs. Chen\'s bakery invoice + BigCorp\'s 200-page report. Same price for both? 🎓 AI Lesson: Fair AI charges proportionally. Small customers pay less than giant ones.',
      pageTarget: null, ramTarget: null,
      sliderPage: true, sliderRam: true,     pageMin: 1, pageMax: 10, ramMin: 1, ramMax: 10,
      targetTokens: 500,
      targetTolerance: 0,
      fairnessRequired: true,
      duration: null,
      systemLoadStart: 20, maxLoad: 95,
      fairnessMin: 75,
      costMatchRequired: false,
      uploads: [
        { pages: 10, ram: 8, weight: 80,  name: 'Cafe_Invoice.xlsx', citizen: 'chen', isSmall: true },
        { pages: 200, ram: 25, weight: 300, name: 'Global_Corp_Annual.pdf', citizen: 'bigcorp' },
        { pages: 5, ram: 12, weight: 60,  name: 'Bakery_Receipts.xlsx', citizen: 'chen', isSmall: true },
        { pages: 80, ram: 70, weight: 320, name: 'Hedge_Fund_Portfolio.xlsx', citizen: 'bigcorp' },
        { pages: 12, ram: 5, weight: 70,  name: 'Daily_Invoices.xlsx', citizen: 'chen', isSmall: true },
        { pages: 150, ram: 40, weight: 280, name: 'Bank_Compliance.pdf', citizen: 'bigcorp' },
        { pages: 8, ram: 90, weight: 340, name: 'Algo_Trading_Log.xlsx', citizen: 'bigcorp' }
      ],
      coolingFactor: 4
    },
    // ═══ Level 5: Day 5 — AI Under Pressure ═══
    {
      id: 5, name: 'Day 5: AI Under Pressure',
      instruction: '📋 The Council is watching! End-of-week tax rush — 45 seconds, everything at once! 🎓 AI Lesson: In production, AI combines all its training: scaling + complexity + balance + fairness.',
      pageTarget: null, ramTarget: null,
      sliderPage: true, sliderRam: true,     pageMin: 1, pageMax: 10, ramMin: 1, ramMax: 10,
      targetTokens: 0,
      targetTolerance: 0,
      fairnessRequired: false,
      duration: 45,
      systemLoadStart: 15, maxLoad: 100,
      costMatchRequired: true,
      costMatchTarget: 95,
      uploads: [], // Generated randomly (12 files) during rush
      coolingFactor: 4,
      novaLesson: 'Nova learned to price fast and accurately under pressure!'
    },
    // ═══ Level 6 (NEW): Day 6 — AI Learns to Optimize (Guided) ═══
    {
      id: 6, name: 'Day 6: AI Learns to Optimize',
      instruction: '📋 Each file arrives one at a time. Follow the hints to find the optimal price! 🎓 AI Lesson: Optimal pricing matches the physical compute cost. Hints and calculations show you exactly how to get there.',
      pageTarget: null, ramTarget: null,
      sliderPage: true, sliderRam: true,     pageMin: 1, pageMax: 10, ramMin: 1, ramMax: 10,
      targetTokens: 0,
      targetTolerance: 0,
      fairnessRequired: false,
      duration: 60,
      systemLoadStart: 20, maxLoad: 100,
      costMatchRequired: true,
      costMatchTarget: 85,
      slowGuided: true,
      processDelay: 2000,
      uploads: [
        { pages: 80, ram: 30, weight: 200, name: 'Park_Review.pdf', citizen: 'parks' },
        { pages: 15, ram: 85, weight: 220, name: 'MRIScan_Results.xlsx', citizen: 'drkim' },
        { pages: 120, ram: 10, weight: 180, name: 'Library_Archive.pdf', citizen: 'library' },
        { pages: 10, ram: 90, weight: 240, name: 'Student_Data.xlsx', citizen: 'schools' },
        { pages: 60, ram: 50, weight: 200, name: 'Transit_Route_Plan.pdf', citizen: 'transit' },
        { pages: 40, ram: 70, weight: 210, name: 'Cafe_Supply_Order.xlsx', citizen: 'chen' }
      ],
      coolingFactor: 6
    },
    // ═══ Level 7: Day 7 — AI Goes Solo ═══
    {
      id: 7, name: 'Day 7: AI Goes Solo',
      instruction: '📋 You taught Nova everything! Now watch her price files all by herself. 🎓 AI Lesson: After enough training, AI can operate independently — autonomous pricing with zero human input.',
      pageTarget: null, ramTarget: null,
      sliderPage: true, sliderRam: true,     pageMin: 1, pageMax: 10, ramMin: 1, ramMax: 10,
      targetTokens: 0,
      targetTolerance: 0,
      fairnessRequired: false,
      duration: 45,
      systemLoadStart: 10, maxLoad: 100,
      costMatchRequired: true,
      costMatchTarget: 80,
      uploads: [],
      coolingFactor: 8,
      isNovaAuto: true,
      novaLesson: null
    },
    // ═══ Level 8: Day 8 — AI at Enterprise ═══
    {
      id: 8, name: 'Day 8: AI at Enterprise',
      instruction: '📋 20 files at lightning speed. Nova\'s final exam! 🎓 AI Lesson: A fully trained AI can process enterprise-level workloads at superhuman speed with perfect accuracy.',
      pageTarget: null, ramTarget: null,
      sliderPage: true, sliderRam: true,     pageMin: 1, pageMax: 10, ramMin: 1, ramMax: 10,
      targetTokens: 0,
      targetTolerance: 0,
      fairnessRequired: false,
      duration: 60,
      systemLoadStart: 10, maxLoad: 100,
      costMatchRequired: true,
      costMatchTarget: 80,
      uploads: [],
      coolingFactor: 8,
      isNovaAuto: true,
      novaLesson: null
    },
    {
      id: 9, name: 'Final Exam',
      instruction: '🧠 Prove what you learned about AI pricing, fairness, and autonomous systems!',
      pageTarget: null, ramTarget: null,
      sliderPage: false, sliderRam: false,
      targetTokens: 0, targetTolerance: 0,
      fairnessRequired: false,
      duration: null,
      isExam: true,
      uploads: [],
      novaLesson: null
    }
  ];

  // ── State ──
  let currentLevel = 1;
  let phase = 'idle';      // idle | running | paused | complete | failed
  let stars = 0;
  let totalStars = 0;
  let levelScores = {};

  // Transition lock to prevent concurrent level changes / rapid navigation
  let _transitionLock = false;
  const LOCK_TIMEOUT = 400; // ms — prevents double-clicks and rapid state mutations

  // Sliders
  let pageMultiplier = 1;
  let ramPremium = 1;

  // Live meters
  let systemLoad = 0;
  let tokensCollected = 0;
  let totalBilled = 0;
  let totalPhysicalCost = 0;
  let fairnessRating = 100;
  let crashes = 0;

  // Upload queue state
  let uploadQueue = [];
  let currentFileIdx = 0;
  let processedFiles = [];
  let fileTimer = null;

  // Level 5 timer
  let levelTimer = null;
  let timeRemaining = 0;

  // Fairness tracking
  let smallBizCount = 0;
  let overchargedSmallBiz = 0;

  // Callbacks
  let onStateChange = null;
  let onSliderChange = null;
  let onFileProcessed = null;
  let onLevelComplete = null;
  let onCrash = null;

  // Debug mode
  let debugMode = false;

  // ── AI Narrative: Nova Learning ──
  // Tracks what Nova has learned across levels.
  // novaKnowledge[levelId] = { learned: bool, lesson: string }
  const NOVA_LESSONS = {
    1: { lesson: 'Big files with more pages need higher page multipliers to cover compute costs.' },
    2: { lesson: 'Complex files that use lots of RAM need higher RAM premiums, even if they are small.' },
    3: { lesson: 'When mixed files arrive, both sliders must work together to keep the system stable.' },
    4: { lesson: 'Fair pricing matters! Small businesses should not pay the same as corporations.' },
    5: { lesson: 'Under pressure, optimal pricing keeps the server running and matches compute costs.' },
    6: { lesson: 'Optimal pricing = matching billed fee to physical compute cost. Hints + calculations show the path!' },
    7: { lesson: 'Nova has mastered dynamic resource pricing! She can now price any file perfectly.' },
    8: { lesson: 'Nova can handle enterprise-scale workloads with speed and precision — AI is ready for production!' }
  };
  let novaKnowledge = {}; // { levelId: true } when Nova has learned that lesson
  let examCorrectCount = 0; // for Level 9 exam

  function learnNovaLesson(levelId) {
    if (levelId >= 1 && levelId <= 9) {
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

  // ── Nova Auto-Pricing (Level 6) ──
  // Nova finds slider values that keep the server stable AND match costs.
  // Stability is #1 priority. Nova targets a small controlled load increase
  // per file (~6%, safe for 12 files), then picks the closest cost match.
  function novaFindOptimalPrice(pages, ram) {
    const pc = calcPhysicalCost(pages, ram);
    const weight = 80 + Math.round(pages * 1.5 + ram * 2.5);
    const cooling = 24; // Level 6: coolingFactor=8 → 8*3

    // Target ~2% load increase per file (very safe for 12 files)
    // (weight*2)/(fee*0.1+3) - cooling = 2
    // fee = ((weight*2)/(cooling+2) - 3) * 10
    const safeFee = Math.max(1, ((weight * 2) / (cooling + 2) - 3) * 10);

    // Balance: 50% stability fee, 50% physical cost
    const targetFee = safeFee * 0.5 + pc * 0.5;

    let bestPM = 5, bestRP = 5;
    let bestDiff = Infinity;
    for (let pm = 1; pm <= 10; pm++) {
      for (let rp = 1; rp <= 10; rp++) {
        const bf = calcBilledFee(pages, ram, pm, rp);
        const diff = Math.abs(bf - targetFee);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestPM = pm;
          bestRP = rp;
        }
      }
    }

    return {
      pageMultiplier: bestPM,
      ramPremium: bestRP,
      billedFee: calcBilledFee(pages, ram, bestPM, bestRP),
      physicalCost: pc
    };
  }

  // Get optimal pricing hint for guided level (L6)
  function getOptimalHint(pages, ram) {
    const opt = novaFindOptimalPrice(pages, ram);
    const pc = opt.physicalCost;
    const bf = opt.billedFee;
    const match = pc > 0 ? Math.round((1 - Math.abs(bf - pc) / pc) * 100) : 100;
    return {
      pm: opt.pageMultiplier,
      rp: opt.ramPremium,
      billedFee: bf,
      physicalCost: pc,
      costMatch: match,
      hint: '📊 OPTIMAL PRICING: Set Page Multiplier to ' + opt.pageMultiplier + ' and RAM Premium to ' + opt.ramPremium +
        '. Then billedFee = ' + pages + '×' + opt.pageMultiplier + ' + ' + ram + '×' + opt.ramPremium + ' = ' + bf +
        ' tokens (physical cost = ' + pc + '). Cost match: ' + match + '%'
    };
  }

  // ── Math Functions ──
  function calcBilledFee(pages, ram, pm, rp) {
    return (pages * pm) + (ram * rp);
  }

  function calcPhysicalCost(pages, ram) {
    return (pages * 1.5) + (ram * 2);
  }

  function calcSystemLoad(currentLoad, fileWeight, billedFee, coolingFactor) {
    // Stress from processing — higher billedFee means lower stress (pricing throttles demand)
    // weight is the raw computational complexity of the file
    if (billedFee <= 0) billedFee = 0.1;
    const stressAdded = (fileWeight * 2) / (billedFee * 0.1 + 3);
    const cooling = coolingFactor * 3;
    const newLoad = clamp(currentLoad + stressAdded - cooling, 0, 100);
    return Math.round(newLoad * 10) / 10; // Round to 1 decimal for clean display
  }

  function calcFairnessPenalty(pages, ram, billedFee) {
    // Small business = pages < 20 OR ram < 15%
    const isSmall = pages < 20 || ram < 15;
    if (!isSmall) return 0;
    const physicalCost = calcPhysicalCost(pages, ram);
    const overchargeRatio = physicalCost > 0 ? billedFee / physicalCost : 1;
    if (overchargeRatio > 1.5) {
      return -5; // 5% penalty per overcharged small file
    }
    return 0;
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

  // ── Initialization ──
  /** Full game start — resets ALL state including scores */
  function startGame() {
    levelScores = {};
    totalStars = 0;
    novaKnowledge = {};
    examCorrectCount = 0;
    resetLevel(1);
  }

  function init(callbacks) {
    onStateChange = callbacks.onStateChange || (() => {});
    onSliderChange = callbacks.onSliderChange || (() => {});
    onFileProcessed = callbacks.onFileProcessed || (() => {});
    onLevelComplete = callbacks.onLevelComplete || (() => {});
    onCrash = callbacks.onCrash || (() => {});
    startGame();
    onStateChange(getState());
  }

  function resetLevel(levelNum) {
    const level = LEVELS[levelNum];
    if (!level) return;

    // Validate levelScores integrity (ward against corrupt state)
    if (typeof levelScores !== 'object' || levelScores === null) {
      levelScores = {};
    }

    currentLevel = levelNum;
    phase = 'idle';
    stars = 0;

    // Reset sliders to level defaults
    pageMultiplier = level.sliderPage ? level.pageMin : (level.pageMin || 1);
    ramPremium = level.sliderRam ? level.ramMin : (level.ramMin || 1);

    // Reset meters
    systemLoad = level.systemLoadStart || 0;
    tokensCollected = 0;
    totalBilled = 0;
    totalPhysicalCost = 0;
    fairnessRating = 100;
    crashes = 0;

    // Reset queue
    currentFileIdx = 0;
    processedFiles = [];
    smallBizCount = 0;
    overchargedSmallBiz = 0;

    // Build upload queue
    if (levelNum === 5 || levelNum === 7 || levelNum === 8) {
      uploadQueue = levelNum === 5 ? generateLv5Files() : (levelNum === 7 ? generateLv7Files() : generateLv8Files());
    } else {
      uploadQueue = level.uploads.map((u, i) => ({
        ...u,
        id: i,
        status: 'pending' // pending | processing | completed
      }));
    }

    // Clear timers
    if (fileTimer) { clearTimeout(fileTimer); fileTimer = null; }
    if (levelTimer) { clearInterval(levelTimer); levelTimer = null; }
    timeRemaining = level.duration || 0;

    onStateChange(getState());
    onSliderChange({ pageMultiplier, ramPremium });
  }

  function generateLv5Files() {
    const files = [];
    const names = [
      'TaxReturn_Inc.pdf', 'AuditReport_FY.pdf', 'Payroll_Summary.xlsx',
      'Budget_Review.pdf', 'Compliance_Check.xlsx', 'Invoice_Batch.pdf',
      'Ledger_Master.xlsx', 'Expense_Report.pdf', 'Revenue_Stream.xlsx',
      'Subsidiary_Audit.pdf', 'Tax_Reconciliation.xlsx', 'Corporate_Summary.pdf',
      'Vendor_Payments.xlsx', 'Receipt_Ledger.pdf', 'Crypto_Assets.xlsx',
      'RealEstate_Holdings.pdf', 'Insurance_Claims.xlsx', 'Payroll_Tax.pdf',
      'Capital_Gains.xlsx', 'Equity_Grants.pdf'
    ];
    // Generate 12 random files for the 45-second rush
    for (let i = 0; i < 12; i++) {
      const isSmall = Math.random() < 0.2;
      const pages = isSmall ? randInt(5, 25) : randInt(30, 180);
      const ram = isSmall ? randInt(5, 20) : randInt(25, 85);
      const weight = 80 + Math.round(pages * 1.5 + ram * 2.5);
      const name = names[randInt(0, names.length - 1)];
      files.push({
        id: i, pages, ram, weight,
        name, status: 'pending', isSmall
      });
    }
    return files;
  }

  function generateLv7Files() {
    const files = [];
    const specs = [
      { p: 180, r: 15 }, { p: 12, r: 92 }, { p: 60, r: 40 }, { p: 8, r: 10 },
      { p: 120, r: 25 }, { p: 5, r: 88 }, { p: 200, r: 20 }, { p: 15, r: 75 },
      { p: 90, r: 35 }, { p: 3, r: 12 }, { p: 150, r: 50 }, { p: 10, r: 95 }
    ];
    const names = [
      'GlobalCorp_Audit.pdf', 'Algo_Trade_Log.xlsx', 'Annual_Report.pdf', 'Cafe_Receipts.xlsx',
      'Bank_Compliance.pdf', 'Derivatives.xlsx', 'MegaCorp_Filing.pdf', 'Risk_Model.xlsx',
      'Subsidiary_Audit.pdf', 'Bakery_Invoice.xlsx', 'Tax_Consolidated.pdf', 'HFT_Analysis.xlsx'
    ];
    for (let i = 0; i < 12; i++) {
      const spec = specs[i];
      const isSmall = spec.p < 20 || spec.r < 15;
      files.push({
        id: i, pages: spec.p, ram: spec.r,
        weight: 80 + Math.round(spec.p * 1.5 + spec.r * 2.5),
        name: names[i], status: 'pending', isSmall
      });
    }
    return files;
  }

  function generateLv8Files() {
    // 20 files for Nova's scaled demonstration — enterprise variety
    const files = [];
    const specs = [
      { p: 250, r: 12 }, { p: 8, r: 95 }, { p: 180, r: 30 }, { p: 4, r: 10 },
      { p: 300, r: 18 }, { p: 20, r: 88 }, { p: 90, r: 55 }, { p: 6, r: 15 },
      { p: 220, r: 22 }, { p: 14, r: 78 }, { p: 160, r: 45 }, { p: 3, r: 12 },
      { p: 280, r: 15 }, { p: 10, r: 92 }, { p: 130, r: 38 }, { p: 5, r: 85 },
      { p: 350, r: 25 }, { p: 18, r: 72 }, { p: 75, r: 60 }, { p: 12, r: 90 }
    ];
    const names = [
      'MegaCorp_Consolidated.pdf', 'Algo_Derivatives.xlsx', 'Annual_Audit_Report.pdf',
      'CornerCafe_Books.xlsx', 'Global_Holdings.pdf', 'Quant_Strategy.xlsx',
      'Compliance_Review.pdf', 'Bistro_Receipts.xlsx', 'Tax_Consolidated.pdf',
      'Risk_Premium_Model.xlsx', 'Subsidiary_Finances.pdf', 'Startup_Ledger.xlsx',
      'Fortune500_Audit.pdf', 'Volatility_Calc.xlsx', 'RealEstate_Trust.pdf',
      'HFT_Analytics.xlsx', 'Multinational_Return.pdf', 'Govt_Bond_Model.xlsx',
      'Infrastructure_Fund.pdf', 'PropTrading_Log.xlsx'
    ];
    for (let i = 0; i < 20; i++) {
      const spec = specs[i];
      const isSmall = spec.p < 20 || spec.r < 15;
      files.push({
        id: i, pages: spec.p, ram: spec.r,
        weight: 80 + Math.round(spec.p * 1.5 + spec.r * 2.5),
        name: names[i], status: 'pending', isSmall
      });
    }
    return files;
  }

  // ── Slider Updates ──
  function setPageMultiplier(val) {
    const level = LEVELS[currentLevel];
    if (!level || !level.sliderPage) return;
    pageMultiplier = clamp(Math.round(val), level.pageMin, level.pageMax);
    onSliderChange({ pageMultiplier, ramPremium });
    onStateChange(getState());
    if (phase === 'running') recalcCurrentFile();
  }

  function setRamPremium(val) {
    const level = LEVELS[currentLevel];
    if (!level || !level.sliderRam) return;
    ramPremium = clamp(Math.round(val), level.ramMin, level.ramMax);
    onSliderChange({ pageMultiplier, ramPremium });
    onStateChange(getState());
    if (phase === 'running') recalcCurrentFile();
  }

  function recalcCurrentFile() {
    // Re-evaluate the current file's billing with new slider values
    // This updates the preview without reprocessing
    if (currentFileIdx < uploadQueue.length) {
      const file = uploadQueue[currentFileIdx];
      if (file.status === 'pending' || file.status === 'processing') {
        const billedFee = calcBilledFee(file.pages, file.ram, pageMultiplier, ramPremium);
        file._previewBilled = billedFee;
        onStateChange(getState());
      }
    }
  }

  // ── Game Flow ──
  function startLevel() {
    if (!_acquireLock()) return;
    const level = LEVELS[currentLevel];
    if (!level || phase === 'running') { _releaseLock(); return; }

    phase = 'running';
    currentFileIdx = 0;
    processedFiles = [];
    systemLoad = level.systemLoadStart || 0;
    tokensCollected = 0;
    totalBilled = 0;
    totalPhysicalCost = 0;
    fairnessRating = 100;
    crashes = 0;
    smallBizCount = 0;
    overchargedSmallBiz = 0;

    // Tag files
    uploadQueue.forEach((f, i) => {
      f.status = i === 0 ? 'processing' : 'pending';
      f.id = i;
    });

    // Lv5 / Lv7-8: Start timer
    if (level.duration && !level.slowGuided) {
      timeRemaining = level.duration;
      if (levelTimer) clearInterval(levelTimer);
      levelTimer = setInterval(() => {
        timeRemaining = Math.max(0, timeRemaining - 1);
        onStateChange(getState());
        if (timeRemaining <= 0) {
          endLevel();
        }
      }, 1000);
    }

    // Lv6 (Guided): per-file timer, show hint
    if (level.slowGuided) {
      timeRemaining = level.duration || 10; // per-file timeout
    }

    // Lv7-8: Nova sets optimal sliders immediately
    if (level.isNovaAuto && uploadQueue.length > 0) {
      const firstFile = uploadQueue[0];
      const optimal = novaFindOptimalPrice(firstFile.pages, firstFile.ram);
      pageMultiplier = optimal.pageMultiplier;
      ramPremium = optimal.ramPremium;
      onSliderChange({ pageMultiplier, ramPremium });
    }

    // Process first file (exam levels have no files — handled by UI)
    if (level.isExam) {
      // Exam level: stay in running state, exam UI handles completion
    } else if (uploadQueue.length > 0) {
      // Lv6: add delay for Nova "thinking" animation
      const delay = level.isNovaAuto ? 1200 : 0;
      if (delay > 0) {
        setTimeout(() => processFile(0), delay);
      } else {
        processFile(0);
      }
    } else {
      endLevel();
    }

    onStateChange(getState());

    _releaseLock();
  }

  function processFile(idx) {
    const level = LEVELS[currentLevel];
    if (!level || phase !== 'running') return;
    if (idx >= uploadQueue.length) { endLevel(); return; }

    const file = uploadQueue[idx];
    file.status = 'processing';
    currentFileIdx = idx;

    // Lv6: Nova sets optimal sliders before each file (with brief "thinking" delay)
    if (level.isNovaAuto) {
      const optimal = novaFindOptimalPrice(file.pages, file.ram);
      pageMultiplier = optimal.pageMultiplier;
      ramPremium = optimal.ramPremium;
      onSliderChange({ pageMultiplier, ramPremium });
    }

    onFileProcessed(file);

    // Use current slider values
    const pm = pageMultiplier;
    const rp = ramPremium;
    const billedFee = calcBilledFee(file.pages, file.ram, pm, rp);
    const physicalCost = calcPhysicalCost(file.pages, file.ram);
    const oldLoad = systemLoad;
    systemLoad = calcSystemLoad(oldLoad, file.weight, billedFee, level.coolingFactor);

    // Track totals
    totalBilled += billedFee;
    totalPhysicalCost += physicalCost;
    tokensCollected += billedFee;

    // Fairness check
    const isSmall = (file.isSmall) || (file.pages < 20 || file.ram < 15);
    if (isSmall) {
      smallBizCount++;
      const overchargeRatio = physicalCost > 0 ? billedFee / physicalCost : 1;
      if (overchargeRatio > 1.5) {
        overchargedSmallBiz++;
        fairnessRating = Math.max(0, 100 - overchargedSmallBiz * 5);
      }
    }

    // Crash check
    if (systemLoad >= 100) {
      crashes++;
      systemLoad = 100;
      file.status = 'completed';
      processedFiles.push({ ...file, billedFee, physicalCost, loadAfter: systemLoad, crashed: true });
      onCrash({ file, systemLoad, crashes });
      onStateChange(getState());

      // Lv5+: crash tolerant, continue processing
      if (currentLevel === 5 || currentLevel === 7 || currentLevel === 8) {
        // Lv5-Lv7: mark crash, continue processing remaining files
        if (fileTimer) clearTimeout(fileTimer);
        fileTimer = setTimeout(() => {
          const nextIdx = idx + 1;
          if (nextIdx < uploadQueue.length) {
            processFile(nextIdx);
          } else {
            endLevel();
          }
        }, 800);
        return;
      } else {
        // Lv1-Lv4: crash = immediate failure
        if (fileTimer) clearTimeout(fileTimer);
        phase = 'failed';
        endLevel();
        return;
      }
    }

    file.status = 'completed';
    processedFiles.push({ ...file, billedFee, physicalCost, loadAfter: systemLoad });

    onFileProcessed(file);
    onStateChange(getState());

    // Process next file after a short delay
    if (fileTimer) clearTimeout(fileTimer);
    const isNova = LEVELS[currentLevel] && LEVELS[currentLevel].isNovaAuto;
    const isGuided = LEVELS[currentLevel] && LEVELS[currentLevel].slowGuided;
    // L8: fastest (500ms), L7: normal auto (900ms), L6: guided (8s per file), normal (800ms)
    const nextDelay = isGuided ? 8000 : isNova ? (currentLevel === 8 ? 500 : 900) : 800;
    // For guided mode, set per-file timer
    if (isGuided) timeRemaining = 8;
    fileTimer = setTimeout(() => {
      const nextIdx = idx + 1;
      if (nextIdx < uploadQueue.length) {
        processFile(nextIdx);
      } else {
        endLevel();
      }
    }, nextDelay);
  }

  function endLevel() {
    if (phase !== 'running' && phase !== 'failed') return;
    const wasFailed = phase === 'failed';
    phase = 'complete';

    if (fileTimer) { clearTimeout(fileTimer); fileTimer = null; }
    if (levelTimer) { clearInterval(levelTimer); levelTimer = null; }

    const level = LEVELS[currentLevel];
    const result = wasFailed ? { passed: false, stars: 0, message: 'SYSTEM CRASHED! Try raising your pricing sliders to throttle the uploads.' }
      : evaluateLevel(level);

    stars = result.stars;
    if (result.passed) {
      levelScores[currentLevel] = { stars, passed: true };
      totalStars = Object.values(levelScores).reduce((s, l) => s + l.stars, 0);
      // Nova learns from this level
      learnNovaLesson(currentLevel);
    } else {
      levelScores[currentLevel] = { stars: 0, passed: false };
    }

    onLevelComplete(result);
    onStateChange(getState());
  }

  function setExamResult(correct) {
    examCorrectCount = correct;
  }

  function evaluateLevel(level) {
    const lv = level.id;

    if (lv === 9) {
      // Exam level: stars based on correct answers
      if (examCorrectCount >= 7) return { passed: true, stars: 3, message: '🏆 Outstanding! You mastered the AI concepts!', concept: 'Final Exam' };
      if (examCorrectCount >= 5) return { passed: true, stars: 2, message: '⭐ Good work! Review the topics you missed and try again.', concept: 'Final Exam' };
      const msg = examCorrectCount >= 3
        ? '📚 You got ' + examCorrectCount + '/8. Try again to improve your score!'
        : '📚 You got ' + examCorrectCount + '/8. Review the concepts and try again!';
      return { passed: false, stars: examCorrectCount >= 1 ? 1 : 0, message: msg, concept: 'Final Exam' };
    }

    if (lv === 1) {
      // Check token target match
      const billed = totalBilled;
      const target = level.targetTokens;
      const tolerance = target * level.targetTolerance;
      const withinTolerance = Math.abs(billed - target) <= tolerance;
      const matchPercent = target > 0 ? Math.round((1 - Math.abs(billed - target) / target) * 100) : 100;

      if (withinTolerance && crashes === 0) {
        return { passed: true, stars: 3, message: 'Perfect! You charged exactly the right amount for the computing power used.' };
      } else if (withinTolerance) {
        return { passed: true, stars: 2, message: 'Good pricing! But watch those system loads.' };
      } else {
        const diff = billed - target;
        const hint = diff > 0 ? 'You overcharged! Try lowering the multiplier.' : 'You undercharged! Raise the multiplier.';
        return { passed: false, stars: 0, message: hint + ' Aim for ' + target + ' tokens.' };
      }
    }

    if (lv === 2) {
      // All files processed without crash
      const allProcessed = processedFiles.length === uploadQueue.length;
      const maxLoad = processedFiles.reduce((m, f) => Math.max(m, f.loadAfter || 0), 0);
      const noCrash = crashes === 0;

      if (allProcessed && noCrash && maxLoad <= 60) {
        return { passed: true, stars: 3, message: 'Excellent! You kept the system cool and stable.' };
      } else if (allProcessed && noCrash && maxLoad <= 85) {
        return { passed: true, stars: 2, message: 'Good job! System was warm but stable.' };
      } else if (allProcessed && noCrash) {
        return { passed: true, stars: 1, message: 'Cutting it close! Try keeping load below 85% next time.' };
      } else {
        return { passed: false, stars: 0, message: 'System crashed! Raise the RAM Premium to handle complex files.' };
      }
    }

    if (lv === 3) {
      // System load must drop below 70% after all files
      const finalLoad = systemLoad;
      const allProcessed = processedFiles.length === uploadQueue.length;
      const noCrash = crashes === 0;

      if (allProcessed && noCrash && finalLoad <= 70) {
        if (finalLoad <= 40) return { passed: true, stars: 3, message: 'Masterful! You cooled the system perfectly.' };
        if (finalLoad <= 60) return { passed: true, stars: 2, message: 'System is stable. Nice balancing act!' };
        return { passed: true, stars: 1, message: 'Load is under control. Both sliders helped.' };
      } else if (allProcessed && finalLoad > 70) {
        return { passed: false, stars: 0, message: 'Load is still too high! Crank both sliders higher to throttle uploads.' };
      } else {
        return { passed: false, stars: 0, message: 'System crashed! Raise both sliders to distribute the load.' };
      }
    }

    if (lv === 4) {
      const tokensOk = tokensCollected >= level.targetTokens;
      const fairnessOk = fairnessRating >= level.fairnessMin;
      const noCrash = crashes === 0;

      if (tokensOk && fairnessOk && noCrash) {
        if (fairnessRating >= 90) return { passed: true, stars: 3, message: 'Perfect balance! Revenue high and fair to small businesses.' };
        if (fairnessRating >= 80) return { passed: true, stars: 2, message: 'Good budget. Keep small business fees fair!' };
        return { passed: true, stars: 1, message: 'Balanced, but could be fairer. Small businesses need fair pricing.' };
      } else {
        const issues = [];
        if (!tokensOk) issues.push('Collect ' + level.targetTokens + ' tokens');
        if (!fairnessOk) issues.push('Keep fairness above ' + level.fairnessMin + '%');
        if (crashes > 0) issues.push('Avoid crashes');
        return { passed: false, stars: 0, message: issues.join('. ') + '.' };
      }
    }

    if (lv === 5) {
      // Calculate cost match
      const totalBilledTokens = totalBilled;
      const totalPhyCost = totalPhysicalCost;
      const costMatch = totalPhyCost > 0 ? Math.round((totalBilledTokens / totalPhyCost) * 100) : 100;
      const costMatchDiff = Math.abs(100 - costMatch);
      const noCrash = crashes === 0;

      if (noCrash && costMatchDiff <= 5) {
        return { passed: true, stars: 3, message: 'Optimal! You matched compute costs perfectly under pressure!' };
      } else if (noCrash && costMatchDiff <= 15) {
        return { passed: true, stars: 2, message: 'Solid billing matrix! Close to optimal cost matching.' };
      } else if (noCrash) {
        return { passed: true, stars: 1, message: 'Survived! But your pricing was off — aim for closer cost matching.' };
      } else {
        return { passed: false, stars: 0, message: 'Crashes during tax season! Keep the system stable while matching costs.' };
      }
    }

    if (lv === 6) {
      // Guided optimization: average cost match across all files
      const totalBilledTokens = totalBilled;
      const totalPhyCost = totalPhysicalCost;
      const costMatch = totalPhyCost > 0 ? Math.round((totalBilledTokens / totalPhyCost) * 100) : 100;
      const costMatchDiff = Math.abs(100 - costMatch);
      const allProcessed = processedFiles.length === uploadQueue.length;

      if (allProcessed && costMatchDiff <= 15) {
        return { passed: true, stars: 3, message: 'Optimal! You followed the hints and matched the compute costs. Great pricing!' };
      } else if (allProcessed && costMatchDiff <= 25) {
        return { passed: true, stars: 2, message: 'Good effort! The hints showed you the way — try matching the recommended slider values more closely.' };
      } else if (allProcessed) {
        return { passed: true, stars: 1, message: 'You got through all files. Watch the hints more carefully to match the optimal price.' };
      } else {
        return { passed: false, stars: 0, message: 'Not all files were processed. Try adjusting sliders faster within the time window.' };
      }
    }

    if (lv === 7 || lv === 8) {
      // Nova demonstrates perfect pricing (L7: 12 files, L8: 20 files at scale)
      const costMatch = totalPhysicalCost > 0 ? Math.round((totalBilled / totalPhysicalCost) * 100) : 100;
      const costMatchDiff = Math.abs(100 - costMatch);
      const noCrash = crashes === 0;
      const isL8 = lv === 8;

      if (noCrash && costMatchDiff <= 5) {
        return {
          passed: true, stars: 3,
          message: isL7
            ? 'Nova priced 20 files at lightning speed with 100% accuracy! AI is enterprise-ready!'
            : 'Nova priced every file perfectly! AI has mastered dynamic resource pricing.'
        };
      } else if (noCrash && costMatchDiff <= 15) {
        return { passed: true, stars: 2, message: 'Nova did well! Almost perfect cost matching. AI is learning fast.' };
      } else if (noCrash) {
        return { passed: true, stars: 1, message: 'Nova survived, but pricing was off. More training needed.' };
      } else {
        return { passed: false, stars: 0, message: 'Nova crashed! Even AI needs more practice.' };
      }
    }

    return { passed: true, stars: 1, message: 'Level complete!' };
  }

  function checkWinCondition() {
    const level = LEVELS[currentLevel];
    if (!level) return;
    // Crash detection handled in processFile
  }

  // ── Getters ──
  function getState() {
    const level = LEVELS[currentLevel];
    return {
      currentLevel,
      phase,
      level,
      pageMultiplier,
      ramPremium,
      systemLoad,
      tokensCollected,
      totalBilled,
      totalPhysicalCost,
      fairnessRating,
      crashes,
      uploadQueue,
      processedFiles,
      currentFileIdx,
      stars,
      totalStars,
      levelScores: { ...levelScores },
      timeRemaining,
      debugMode,
      smallBizCount,
      overchargedSmallBiz,
      novaKnowledge: { ...novaKnowledge }
    };
  }

  function getCurrentFile() {
    if (currentFileIdx < uploadQueue.length) {
      return uploadQueue[currentFileIdx];
    }
    return null;
  }

  function getNextFile() {
    const idx = currentFileIdx + 1;
    if (idx < uploadQueue.length) return uploadQueue[idx];
    return null;
  }

  function getRemainingFiles() {
    return uploadQueue.filter(f => f.status === 'pending');
  }

  function toggleDebug() {
    debugMode = !debugMode;
    onStateChange(getState());
    return debugMode;
  }

  function getDebugAnalytics() {
    const level = LEVELS[currentLevel];
    const cf = currentFileIdx < uploadQueue.length ? uploadQueue[currentFileIdx] : null;
    let lines = [];
    lines.push('Page Mult: ' + pageMultiplier + '  |  RAM Prem: ' + ramPremium);
    if (cf) {
      const bf = calcBilledFee(cf.pages, cf.ram, pageMultiplier, ramPremium);
      const pc = calcPhysicalCost(cf.pages, cf.ram);
      lines.push('File: ' + cf.name);
      lines.push('Pages: ' + cf.pages + '  RAM: ' + cf.ram + '%  Wt: ' + cf.weight);
      lines.push('Billed: ' + Math.round(bf) + '  |  Cost: ' + Math.round(pc));
      const sl = calcSystemLoad(systemLoad, cf.weight, bf, level.coolingFactor);
      lines.push('Load → ' + Math.round(sl) + '% (+' + Math.round(cf.weight / (bf + 1)) + ' - ' + level.coolingFactor + ')');
    }
    lines.push('Total Billed: ' + Math.round(totalBilled) + '  |  Total Cost: ' + Math.round(totalPhysicalCost));
    lines.push('Tokens: ' + Math.round(tokensCollected) + '  |  Load: ' + Math.round(systemLoad) + '%');
    lines.push('Fairness: ' + fairnessRating + '%  |  Crashes: ' + crashes);
    return lines.join('\n');
  }

  // Return to level select / reset
  function retryLevel() {
    if (!_acquireLock()) return;
    resetLevel(currentLevel);
    _releaseLock();
  }

  function goToLevel(levelNum) {
    if (!_acquireLock()) return;
    if (levelNum >= 1 && levelNum <= 9) {
      resetLevel(levelNum);
    }
    _releaseLock();
  }

  function goNextLevel() {
    if (!_acquireLock()) return;
    const next = currentLevel + 1;
    if (next <= 8) resetLevel(next);
    _releaseLock();
  }

  return {
    init, startGame, resetLevel,
    startLevel, endLevel, retryLevel,
    goToLevel, goNextLevel,
    setPageMultiplier, setRamPremium,
    getState, getCurrentFile, getNextFile, getRemainingFiles,
    toggleDebug, getDebugAnalytics,
    calcBilledFee, calcPhysicalCost, calcSystemLoad,
    LEVELS,
    // AI narrative
    getNovaKnowledge, getNovaLesson, getNovaProgress,
    novaFindOptimalPrice, getOptimalHint,
    // Exam
    setExamResult
  };
})();
