/**
 * levels.js — Level definitions and metadata
 */
const Levels = (() => {
  'use strict';

  const LEVEL_DATA = [
    {
      id: 1,
      title: 'Object Detection',
      instruction: 'Tap each RECYCLABLE container to add a green bounding box. Ignore organic waste!',
      explanation: 'Bounding boxes are green rectangles that help AI learn WHERE objects are in an image. By drawing boxes around bottles, cans, and cars, you\'re teaching the AI to recognize what these objects look like — even when they\'re mixed with other items on a conveyor belt!',
      style: 'bounding_box',
      passCount: 3, totalItems: 5, wrongSubtract: true,
      description: 'Find all 3 recyclable items (bottle, can, car). Skip the banana and apple.'
    },
    {
      id: 2,
      title: 'Landmark Mapping',
      instruction: 'Tap ALL the CORNER features below. Corners are where two edges meet!',
      explanation: 'In geometry and computer vision, "landmarks" are key points that help AI understand an object\'s shape. Corners and vertices are important landmarks — they tell the AI where edges change direction, helping it measure volume and detect 3D structure from flat images.',
      style: 'feature_select',
      passCount: 3, totalItems: 10, wrongSubtract: true,
      description: 'Select all 3 corner/vertex features from the grid.'
    },
    {
      id: 3,
      title: 'Surface Texture',
      instruction: 'Categorize each item: tap TEXTURED (yellow) or GLOSSY (blue) for every item!',
      explanation: 'AI vision systems analyze surface textures to identify materials. Textured surfaces like sponge and paper absorb light and look rough. Glossy surfaces like glass and metal reflect light and look shiny. Learning this difference helps AI sort materials correctly!',
      style: 'texture',
      passCount: 6, totalItems: 6, wrongSubtract: true,
      description: 'Classify all 6 items as textured or glossy.'
    },
    {
      id: 4,
      title: 'Symbol Tagging',
      instruction: 'Tap the RECYCLING SYMBOL (\u267B) and the BARCODE. Ignore everything else!',
      explanation: 'AI scanners in recycling facilities look for specific symbols and codes. The \u267B recycling logo tells the AI "this item can be recycled." The barcode helps identify what material the item is made of. Teaching AI to find these symbols among dirt and scratches is called "feature detection in noisy environments."',
      style: 'feature_select',
      passCount: 2, totalItems: 10, wrongSubtract: true,
      description: 'Find and tap the 2 correct markings.'
    },
    {
      id: 5,
      title: 'Conveyor Scan',
      instruction: '5 rounds — quickly tap the correct feature before time runs out!',
      explanation: 'Real recycling AI systems work at incredible speed, identifying items as they zoom past on conveyor belts. In this challenge, you\'ll practice identifying features under time pressure — just like a real computer vision system!',
      style: 'feature_select_timed',
      passCount: 4, totalItems: 5, timePerItem: 5,
      description: 'Identify the correct feature across 5 timed rounds.'
    },
    {
      id: 6,
      title: 'Quick ID Challenge',
      instruction: '6 rounds — spot the feature by sight alone, no text labels!',
      explanation: 'Real AI vision systems don\'t read labels — they recognize patterns by sight alone. This challenge removes all text hints so you must rely purely on visual pattern recognition, just like a real computer vision model!',
      style: 'feature_select_timed',
      hideLabels: true,
      passCount: 4, totalItems: 6, timePerItem: 4,
      description: 'Identify features by graphics alone across 6 timed rounds.'
    }
  ];

  const CONVEYOR_ORDER = [];

  function getLevel(id) { return LEVEL_DATA.find(l => l.id === id) || null; }
  function getAll() { return [...LEVEL_DATA]; }
  function getConveyorOrder() { return [...CONVEYOR_ORDER]; }
  function getPassThreshold(levelId) {
    const l = getLevel(levelId);
    return l ? l.passCount : 0;
  }

  return { getLevel, getAll, getConveyorOrder, getPassThreshold };
})();
