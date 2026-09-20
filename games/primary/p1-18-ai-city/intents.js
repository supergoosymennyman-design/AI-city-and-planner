/**
 * intents.js — Nova Jr. intent definitions for My First AI City
 * Passive AI: only responds when addressed. Short responses for young kids.
 */
const Intents = (() => {
  'use strict';

  const INTENTS = [
    {
      id: 'help',
      patterns: [/help/i, /what.*do/i, /how.*play/i],
      responses: [
        'Drag buildings from the left side onto the green squares! Then connect pipes and roads. Then press Start City!',
      ]
    },
    {
      id: 'cost',
      patterns: [/cost/i, /how much/i, /coin/i, /money/i, /spend/i],
      responses: [
        'Homes cost 2 coins. Schools cost 3. Hospitals cost 4. Parks cost just 1! You have 20 coins to spend.',
      ]
    },
    {
      id: 'scan',
      patterns: [/scan/i, /hazard/i, /hidden/i, /underground/i, /ground/i],
      responses: [
        'Tap the Scan Ground button, then tap any square! If something is hiding under there, it turns red!',
      ]
    },
    {
      id: 'connect',
      patterns: [/connect/i, /pipe/i, /road/i, /wire/i, /water/i, /power/i],
      responses: [
        'Tap the water tower first, then tap each building to give them water! Then do the same for power, then build roads!',
      ]
    },
    {
      id: 'waste',
      patterns: [/trash/i, /rubbish/i, /recycl/i, /sort/i, /bin/i],
      responses: [
        'Plastic bottles and glass jars go in Recycle! Apple cores go in Compost! Batteries go in General!',
      ]
    },
    {
      id: 'puddle',
      patterns: [/puddle/i, /rain/i, /flood/i, /water.*road/i, /splash/i],
      responses: [
        'Tap the puddles to drain them! Quick, before the bus gets stuck!',
      ]
    },
    {
      id: 'encourage',
      patterns: [/good/i, /nice/i, /great/i, /done/i, /finish/i, /yay/i, /well done/i],
      responses: [
        'You are doing an amazing job!',
        'Wow! Your city looks fantastic!',
        'The citizens are going to be so happy!',
      ]
    },
    {
      id: 'nova',
      patterns: [/nova/i, /robot/i, /friend/i, /hello/i, /hi/i],
      responses: [
        'Hi! I am Nova Jr.! I am learning how to build a city with you!',
        'Hello! Let us build a great city together!',
      ]
    }
  ];

  function match(text) {
    for (const intent of INTENTS) {
      for (const p of intent.patterns) {
        if (p.test(text)) {
          return intent.responses[Math.floor(Math.random() * intent.responses.length)];
        }
      }
    }
    return null;
  }

  return { match };
})();
