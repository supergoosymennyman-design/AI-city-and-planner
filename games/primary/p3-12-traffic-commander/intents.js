/* =========================================================================
   intents.js — Flux's offline intent engine (no model download).
   Classifies a child's utterance into an intent by keyword matching, and
   produces a short, context-aware reply. Also stores per-level idle prompts
   (visual-only cues) and the AI-concept explanations.

   Flux is PASSIVE: this engine is only invoked when the child ADDRESSES Flux
   (trigger word / question) — addressing detection lives in flux.js.
   ========================================================================= */
const Intents = (() => {
  'use strict';

  /* Visual idle cue per level (never spoken automatically — shown as text). */
  const idlePrompts = {
    1: 'Watch the bar! Flush when it turns RED — that means cars have waited long enough.',
    2: 'See the dotted line? That is the PREDICTION. Flush before it hits the top.',
    3: 'Careful… bikes barely register. Do not flush weak signals — wait for a real car!',
    4: 'Four lanes! Compare the bars and flush the HIGHEST one first.',
    5: 'Set the trigger slider. Too low wastes green lights, too high causes gridlock. Find the sweet spot!',
    6: 'Read each question carefully. You taught me all of this — show what you know!'
  };

  /* AI-concept explanations (used by explain_concept + recaps). */
  const concepts = {
    sensor:     'Sensor Data means I get information about the real world through sensors. The inductive loop buried under the road is how I feel cars — more metal makes a stronger signal.',
    prediction: 'Load Prediction means I watch how fast the bar is rising and predict when the lane will overflow, so I can act early.',
    filtering:  'Signal Filtering means I ignore weak signals like bikes and only react to strong ones like cars. Not everything on the sensor is real traffic.',
    priority:   'Priority means when I only have one green light, I compare every lane and serve the one with the longest queue first.',
    automation: 'Automation means I follow the rule a human gives me — the trigger level — so I can manage all the lanes by myself.'
  };

  /* Keyword tables for classification. Order matters (first match wins). */
  const table = [
    { intent: 'greeting',        words: ['hello', 'hi flux', 'hey', 'good morning', 'good afternoon', 'whats up', "what's up"] },
    { intent: 'help',            words: ['help', 'what do i do', 'what should i do', 'how do i play', 'i am stuck', 'im stuck', 'confused', "i don't get", "i dont get"] },
    { intent: 'hint',            words: ['hint', 'tip', 'clue', 'what now', 'which lane', 'when do i flush', 'should i flush'] },
    { intent: 'check',           words: ['am i right', 'is this right', 'did i do it', 'how am i doing', 'check'] },
    { intent: 'vehicle_info',    words: ['bike', 'bicycle', 'motorcycle', 'motorbike', 'truck', 'van', 'car', 'pedestrian', 'person walking', 'metal mass', 'metal'] },
    { intent: 'explain_concept', words: ['sensor', 'inductive', 'loop', 'predict', 'prediction', 'filter', 'noise', 'priority', 'prioritise', 'prioritize', 'automation', 'automatic', 'trigger', 'why', 'how does', 'how do you', 'what is', 'what does'] },
    { intent: 'encourage',       words: ['this is hard', 'i cant', "i can't", 'i lost', 'i failed', 'too hard', 'give up'] }
  ];

  function classify(text) {
    const t = (' ' + text.toLowerCase() + ' ').replace(/[^a-z' ]/g, ' ');
    for (const row of table) {
      for (const w of row.words) {
        if (t.includes(' ' + w + ' ') || t.includes(w)) {
          return { intent: row.intent, matched: w };
        }
      }
    }
    return { intent: 'off_topic', matched: null };
  }

  /* Map a level number to its primary concept key. */
  function levelConcept(level) {
    return ({ 1: 'sensor', 2: 'prediction', 3: 'filtering', 4: 'priority', 5: 'automation', 6: 'sensor' })[level] || 'sensor';
  }

  /* Pick a vehicle fact when the child asks about a road user. */
  function vehicleFact(matched) {
    const facts = {
      bike: 'A bike has very little metal, so my sensor barely notices it — only about ten percent. I should wait for a real car.',
      bicycle: 'A bicycle has very little metal, so my reading is tiny. That is a weak signal — I do not flush for that.',
      motorcycle: 'A motorcycle has some metal, about thirty percent, but it is still not a full car. I wait for stronger signals.',
      motorbike: 'A motorbike gives a medium reading, but not enough to flush. Real traffic makes the bar climb much higher.',
      truck: 'A delivery truck has lots of metal, so it fills the bar fast — a strong, clear signal.',
      van: 'A van has plenty of metal, so it fills the bar quicker than a small car.',
      car: 'A car has enough metal to give me a strong signal, so the bar climbs steadily.',
      pedestrian: 'A person walking has almost no metal, so the bar hardly moves. That is not traffic I flush for.',
      metal: 'The more metal a vehicle has, the stronger my sensor reading. That is how I tell a car from a bike.'
    };
    return facts[matched] || facts.metal;
  }

  /* Build a reply string. ctx = { level, concept, highestLane, highestPct, phase } */
  function respond(intent, ctx = {}) {
    const level = ctx.level || 1;
    const c = ctx.concept || levelConcept(level);
    switch (intent) {
      case 'greeting':
        return "Hi Commander! I am Flux. Tell me when to flush and I will learn.";
      case 'help':
        return idlePrompts[level] || 'Read the bars and flush at the right time.';
      case 'hint':
        if (level === 4 && ctx.highestLane) return `Lane ${ctx.highestLane} has the longest queue right now — flush that one first.`;
        if (level === 5) return 'Try a trigger around seventy percent — high enough to avoid waste, low enough to avoid gridlock.';
        if (level === 2) return 'Follow the dotted prediction line. Flush just before it reaches the top.';
        if (level === 3) return 'If the bar stops low, that is a weak signal. Wait for it to shoot up before you flush.';
        return 'Flush when the bar turns red — that means the queue is long enough.';
      case 'check':
        return `Confidence is at ${ctx.confidence != null ? ctx.confidence : '—'} percent. Keep making good calls and it climbs!`;
      case 'vehicle_info':
        return vehicleFact(ctx.matched);
      case 'explain_concept':
        return concepts[c] || concepts.sensor;
      case 'encourage':
        return "You are doing great, Commander. Every good engineer retries. Watch the bars and try again!";
      case 'off_topic':
      default:
        return offTopic(ctx);
    }
  }

  /* Off-topic: one short natural answer + one gentle lesson nudge, under ~25 words. */
  function offTopic(ctx) {
    const level = ctx.level || 1;
    const nudge = {
      1: 'Speaking of signals — watch the bar and flush when it goes red!',
      2: 'Back on the road — flush before the prediction line hits the top!',
      3: 'On traffic though — do not flush weak signals like bikes!',
      4: 'For now — flush the lane with the highest bar first!',
      5: 'Meanwhile — set my trigger level to the sweet spot!',
      6: 'For the department briefing — read each question carefully!'
    }[level];
    return `Good question! I mostly know traffic though. ${nudge}`;
  }

  return { idlePrompts, concepts, classify, respond, levelConcept };
})();
