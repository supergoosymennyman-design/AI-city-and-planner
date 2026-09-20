# PLAN: AI Token Exchange — P3 Lesson 15 (Revised)

## Game Concept & AI Pedagogical Goal

**Concept:** Students run a passport verification office where different AI services cost different tokens. Each level introduces a **new real-world AI tokenomics concept** with its own unique mechanic.

**AI Pedagogical Goal:** Teach how AI token budgets work in the real world:
- Different AI models cost different amounts (GPT-4 vs GPT-3.5)
- Batch processing saves tokens (OpenAI batch API = 50% off)
- Priority processing costs a premium (SLA tiers)
- AI caching makes repeated queries cheaper
- Real optimization requires combining all strategies

**AI Narrative Arc:**
- Nova starts knowing nothing about token budgeting
- Levels 1-5: Each teaches Nova a new concept
- Level 6: Nova demonstrates optimal allocation
- Level 7: Nova scales up to enterprise level

## Level-by-Level Design

### Level 1: Know Your Costs
**Concept:** Different AI tasks consume different numbers of tokens.
- **Citizens:** 5 basic (Text + Lookup only)
- **Budget:** 100 tokens
- **Cost per citizen:** 7 tokens (2 text + 5 lookup)
- **Total needed:** 35 tokens (easy)
- **UI:** Cost card showing task prices with real-world analogies
- **Nova learns:** AI tasks have different token costs

### Level 2: Choose Your Model
**Concept:** Higher-capability AI models cost more tokens (GPT-4 vs GPT-3.5).
- **New Mechanic:** Each task has Standard and Premium tiers
  - Standard Text: 2 tokens (basic OCR, clean docs only)
  - Premium Text: 5 tokens (handles messy handwriting)
  - Standard Lookup: 5 tokens
  - Premium Lookup: 8 tokens (cross-references databases)
  - Standard Image: 10 tokens
  - Premium Image: 15 tokens (liveness detection)
- **Citizens:** 6 (mix of clean docs + VIPs needing premium)
- **Budget:** 120 tokens
- **UI:** Standard/Premium toggle per task type; citizen badges show what they need
- **Constraint:** Using Standard on a Premium-needy citizen fails
- **Nova learns:** Premium AI models cost more but handle harder tasks

### Level 3: Batch & Save
**Concept:** Processing requests in batches reduces per-unit cost (OpenAI batch API discount).
- **New Mechanic:** "Process Batch" button processes 2-3 citizens simultaneously
- **Batch Discount:** 15% off identical tasks grouped in a batch
  - E.g., batch with 3 text reads: normally 6 tokens → discounted to 5 tokens
- **Citizens:** 9 citizens arriving in 3 groups of 3
- **Patience:** Each citizen has a timer (they leave if not processed)
- **Budget:** 100 tokens
- **UI:** Group display, batch button, patience timers, discount badge
- **Nova learns:** Batching AI requests saves tokens

### Level 4: Priority Lane
**Concept:** AI services offer priority/SLA tiers at premium pricing.
- **New Mechanic:** Toggle "Priority" on citizens — costs 2x task cost but adds +5 bonus tokens to budget
- **Deadlines:** Some citizens have ⏰ deadline badges — they MUST be prioritized
- **Citizens:** 8 (mix of deadline, optional priority, no priority)
- **Budget:** 100 starting + bonus tokens from prioritized citizens
- **UI:** Priority toggle per citizen, bonus token indicator, deadline badges
- **Nova learns:** Priority AI processing costs more but adds budget

### Level 5: Cache & Optimize
**Concept:** AI providers cache results — repeated queries cost less.
- **New Mechanic:** "Returning" citizens (🔄 badge) get 50% off lookup costs
- **Combines ALL previous mechanics:** Model choice + Batch + Priority + Cache
- **Citizens:** 12 (mix of returning, VIPs, deadlines, clean docs)
- **Budget:** 120 tokens
- **UI:** All previous UIs visible, cache discount badges
- **Nova learns:** Real AI optimization uses all strategies together

### Level 6: Nova Demonstrates
- Nova autonomously allocates for 12 citizens using all mechanics
- Chooses optimal models, batches efficiently, prioritizes wisely, leverages cache

### Level 7: Nova at Scale
- 20 citizens, faster processing, enterprise-scale demonstration

## Data Model

```javascript
const TASK_COSTS = { text: 2, lookup: 5, image: 10 };
const PREMIUM_COSTS = { text: 5, lookup: 8, image: 15 };

// Citizen: { name, needs: {text: 'basic'|'premium'|'none', ...},
//            isVIP, hasDeadline, isReturning, patienceTimer }
// Level: { id, citizens, budget, allowPremium, allowBatch,
//          allowPriority, allowCache, targetProcessed }

// State:
{
  currentLevel, phase,
  budget, spent,
  modelToggles: { text: 'standard'|'premium', ... },
  priorityMode: false,      // L4: priority active on current citizen
  batchActive: false,        // L3: currently batching
  citizens: [...],
  currentBatch: [],          // L3: citizens queued for batch
  processedCount,
  bonusTokens,               // L4: tokens earned from priority
  cacheHits,                 // L5: cache discounts used
  stars
}
```

## UI Layout

```
┌──────────────────────────────────────────────┐
│  AI Token Exchange          💰 64/100  L3    │
├──────────────────────┬───────────────────────┤
│  Citizen Queue       │   Current Citizen     │
│  ┌──┐ ┌──┐ ┌──┐     │   ┌─────────────────┐ │
│  │📋│ │📋│ │📋│     │   │ Name: Jane Doe  │ │
│  │🔄│ │⏰│ │  │     │   │ Needs: 📝Premium│ │
│  └──┘ └──┘ └──┘     │   │       🔍Basic   │ │
│                      │   │       📸None    │ │
│  Processed: 4/9      │   │                 │ │
│                      │   │ Model:          │ │
│                      │   │ 📝 [STD] [PRM]  │ │
│                      │   │ 🔍 [STD] [PRM]  │ │
│                      │   │                 │ │
│                      │   │ Priority: [OFF] │ │
│                      │   │ Cost: 8 tokens  │ │
│                      │   │                 │ │
│                      │   │ [Process] [Skip]│ │
│  Batch: [📋+📋+📋]  │   └─────────────────┘ │
│         [-15% off]   │                      │
│         [⚡Process 3]│                      │
├──────────────────────┴───────────────────────┤
│  Nova: "Premium AI handles messy docs but    │
│         costs more. Choose wisely!"          │
└──────────────────────────────────────────────┘
```

## Nova AI Narrative

| Level | Nova's Lesson |
|---|---|
| L1 🎓 | "Different AI tasks cost different tokens — text is cheap, vision is expensive." |
| L2 🎓 | "Premium AI models handle harder tasks but cost more. Choose the right tool!" |
| L3 🎓 | "Batching AI requests saves tokens — just like OpenAI's batch API!" |
| L4 🎓 | "Priority processing costs a premium but adds budget. SLA tiers exist in real AI." |
| L5 🎓 | "Caching makes repeated AI queries cheaper. Combine all strategies for best results!" |
| L6 🤖 | "Nova demonstrates optimal token allocation across all mechanics." |
| L7 🚀 | "Nova scales to enterprise throughput with all strategies." |
