/**
 * intents.js — Botly AI intent definitions & response templates
 */
const Intents = (() => {
  'use strict';

  const INTENTS = [
    { id: 'help', triggerPatterns: [/botly.*help/i, /help.*botly/i, /^help$/i, /what.*do/i, /how.*play/i], responses: ['Tap the green outlined zones on the items to annotate them. When you are done, hit Submit to show the AI what you found!', 'Your job is to tap the correct features on each item. The instructions at the top tell you what to look for. Need more help? Ask me!'], priority: 95 },
    { id: 'hint', triggerPatterns: [/botly.*hint/i, /hint.*botly/i, /^hint$/i, /give.*hint/i, /where.*(is|are)/i], responses: ['Look for items that can be recycled — bottles, cans, cardboard.', 'Try finding the corners of the boxes. Each box has 4 corners to mark.', 'Crinkly, bumpy items are textured. Smooth, shiny items are glossy.', 'The recycling symbol has three arrows. The barcode has vertical lines.', 'You only have 4 seconds per item. Be quick!'], priority: 90 },
    { id: 'check', triggerPatterns: [/botly.*check/i, /check.*botly/i, /^check$/i, /am.*(right|correct|done)/i], responses: ['You are making progress! Check if all items have green boxes.', 'Keep going! The Submit button will glow green when you are done.', 'You look like you are doing great! Tap all features then press Submit.'], priority: 85 },
    { id: 'explain_level', triggerPatterns: [/botly.*(what|explain|level)/i, /what.*(level|do|this)/i, /explain.*(level|this)/i], responses: ['In this level, you need to find specific features. Read the instruction at the top!', 'Every level teaches the AI something new. Tap the right spots to show it!', 'You are training a computer to see! Each tap shows the AI where features are.'], priority: 75 },
    { id: 'why', triggerPatterns: [/why.*(label|annotat|do|need|botly)/i, /why.*(this|that)/i], responses: ['We label data so AI can learn! A computer needs humans to show it what things look like.', 'Just like you learn by example, AI learns from labeled pictures. You are the teacher!', 'Recycling robots use labeled images to sort trash. By annotating, you are helping them learn!'], priority: 70 },
    { id: 'recycling', triggerPatterns: [/recycl/i, /sort/i, /trash/i, /waste/i, /plastic/i, /paper/i, /metal/i], responses: ['Recycling turns old things into new things! Plastics, paper, and metals can all be recycled.', 'Not everything can be recycled. Organic waste like apple cores goes to compost.', 'Bottles, cans, cardboard — those are all recyclable!'], priority: 65 },
    { id: 'encourage', triggerPatterns: [/good/i, /nice/i, /great/i, /done/i, /yay/i, /finished/i], responses: ['Fantastic work! You are really good at data labeling.', 'Nice job! The AI is learning a lot from you today.', 'Brilliant! Keep going and you will train the smartest recycling robot!'], priority: 60 },
    { id: 'greeting', triggerPatterns: [/^(hi|hello|hey)/i, /^botly$/i, /^ai$/i], responses: ['Hi there! I am Botly, your AI assistant. Need help? Just ask!', 'Hello! Ready to label some recycling data? Tap items to start annotating.', 'Hey! I am watching and learning with you. Say "Botly, hint!" if you need help.'], priority: 50 },
    { id: 'off_topic', triggerPatterns: [/.*/], responses: ['That is interesting! For now, let us focus on labeling these items.', 'Hmm, I am not sure! But I do know about recycling — want to learn more?', 'I am still learning too! Let us keep working on these annotations together.'], priority: 0 }
  ];

  const LEVEL_HINTS = { 1: 'Look for items made of plastic or metal. Avoid the food scraps!', 2: 'Each cardboard box has 4 corners — like a square. Can you find all of them?', 3: 'Is the surface rough? That is textured! Is it smooth and shiny? That is glossy!', 4: 'Find the three-arrow recycling symbol and the vertical barcode lines. Ignore the dirt!', 5: 'Watch each item carefully. Tap the main feature before it scrolls away!', 6: 'No reading needed! Look at the shape or pattern in each card and tap what the prompt asks for!' };

  const LEVEL_SUCCESS = { 1: 'Perfect! You tagged all the recyclable containers. The AI now knows what to look for!', 2: 'Great corner tagging! Now the AI understands the box shape and volume.', 3: 'Excellent texture sorting! The AI can now see the difference between textured and glossy.', 4: 'You found the recycling symbol and barcode! The AI can read package labels now.', 5: 'Amazing speed! You annotated all items under pressure. The AI loves fast learners!', 6: 'No labels needed — you spotted features by sight alone! That is how real AI vision works!' };

  const IDLE_PROMPTS = ['Need a hint? Ask me by saying "Botly, hint!"', 'Stuck? Just say "Botly, help!" and I will guide you.', 'Want to know more? Say "Botly, what is this?"'];

  function classify(text) {
    if (!text || !text.trim()) return { intentId: null, confidence: 0 };
    const trimmed = text.trim();
    const addressed = /botly|ai/i.test(trimmed);
    const isQuestion = /^(what|how|why|where|can|did|am|is|are)|.*\?$/.test(trimmed);
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
    if (!intent || !intent.responses.length) return 'Hmm, I am not sure. Try asking me something else!';
    return intent.responses[Math.floor(Math.random() * intent.responses.length)];
  }

  function getLevelSuccess(level) { return LEVEL_SUCCESS[level] || LEVEL_SUCCESS[1]; }
  function getIdlePrompt() { return IDLE_PROMPTS[Math.floor(Math.random() * IDLE_PROMPTS.length)]; }

  return { classify, getResponse, getLevelSuccess, getIdlePrompt };
})();
