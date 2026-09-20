/**
 * narrative-data.js — Nova's dialogue & character arc definitions
 *
 * All narrative content: character arc, per-level dialogue, generic
 * responses, and learning milestone texts. Externalized for easy
 * editing without touching narrative engine code.
 */
const NarrativeData = (() => {
  'use strict';

  // ──────────────────────────────────────────────
  // Nova's character arc across levels
  // ──────────────────────────────────────────────

  const CHARACTER_ARC = {
    1: {
      nickname: 'rookie',
      expression: 'nervous',
      confidence: 'low',
      emoji: '😰',
      title: 'Nova the Rookie',
    },
    2: {
      nickname: 'learner',
      expression: 'curious',
      confidence: 'medium',
      emoji: '🤔',
      title: 'Nova the Learner',
    },
    3: {
      nickname: 'practitioner',
      expression: 'confident',
      confidence: 'medium-high',
      emoji: '😊',
      title: 'Nova the Practitioner',
    },
    4: {
      nickname: 'thinker',
      expression: 'thinking',
      confidence: 'high',
      emoji: '🧐',
      title: 'Nova the Thinker',
    },
    5: {
      nickname: 'expert',
      expression: 'excited',
      confidence: 'very-high',
      emoji: '💪',
      title: 'Nova the Expert',
    },
    6: {
      nickname: 'graduate',
      expression: 'proud',
      confidence: 'max',
      emoji: '🌟',
      title: 'Nova the Graduate',
    },
    7: {
      nickname: 'wise',
      expression: 'proud',
      confidence: 'max',
      emoji: '🧠',
      title: 'Nova the Wise',
    },
  };

  // ──────────────────────────────────────────────
  // Level dialogue — intro, correct, wrong, outro
  // Each level has arrays for variety
  // ──────────────────────────────────────────────

  const LEVEL_DIALOGUE = {

    1: {
      intro: [
        'Hi! I\'m Nova. First day at work! 📧 "The bus was late again!" Where does that go? Can you teach me?',
        'I know words exist but I don\'t know where they go! "Bus" — is that Transit or Parks? Show me!',
      ],
      correct: [
        'Zing! 💫 "{{keyword}}" means {{dept}}! I learned my first word!',
        '"{{keyword}}" → {{dept}}! Got it! I feel smarter already! ⭐',
        'Yes! "{{keyword}}" = {{dept}}. One more word for my brain!',
      ],
      wrong: [
        'Oops! "{{keyword}}" isn\'t {{attempted}}. Is it {{suggestion}}?',
        'Hmm, not {{attempted}}. "{{keyword}}" sounds like {{suggestion}}!',
      ],
      learningMilestone: {
        1: 'My first word! I feel like I\'m really learning! 🌟',
        3: 'Three words down! I\'m building my word collection!',
      },
      outro: [
        'I learned {{count}} words! Now when I see them, I know where they go. You\'re a great teacher!',
      ],
      aiConcept: 'AI learns from examples. Each email you sort right adds a new word to the AI\'s memory.',
    },

    2: {
      intro: [
        'Two emails! One is really angry 😡 and one is happy 😊. Which one needs help FIRST?',
        'Both arrived at once! The angry person (-4) and the happy person (+2). Who do we help first?',
      ],
      correct: [
        'The angry one goes first! Score {{score}} means {{readable}}. I learned that!',
        'Got it! Score {{score}} = {{readable}}. Angry = go first! ⚡',
      ],
      wrong: [
        'Hmm, score {{score}} is {{readable}}. Maybe they need help sooner?',
        'The {{readable}} one — score {{score}} — needs help before the happy one!',
      ],
      learningMilestone: {
        1: 'I see! The feeling number tells us who to help first!',
        3: '-5 means "help me NOW!" +5 means "just saying thanks!" I learned that!',
      },
      outro: [
        'I get it! Angry numbers (-5 to -3) go first. Happy numbers (+1 to +5) can wait. The feeling number = urgency!',
      ],
      aiConcept: 'Angry words = urgent help. AI learns to read feelings and prioritize.',
    },

    3: {
      intro: [
        'Whoa, so many emails! 😮 But I\'m getting faster — I already know "bus" means Transit. You taught me!',
        'Emails are pouring in! Good thing I recognize keywords now. "Bus" = Transit, "trash" = Waste. Let\'s go!',
      ],
      correct: [
        'Zoom! "{{keyword}}" → {{dept}}. I knew that one instantly! ⚡',
        'Easy! "{{keyword}}" = {{dept}}. Practice works!',
        'I barely had to think! {{keywordlist}} → {{dept}}. You taught me well!',
      ],
      wrong: [
        'Wait, I was wrong? I thought "{{keyword}}" meant {{attempted}}. Fixing my brain now!',
        'Oops! Not {{attempted}}. Let me learn that better. "{{keyword}}" → {{suggestion}}.',
      ],
      learningMilestone: {
        5: 'Five done! I\'m getting faster and faster! 🏃‍♂️',
        8: 'All eight! Pattern recognition level UP!',
      },
      outro: [
        'I can recognize keywords in a snap now! Practice makes AI faster. {{correct}}/{{total}} correct!',
      ],
      aiConcept: 'With enough examples, AI can recognize patterns instantly — just like you get faster at a game with practice.',
    },

    4: {
      intro: [
        'Tricky one! "I love parks, but the trash bins are overflowing!" It mentions TWO things. What\'s the REAL problem? 🤔',
        'Both park AND trash in one email! Which department does this go to? The feeling number tells us!',
      ],
      correct: [
        'Aha! The angry feeling ({{score}}) is about TRASH, not parks! The emotion finds the real problem! 🔍',
        'Keywords said parks, but the angry feeling ({{score}}) is about {{primary}}. I learned to read between the lines!',
      ],
      wrong: [
        'I got tricked by "{{keyword}}"! But the angry feeling is really about {{suggestion}}. Feeling beats keywords!',
        '"{{keyword}}" distracted me! Score {{score}} shows the real problem is {{suggestion}}. I\'ll remember!',
      ],
      learningMilestone: {
        1: 'When keywords fight, the feeling wins! The emotion number finds the real problem!',
        2: 'Two tricky emails done! I\'m learning to read between the lines like a real AI!',
      },
      outro: [
        'Trickiest lesson! When an email says two things, the feeling number tells you the REAL problem. People complain most about what makes them angriest!',
      ],
      aiConcept: 'When two topics conflict, the emotion score reveals the real complaint. Smart AI reads between the lines.',
    },

    5: {
      intro: [
        'EMERGENCY! ⛈️ A big storm hit the city! 12 angry people need help NOW. I\'m nervous but... you taught me everything I need. Let\'s do this!',
        'Crisis mode! Storm damage everywhere. Everyone is angry and needs help fast. I know what to do — you prepared me for this! 💪',
      ],
      correct: [
        'Crisis sorted! {{dept}} done. Score {{score}}. We\'ve got this! 💪',
        'One down, {{remaining}} to go! Keywords {{keywordlist}} → {{dept}}. Training pays off!',
      ],
      wrong: [
        'My mistake! In a crisis I need to stay calm. "{{keyword}}" = {{suggestion}}, not {{attempted}}.',
        'Got nervous! "{{keyword}}" goes to {{suggestion}}, not {{attempted}}. Correcting!',
      ],
      learningMilestone: {
        5: 'Five done! Halfway through the crisis! We can do this!',
        10: 'Ten done! Almost there! You\'re amazing under pressure!',
      },
      outro: [
        'WE DID IT! 🎉 Keywords (Level 1), urgency (Level 2), speed (Level 3), mixed topics (Level 4), and crisis (Level 5). Every lesson helped. Thank you, teacher!',
      ],
      aiConcept: 'All skills combine under pressure. Keyword matching + feeling reading + disambiguation = fully trained AI.',
    },
  };

  // ──────────────────────────────────────────────
  // Generic fallback dialogue (when level-specific runs out)
  // ──────────────────────────────────────────────

  const GENERIC = {
    correct: [
      'Yes! Right sort! I learned from that! ⭐',
      'Got it! One more example for my brain!',
      'Zing! 💫 I learned that one!',
    ],
    wrong: [
      'Not quite! Mistakes help me learn too!',
      'Oops! I learned what NOT to do — useful!',
      'Close! Let me remember that for next time.',
    ],
    learnNotification: 'Nova learned "{{keyword}}" → {{dept}}!',
  };

  // ──────────────────────────────────────────────
  // Between-level recap templates
  // ──────────────────────────────────────────────

  const RECAP_TEMPLATES = {
    1: {
      title: 'First Lesson Complete! ⭐',
      before: 'Nova knew 0 keywords.',
      after: 'Now Nova knows {{count}} keywords! "Bus" → Transit, "trash" → Waste, "park" → Parks!',
      emoji: '📖',
    },
    2: {
      title: 'Priority Complete! ⚡',
      before: 'Nova couldn\'t tell which emails were urgent.',
      after: 'Now Nova checks the feeling number first! Angry = urgent, happy = later!',
      emoji: '⚡',
    },
    3: {
      title: 'Speed Complete! 🏃‍♂️',
      before: 'Nova had to think slowly about each email.',
      after: 'Nova can recognize patterns instantly — {{correct}}/{{total}} at speed!',
      emoji: '⚡',
    },
    4: {
      title: 'Tricky Filter Complete! 🔍',
      before: 'Nova got confused by mixed-topic emails.',
      after: 'Nova learned to read the feeling number to find the REAL problem!',
      emoji: '🔍',
    },
    5: {
      title: 'Crisis Complete! 🏆',
      before: 'Nova was nervous about handling a big crisis.',
      after: 'Nova handled {{correct}}/{{total}} urgent emails under pressure! Ready for anything!',
      emoji: '🏆',
    },
  };

  // ──────────────────────────────────────────────
  // Nova's expression → emoji mapping
  // ──────────────────────────────────────────────

  const EXPRESSIONS = {
    nervous: '😊',
    curious: '🤔',
    confident: '😌',
    thoughtful: '🧐',
    determined: '💪',
    proud: '🌟',
    wise: '🧠',
    happy: '😄',
    thinking: '🤔',
    celebrating: '🎉',
  };

  // ──────────────────────────────────────────────
  // Sentiment readability mapping
  // ──────────────────────────────────────────────

  function sentimentReadable(score) {
    if (score <= -4) return 'very angry, extremely urgent';
    if (score <= -2) return 'annoyed, urgent';
    if (score < 0) return 'mildly upset, somewhat urgent';
    if (score === 0) return 'neutral, routine';
    if (score <= 2) return 'mildly happy, routine';
    if (score <= 4) return 'happy, not urgent';
    return 'very happy, least urgent';
  }

  function sentimentLabel(score) {
    if (score <= -3) return 'negative';
    if (score >= 3) return 'positive';
    return 'neutral';
  }

  // ──────────────────────────────────────────────
  // Department name mapping
  // ──────────────────────────────────────────────

  const DEPT_NAMES = {
    parks: 'Parks & Recreation',
    transit: 'Transit Authority',
    waste: 'Waste Management',
  };

  // ──────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────

  return {
    CHARACTER_ARC,
    LEVEL_DIALOGUE,
    GENERIC,
    RECAP_TEMPLATES,
    EXPRESSIONS,
    DEPT_NAMES,
    sentimentReadable,
    sentimentLabel,
  };
})();
// Expose on window for inline scripts (const doesn't set window property)
try { window.NarrativeData = NarrativeData; } catch(e) {}
