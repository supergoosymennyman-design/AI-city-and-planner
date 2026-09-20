/**
 * citizens.js — Citizen profiles for Nova's story
 * Each citizen has a face (emoji), name, description, and backstory.
 */
const Citizens = (() => {
  'use strict';

  const ALL = {
    // Level 1 — The Playground Project
    buildco: {
      emoji: '🏗️',
      shortName: 'BuildCo',
      fullName: 'BuildCo Construction',
      story: 'sending blueprints for a new city playground!',
      description: 'A friendly construction company. They need their 100-page blueprints processed so they can build a playground for the neighborhood kids.',
      novaIntro: 'BuildCo just sent blueprints for a new playground! 🏗️ 100 pages — that\'s huge! How much should we charge?',
      novaPass: 'The playground is going to be built! 🎠 Kids will be playing there because you helped!',
    },
    // Level 2 — Dr. Kim's Patients
    drkim: {
      emoji: '🏥',
      shortName: 'Dr. Kim',
      fullName: 'Dr. Kim\'s Clinic',
      story: 'sending urgent medical test results!',
      description: 'A local doctor who needs test results processed quickly. Each file is tiny but super complex — lives depend on this.',
      novaIntro: 'These are from Dr. Kim\'s clinic! 🏥 Tiny files, but they\'re super complex medical results. Patients are waiting!',
      novaPass: 'Dr. Kim got the test results in time. Patients are being treated! 😷 You made a difference!',
    },
    // Level 3 — Monday Morning Rush
    parks: {
      emoji: '🌳',
      shortName: 'City Parks',
      fullName: 'Parks Department',
      story: 'sending their weekly maintenance report!',
    },
    transit: {
      emoji: '🚌',
      shortName: 'City Transit',
      fullName: 'Transit Authority',
      story: 'sending bus route updates!',
    },
    library: {
      emoji: '📚',
      shortName: 'City Library',
      fullName: 'Public Library',
      story: 'sending new book catalogues!',
    },
    schools: {
      emoji: '🏫',
      shortName: 'City Schools',
      fullName: 'School District',
      story: 'sending student records!',
    },
    // Level 4 — Mrs. Chen's Bakery / BigCorp
    chen: {
      emoji: '🧁',
      shortName: 'Mrs. Chen',
      fullName: 'Mrs. Chen\'s Bakery',
      story: 'sending her weekly invoice — a tiny file from a small business!',
      description: 'A warm, friendly baker who has run her neighborhood bakery for 30 years. She sends tiny invoices. Every coin counts.',
      novaIntro: 'Mrs. Chen sent her tiny bakery invoice 🧁 right next to BigCorp\'s 200-page report. Should they pay the same?',
      novaPass: 'Mrs. Chen can afford her fees AND BigCorp paid fairly! Everyone wins! 🧁 You\'re a fair teacher!',
    },
    bigcorp: {
      emoji: '🏢',
      shortName: 'BigCorp',
      fullName: 'BigCorp Global',
      story: 'sending their annual report — a massive 200-page file!',
      description: 'A giant corporation. Sends enormous reports. Can afford fair prices — and should pay more than tiny businesses.',
    },
    // Level 5 — The Council's Final Test
    council: {
      emoji: '🏛️',
      shortName: 'The Council',
      fullName: 'City Council',
      story: 'watching Nova\'s final test!',
      description: 'The City Council gave Nova one week to prove herself. Today is judgement day.',
      novaIntro: 'The Council is watching! 🏛️ This is the big test. Everything I\'ve learned — big files, complex files, fairness, speed — all at once!',
      novaPass: 'The Council saw everything! I was fast, fair, and crash-free! I think they were impressed! 🤞',
    },
    // Level 6 — Nova Demonstrates
    nova: {
      emoji: '🤖',
      shortName: 'Nova',
      fullName: 'Nova — AI Protégé',
      story: 'demonstrating everything she learned!',
      novaIntro: 'You taught me everything. Now watch — I\'ll price EVERY file perfectly, all by myself. This is YOUR victory, teacher!',
      novaPass: 'We did it! 🏆 The Council said YES! The city is keeping me! All thanks to the best teacher in the world!',
    },
  };

  function get(id) { return ALL[id] || null; }

  return { ALL, get };
})();
