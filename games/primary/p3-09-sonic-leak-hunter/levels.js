/**
 * levels.js — Level metadata, AI concepts, wave generation data for Sonic Leak Hunter
 *
 * The game has 6 levels:
 *   L1 — Sort the Sounds        (animated waves + Leak/Safe classification, 12 items)
 *   L2 — Tune the Sensitivity   (threshold slider, 4 sub-rounds)
 *   L3 — Edge Case Patrol       (novel sounds — 3D oscilloscope, classify noise vs threat)
 *   L4 — Confidence Command     (judge AI alerts by confidence %, 3D bars)
 *   L5 — Final City Scan        (timed 3×3 grid — combine all skills)
 *   L6 — Water Department Briefing (10-question quiz)
 *
 * Wave data types:
 * - SMOOTH_SAFE: clean sine wave, no spike → SAFE
 * - NOISY_SAFE: small wiggles but no real spike → SAFE (distractor)
 * - SMOOTH_WITH_SPIKE: clean wave with a clear spike → LEAK
 * - NOISY_LEAK: noise + a big spike → LEAK (distractor)
 * - Edge cases (L3): rhythmicPulse, deepRumble, staticBurst, erraticMix, cyclicalPulse, pressureDamped
 */

const LEVELS = [
  // ──────────────────────────────────────────────────
  // LEVEL 1 — Sort the Sounds (Supervised Learning / Classification)
  // ──────────────────────────────────────────────────
  {
    id: 1,
    title: "Sort the Sounds",
    aiConcept: "Supervised Learning",
    aiConceptShort: "Classify each wave as a leak or a safe pipe",
    bannerColor: "#1B6B93",
    icon: "🎧",
    instruction: 'Watch the live wave and sort it: NORMAL 💧 or LEAK 🚨',
    endRecap: "You sorted 12 pipe sounds! That's how AI classifies new data — it compares each wave to patterns it has learned.",
    totalItems: 12,
    // 12 waves: 6 safe, 6 leak. Varied so the child must actually read each wave.
    wavePool: [
      // ── Easy SAFE (3): smooth, no spike ──
      { type: 'SMOOTH_SAFE', freq: 1.0, amp: 0.16, noise: 0.01, spikeAmp: 0, spikePos: 0, isLeak: false },
      { type: 'SMOOTH_SAFE', freq: 1.6, amp: 0.20, noise: 0.02, spikeAmp: 0, spikePos: 0, isLeak: false },
      { type: 'SMOOTH_SAFE', freq: 1.3, amp: 0.18, noise: 0.01, spikeAmp: 0, spikePos: 0, isLeak: false },
      // ── Easy LEAK (3): clean wave with an obvious spike ──
      { type: 'SMOOTH_WITH_SPIKE', freq: 1.2, amp: 0.18, noise: 0.01, spikeAmp: 0.75, spikePos: 0.55, isLeak: true },
      { type: 'SMOOTH_WITH_SPIKE', freq: 1.4, amp: 0.16, noise: 0.02, spikeAmp: 0.70, spikePos: 0.30, isLeak: true },
      { type: 'SMOOTH_WITH_SPIKE', freq: 1.0, amp: 0.20, noise: 0.01, spikeAmp: 0.80, spikePos: 0.70, isLeak: true },
      // ── Tricky SAFE (3): wiggles but NO real spike ──
      { type: 'NOISY_SAFE', freq: 1.8, amp: 0.20, noise: 0.07, spikeAmp: 0.15, spikePos: 0.5, isLeak: false },
      { type: 'NOISY_SAFE', freq: 2.0, amp: 0.22, noise: 0.08, spikeAmp: 0.18, spikePos: 0.4, isLeak: false },
      { type: 'NOISY_SAFE', freq: 1.5, amp: 0.18, noise: 0.09, spikeAmp: 0.12, spikePos: 0.6, isLeak: false },
      // ── Tricky LEAK (3): noise plus a REAL big spike ──
      { type: 'NOISY_LEAK', freq: 1.5, amp: 0.20, noise: 0.08, spikeAmp: 0.65, spikePos: 0.55, isLeak: true },
      { type: 'NOISY_LEAK', freq: 1.7, amp: 0.22, noise: 0.09, spikeAmp: 0.60, spikePos: 0.35, isLeak: true },
      { type: 'NOISY_LEAK', freq: 1.3, amp: 0.18, noise: 0.07, spikeAmp: 0.70, spikePos: 0.75, isLeak: true },
    ]
  },

  // ──────────────────────────────────────────────────
  // LEVEL 2 — Tune the Sensitivity (Threshold Tradeoff)
  // ──────────────────────────────────────────────────
  {
    id: 2,
    title: "Tune the Sensitivity",
    aiConcept: "Threshold Tradeoff",
    aiConceptShort: "Precision vs recall — finding the right balance",
    bannerColor: "#E76F51",
    icon: "🎛️",
    instruction: 'Move the Sensitivity slider so the RED line ONLY touches the leak spike!',
    endRecap: "Setting the right balance means Piper catches leaks but doesn't cry wolf. That's the Threshold Tradeoff!",
    subRounds: 4,
    sliderMin: 1,
    sliderMax: 10,
    // 4 sub-rounds with different wave patterns
    wavePatterns: [
      // Sub-round 1: easier — tall spike, low noise. Sweet spot: slider 2-4 (sensitive).
      { type: 'SMOOTH_WITH_SPIKE', freq: 1.2, amp: 0.25, noise: 0.02, spikeAmp: 0.6, spikePos: 0.6, targetThreshold: 3, toleranceRange: [2, 5] },
      // Sub-round 2: trickier — smaller spike, higher freq. Sweet spot: slider 6-8 (less sensitive).
      { type: 'SMOOTH_WITH_SPIKE', freq: 1.8, amp: 0.25, noise: 0.02, spikeAmp: 0.5, spikePos: 0.7, targetThreshold: 7, toleranceRange: [6, 9] },
      // Sub-round 3: noisy safe wave with a small spike — must NOT trigger. Sweet spot: high slider (8-10).
      { type: 'NOISY_SAFE', freq: 1.5, amp: 0.24, noise: 0.07, spikeAmp: 0.18, spikePos: 0.5, targetThreshold: 9, toleranceRange: [8, 10] },
      // Sub-round 4: noisy leak — big spike among noise. Sweet spot: slider 5-7.
      { type: 'NOISY_LEAK', freq: 1.6, amp: 0.24, noise: 0.06, spikeAmp: 0.62, spikePos: 0.45, targetThreshold: 6, toleranceRange: [5, 8] }
    ]
  },

  // ──────────────────────────────────────────────────
  // LEVEL 3 — Edge Case Patrol (Out-of-Distribution Detection)
  // ──────────────────────────────────────────────────
  {
    id: 3,
    title: "Edge Case Patrol",
    aiConcept: "Edge Cases",
    aiConceptShort: "AI gets confused by sounds it has never heard before",
    bannerColor: "#6B4E71",
    icon: "🚧",
    instruction: 'Piper hears NEW sounds it was never trained on! Judge each one: noise or threat?',
    endRecap: "Piper's training didn't include trucks, rain, or festivals. When AI sees something brand new, it can get confused — that's why humans stay in the loop!",
    totalItems: 10,
    passScore: 7,
    // 10 edge cases: 6 harmless, 4 threats. Colors are for the 3D oscilloscope.
    edgePatterns: [
      { label: "Construction", generator: 'rhythmicPulse', params: { pulseRate: 5, amp: 0.5, noise: 0.08 }, color: '#F59E0B', isThreat: false, difficulty: 1, hint: "That rhythmic bang-bang-bang is a jackhammer — regular, not a leak." },
      { label: "Subway Rumble", generator: 'deepRumble', params: { freq: 0.6, amp: 0.6, noise: 0.2 }, color: '#64748B', isThreat: false, difficulty: 1, hint: "A slow, low rumble that swells and fades — that's a train passing underground." },
      { label: "Heavy Rain", generator: 'staticBurst', params: { burstProb: 0.15, amp: 0.35, noise: 0.4 }, color: '#38BDF8', isThreat: false, difficulty: 2, hint: "Dense static with random splashes — rain, not a pipe. No single big spike." },
      { label: "Festival Chaos", generator: 'erraticMix', params: { amp: 0.45, noise: 0.3 }, color: '#A855F7', isThreat: false, difficulty: 2, hint: "Music, cheering, everything at once — chaotic but no single dominant spike." },
      { label: "Water Hammer", generator: 'waterHammer', params: { spikePos: 0.35, spikeAmp: 0.8 }, color: '#94A3B8', isThreat: false, difficulty: 2, hint: "One sharp BANG then silence — a valve slammed shut. A leak keeps making noise." },
      { label: "Traffic Vibration", generator: 'trafficVibration', params: { freqBase: 1.2, amp: 0.5, noise: 0.12 }, color: '#475569', isThreat: false, difficulty: 2, hint: "Rumbling that speeds up and slows down — cars passing. No single big spike." },
      { label: "Pump Cycling", generator: 'cyclicalPulse', params: { cycles: 4, amp: 0.6, noise: 0.15 }, color: '#E76F51', isThreat: true, difficulty: 3, hint: "The pump sputters ON, OFF, ON — that irregular rhythm can hide a failing pump and a real leak." },
      { label: "Pressure Surge", generator: 'pressureDamped', params: { spikeAmp: 0.85, spikePos: 0.35, dampRate: 0.05 }, color: '#DC2626', isThreat: true, difficulty: 3, hint: "One huge spike then a fading ring — that's a rupture transient. Definitely investigate!" },
      { label: "Corrosion Drip", generator: 'corrosionDrip', params: { dripRate: 10, amp: 0.18 }, color: '#E76F51', isThreat: true, difficulty: 3, hint: "Small but STEADY drips — a slow hidden leak. Tiny signals can still be real threats!" },
      { label: "Sensor Flicker", generator: 'sensorFlicker', params: { amp: 0.25, noise: 0.2 }, color: '#DC2626', isThreat: true, difficulty: 3, hint: "Almost no signal at all — the SENSOR is broken! No data is not the same as safe. Investigate the sensor!" }
    ]
  },

  // ──────────────────────────────────────────────────
  // LEVEL 4 — Confidence Command (Probabilistic Output / HITL)
  // ──────────────────────────────────────────────────
  {
    id: 4,
    title: "Confidence Command",
    aiConcept: "Confidence & Probability",
    aiConceptShort: "AI gives probabilities, not certainties — humans decide",
    bannerColor: "#8338EC",
    icon: "💬",
    instruction: 'Piper flagged these alerts with confidence scores. Decide what to do with each one!',
    endRecap: "Piper doesn't say 'yes' or 'no' — it says 'I'm 72% sure.' AI gives probabilities, not certainties. That's why humans make the final call!",
    totalAlerts: 6,
    passScore: 4,
    alerts: [
      { location: "Oak St.", confidence: 92, reason: "Pressure dropped 18% and an acoustic spike was heard", isLeak: true, wave: { gen: 'compositeWave', freq: 1.2, amp: 0.2, noise: 0.03, spikeAmp: 0.7, spikePos: 0.5 } },
      { location: "Maple Ave.", confidence: 87, reason: "Night flow unusually high, pipe is 35 years old", isLeak: true, wave: { gen: 'compositeWave', freq: 1.5, amp: 0.22, noise: 0.04, spikeAmp: 0.65, spikePos: 0.4 } },
      { location: "Cedar Ln.", confidence: 73, reason: "Minor pressure dip + citizen report of damp sidewalk", isLeak: true, wave: { gen: 'compositeWave', freq: 1.4, amp: 0.2, noise: 0.05, spikeAmp: 0.55, spikePos: 0.6 } },
      { location: "Pine Rd.", confidence: 48, reason: "Sound blip during morning rush, pressure is normal", isLeak: false, wave: { gen: 'smoothSine', freq: 1.4, amp: 0.2, noise: 0.05 } },
      { location: "Elm St.", confidence: 61, reason: "Meter spike, but heavy rain fell last night", isLeak: false, wave: { gen: 'smoothSine', freq: 1.8, amp: 0.22, noise: 0.09 } },
      { location: "Birch Ct.", confidence: 55, reason: "Slight hiss near the construction zone — recent roadwork", isLeak: false, wave: { gen: 'smoothSine', freq: 1.1, amp: 0.18, noise: 0.12 } }
    ]
  },

  // ──────────────────────────────────────────────────
  // LEVEL 5 — Pipe Vision Inspector (AI Deployment — 3D pipe network)
  // ──────────────────────────────────────────────────
  {
    id: 5,
    title: "Pipe Vision Inspector",
    aiConcept: "AI Deployment",
    aiConceptShort: "Use AI to find leaks — but inspect the pipes yourself",
    bannerColor: "#2A9D8F",
    icon: "🔍",
    instruction: 'Piper pre-scanned the pipe network! Orbit the pipes, tap to inspect, and use your 2 repair crews wisely!',
    endRecap: "AI narrows the search by flagging pipes, but it can miss leaks and raise false alarms. YOU inspect the sensor data and make the final call!",
    timeLimit: 90,
    maxCrews: 2,
    passScore: 5,
    // 9 pipes: 6 flagged by Piper (red = says leak, yellow = unsure) + 3 normal (green)
    // Hidden truth: isLeak. Piper's opinion (color) is NOT always right!
    flaggedPipes: [
      { id: 0, name: "Oak St. Main",    isLeak: true,  confidence: 92, reason: "Pressure dropped 18% near this pipe",             wave: { gen: 'compositeWave', freq: 1.2, amp: 0.2, noise: 0.03, spikeAmp: 0.7, spikePos: 0.5 } },
      { id: 1, name: "Maple Ave. Line", isLeak: true,  confidence: 85, reason: "Night flow is 30% above normal",                  wave: { gen: 'compositeWave', freq: 1.5, amp: 0.22, noise: 0.04, spikeAmp: 0.65, spikePos: 0.4 } },
      { id: 2, name: "Pine Rd. Branch", isLeak: false, confidence: 88, reason: "Old pipe, looks worn — but pressure is normal",   wave: { gen: 'smoothSine', freq: 1.4, amp: 0.2, noise: 0.05 } },
      { id: 3, name: "Elm St. Joint",   isLeak: false, confidence: 62, reason: "Sensor flickers near this joint",                 wave: { gen: 'smoothSine', freq: 1.8, amp: 0.22, noise: 0.09 } },
      { id: 4, name: "Birch Ct. Loop",  isLeak: false, confidence: 45, reason: "Faint hiss — could be traffic noise",             wave: { gen: 'smoothSine', freq: 1.1, amp: 0.18, noise: 0.12 } },
      { id: 5, name: "Cedar Ln. Feed",  isLeak: true,  confidence: 58, reason: "Small sound irregularity detected",               wave: { gen: 'compositeWave', freq: 1.6, amp: 0.2, noise: 0.06, spikeAmp: 0.55, spikePos: 0.6 } }
    ],
    normalPipes: [
      { id: 6, name: "Rose Ln. Main",   isLeak: false, wave: { gen: 'smoothSine', freq: 1.3, amp: 0.18, noise: 0.03 } },
      { id: 7, name: "Ivy St. Feed",    isLeak: false, wave: { gen: 'smoothSine', freq: 1.7, amp: 0.2, noise: 0.04 } },
      { id: 8, name: "Daisy Ave. Line", isLeak: true,  wave: { gen: 'compositeWave', freq: 1.4, amp: 0.2, noise: 0.04, spikeAmp: 0.6, spikePos: 0.55 } } // HIDDEN leak — Piper missed it!
    ]
  },

  // ──────────────────────────────────────────────────
  // LEVEL 6 — Water Department Briefing (AI Literacy Quiz)
  // ──────────────────────────────────────────────────
  {
    id: 6,
    title: "Water Department Briefing",
    aiConcept: "AI Literacy",
    aiConceptShort: "Show what you know about how AI learns and works",
    bannerColor: "#F4A261",
    icon: "✏️",
    instruction: 'The Water Department wants YOUR answers! Brief them on how AI finds leaks!',
    endRecap: "You've briefed the Water Department on AI-powered leak detection. Their AI is ready!",
    quizQuestions: 10,
    passScore: 7,
    totalQuestions: 10
  }
];

// Export for use by other modules
window.LEVELS = LEVELS;
