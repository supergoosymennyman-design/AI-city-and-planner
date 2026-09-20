/**
 * items.js — Item & hotspot definitions for Recycling Vision Annotator
 *
 * Levels 1, 3 use traditional tap-to-annotate hotspot overlays.
 * Levels 2, 4 use feature-selection grids (cards to tap).
 * Level 5 uses timed feature-identification rounds.
 */

const Items = (() => {
  'use strict';

  // ── Level 1: Object Detection / Bounding Boxes ──
  const L1_ITEMS = [
    { id: 'plastic_bottle', emoji: '\uD83E\uDDF4', name: 'Plastic Bottle', x: 2,  y: 12, w: 20, h: 65 },
    { id: 'aluminum_can',   emoji: '\uD83E\uDD6B', name: 'Aluminum Can',   x: 24, y: 20, w: 16, h: 55 },
    { id: 'toy_car',        emoji: '\uD83D\uDE97', name: 'Toy Car',        x: 42, y: 24, w: 18, h: 48 },
    { id: 'banana',         emoji: '\uD83C\uDF4C', name: 'Banana',         x: 62, y: 18, w: 16, h: 56 },
    { id: 'apple_core',     emoji: '\uD83C\uDF4E', name: 'Apple Core',     x: 80, y: 22, w: 16, h: 52 }
  ];

  const L1_HOTSPOTS = [
    { id: 'bottle_zone', itemId: 'plastic_bottle', x: 20, y: 20, w: 60, h: 60, correct: true,  label: 'Bottle' },
    { id: 'can_zone',     itemId: 'aluminum_can',   x: 20, y: 20, w: 60, h: 60, correct: true,  label: 'Can' },
    { id: 'car_zone',     itemId: 'toy_car',        x: 20, y: 20, w: 60, h: 60, correct: true,  label: 'Car' },
    { id: 'banana_zone',  itemId: 'banana',         x: 20, y: 20, w: 60, h: 60, correct: false, label: 'Banana' },
    { id: 'apple_zone',   itemId: 'apple_core',     x: 20, y: 20, w: 60, h: 60, correct: false, label: 'Apple' }
  ];

  // ── Level 2: Geometry / Landmark Feature Selection ──
  // Grid of geometric feature cards. User taps all the "corner/vertex" ones.
  const L2_FEATURES = [
    {
      id: 'corner_l',
      visual: 'corner',
      label: 'Corner (L-shape)',
      correct: true,
      description: 'An L-shaped corner — two edges meet at 90\u00B0'
    },
    {
      id: 'corner_acute',
      visual: 'corner-acute',
      label: 'Corner (Sharp)',
      correct: true,
      description: 'A sharp V-shaped corner'
    },
    {
      id: 'vertex_point',
      visual: 'vertex',
      label: 'Vertex (Point)',
      correct: true,
      description: 'A single point where lines meet'
    },
    {
      id: 'edge_straight',
      visual: 'edge',
      label: 'Straight Edge',
      correct: false,
      description: 'A straight line between two points'
    },
    {
      id: 'curve',
      visual: 'curve',
      label: 'Curved Edge',
      correct: false,
      description: 'A smooth curved line'
    },
    {
      id: 'circle',
      visual: 'circle',
      label: 'Circle (Round)',
      correct: false,
      description: 'A perfectly round shape with no corners'
    },
    {
      id: 'cross',
      visual: 'cross',
      label: 'Cross Intersection',
      correct: false,
      description: 'Two lines crossing'
    },
    {
      id: 't_junction',
      visual: 't-junction',
      label: 'T-Junction',
      correct: false,
      description: 'A T-shaped junction'
    },
    {
      id: 'surface',
      visual: 'surface',
      label: 'Flat Surface',
      correct: false,
      description: 'A flat 2D area with no corners'
    },
    {
      id: 'wave',
      visual: 'wave',
      label: 'Wavy Edge',
      correct: false,
      description: 'A wavy, zigzag line'
    }
  ];

  // ── Level 3: Surface Texture Analysis ──
  // (unchanged — uses tap-to-annotate with texture categories)
  const L3_ITEMS = [
    { id: 'sponge',     emoji: '\uD83E\uDDFD', name: 'Sponge',       x: 2,  y: 6,  w: 30, h: 40 },
    { id: 'paper',      emoji: '\uD83D\uDCC4', name: 'Scrap Paper',  x: 35, y: 8,  w: 28, h: 38 },
    { id: 'yarn',       emoji: '\uD83E\uDDF6', name: 'Yarn Ball',    x: 66, y: 4,  w: 28, h: 42 },
    { id: 'gem',        emoji: '\uD83D\uDC8E', name: 'Gem',          x: 6,  y: 52, w: 26, h: 40 },
    { id: 'mirror',     emoji: '',             name: 'Mirror Shard', x: 36, y: 54, w: 28, h: 38, customClass: 'item-mirror-shard' },
    { id: 'phone',      emoji: '\uD83D\uDCF1', name: 'Phone Screen', x: 68, y: 52, w: 28, h: 42 }
  ];

  const L3_HOTSPOTS = [
    { id: 'sponge_textured',  itemId: 'sponge', x: 2,  y: 5,  w: 46, h: 90, correct: true,  label: 'Textured',  category: 'textured' },
    { id: 'sponge_glossy',    itemId: 'sponge', x: 52, y: 5,  w: 46, h: 90, correct: false, label: 'Glossy',    category: 'glossy' },
    { id: 'paper_textured',   itemId: 'paper',  x: 2,  y: 5,  w: 46, h: 90, correct: true,  label: 'Textured',  category: 'textured' },
    { id: 'paper_glossy',     itemId: 'paper',  x: 52, y: 5,  w: 46, h: 90, correct: false, label: 'Glossy',    category: 'glossy' },
    { id: 'yarn_textured',    itemId: 'yarn',   x: 2,  y: 5,  w: 46, h: 90, correct: true,  label: 'Textured',  category: 'textured' },
    { id: 'yarn_glossy',      itemId: 'yarn',   x: 52, y: 5,  w: 46, h: 90, correct: false, label: 'Glossy',    category: 'glossy' },
    { id: 'gem_glossy',       itemId: 'gem',    x: 2,  y: 5,  w: 46, h: 90, correct: true,  label: 'Glossy',    category: 'glossy' },
    { id: 'gem_textured',     itemId: 'gem',    x: 52, y: 5,  w: 46, h: 90, correct: false, label: 'Textured',  category: 'textured' },
    { id: 'mirror_glossy',    itemId: 'mirror', x: 2,  y: 5,  w: 46, h: 90, correct: true,  label: 'Glossy',    category: 'glossy' },
    { id: 'mirror_textured',  itemId: 'mirror', x: 52, y: 5,  w: 46, h: 90, correct: false, label: 'Textured',  category: 'textured' },
    { id: 'phone_glossy',     itemId: 'phone',  x: 2,  y: 5,  w: 46, h: 90, correct: true,  label: 'Glossy',    category: 'glossy' },
    { id: 'phone_textured',   itemId: 'phone',  x: 52, y: 5,  w: 46, h: 90, correct: false, label: 'Textured',  category: 'textured' }
  ];

  // ── Level 4: Symbol & Text Tagging ──
  // Grid of symbol/text cards. User taps the recycling symbol and barcode.
  const L4_FEATURES = [
    {
      id: 'recycle_symbol',
      visual: '♻\uFE0F',
      label: 'Recycling Symbol',
      correct: true,
      description: 'Three arrows in a triangle — the universal recycling logo'
    },
    {
      id: 'barcode',
      visual: 'barcode',
      label: 'Barcode',
      correct: true,
      description: 'Vertical black lines used to identify products'
    },
    {
      id: 'warning',
      visual: '\u26A0\uFE0F',
      label: 'Warning Symbol',
      correct: false,
      description: 'A warning triangle'
    },
    {
      id: 'copyright',
      visual: '\u00A9\uFE0F',
      label: 'Copyright Symbol',
      correct: false,
      description: 'The copyright circle-C'
    },
    {
      id: 'registered',
      visual: '\u00AE\uFE0F',
      label: 'Registered Mark',
      correct: false,
      description: 'The registered circle-R'
    },
    {
      id: 'dollar',
      visual: '\u00A5',
      label: 'Yen Symbol',
      correct: false,
      description: 'Currency symbol for Yen'
    },
    {
      id: 'at_symbol',
      visual: '@',
      label: 'At Symbol',
      correct: false,
      description: 'The commercial at sign'
    },
    {
      id: 'hash',
      visual: '#',
      label: 'Hash Symbol',
      correct: false,
      description: 'The number sign / hashtag'
    },
    {
      id: 'percent',
      visual: '%',
      label: 'Percent Symbol',
      correct: false,
      description: 'The percent sign'
    },
    {
      id: 'arrow',
      visual: '\u27A1\uFE0F',
      label: 'Arrow',
      correct: false,
      description: 'A right-pointing arrow'
    }
  ];

  // ── Level 5: Conveyor Scan Challenge (Timed Feature ID) ──
  // Multiple rounds. Each round shows a grid; user must tap the correct feature quickly.
  const L5_ROUNDS = [
    {
      prompt: 'Find the \u267B Recycling Symbol!',
      correctId: 'l5_recycle',
      time: 5
    },
    {
      prompt: 'Find the Box Corner!',
      correctId: 'l5_corner',
      time: 5
    },
    {
      prompt: 'Find the Textured Face!',
      correctId: 'l5_texture',
      time: 5
    },
    {
      prompt: 'Find the Glossy Face!',
      correctId: 'l5_glossy',
      time: 5
    },
    {
      prompt: 'Find the Barcode!',
      correctId: 'l5_barcode',
      time: 5
    }
  ];

  const L5_FEATURES = [
    { id: 'l5_recycle', visual: '♻\uFE0F', label: 'Recycling \u267B', description: 'Three arrows in a triangle' },
    { id: 'l5_corner', visual: 'corner', label: 'Box Corner', description: 'An L-shaped corner' },
    { id: 'l5_texture', visual: 'texture', label: 'Textured Face', description: 'A rough, bumpy surface' },
    { id: 'l5_glossy', visual: 'glossy', label: 'Glossy Face', description: 'A shiny, reflective surface' },
    { id: 'l5_barcode', visual: 'barcode', label: 'Barcode', description: 'Vertical black lines' },
    { id: 'l5_warning', visual: '\u26A0\uFE0F', label: 'Warning', description: 'A warning triangle' },
    { id: 'l5_arrow', visual: '\u27A1\uFE0F', label: 'Arrow', description: 'A right-pointing arrow' },
    { id: 'l5_star', visual: '\u2B50', label: 'Star', description: 'A five-pointed star' }
  ];


  // ── Level 6: Graphics-Only Quick ID (no text labels on cards) ──
  // Like Level 5 but cards show only the visual, no label text.
  // Tests pattern recognition without reading.
  const L6_ROUNDS = [
    {
      prompt: 'Spot the \uD83D\uDD04 Recycling Symbol!',
      correctId: 'l6_recycle',
      time: 4
    },
    {
      prompt: 'Find the L-shaped \u25A0 Corner!',
      correctId: 'l6_corner_l',
      time: 4
    },
    {
      prompt: 'Which has a \uD83D\uDCA7 Texture pattern?',
      correctId: 'l6_texture',
      time: 4
    },
    {
      prompt: 'Which is \u2728 Glossy / Shiny?',
      correctId: 'l6_glossy',
      time: 4
    },
    {
      prompt: 'Find the \uD83D\uDCAF Barcode!',
      correctId: 'l6_barcode',
      time: 4
    },
    {
      prompt: 'Spot the V-shaped \u2B23 Sharp Corner!',
      correctId: 'l6_corner_acute',
      time: 4
    }
  ];

  const L6_FEATURES = [
    { id: 'l6_recycle', visual: '\u267B\uFE0F', label: '', description: 'Three arrows in a triangle' },
    { id: 'l6_corner_l', visual: 'corner', label: '', description: 'An L-shaped corner' },
    { id: 'l6_texture', visual: 'texture', label: '', description: 'A rough, bumpy surface' },
    { id: 'l6_glossy', visual: 'glossy', label: '', description: 'A shiny, reflective surface' },
    { id: 'l6_barcode', visual: 'barcode', label: '', description: 'Vertical black lines' },
    { id: 'l6_corner_acute', visual: 'corner-acute', label: '', description: 'A sharp V-shaped corner' },
    { id: 'l6_warning', visual: '\u26A0\uFE0F', label: '', description: 'A warning triangle' },
    { id: 'l6_arrow', visual: '\u27A1\uFE0F', label: '', description: 'A right-pointing arrow' },
    { id: 'l6_circle', visual: 'circle', label: '', description: 'A round circle' },
    { id: 'l6_cross', visual: 'cross', label: '', description: 'Two lines crossing' }
  ];


  // ══════════════════════════════════════════════
  // GETTERS
  // ══════════════════════════════════════════════

  function getItems(level) {
    switch (level) {
      case 1: return L1_ITEMS;
      case 3: return L3_ITEMS;
      default: return [];
    }
  }

  function getHotspots(level) {
    switch (level) {
      case 1: return L1_HOTSPOTS;
      case 3: return L3_HOTSPOTS;
      default: return [];
    }
  }

  function getFeatureCards(level) {
    switch (level) {
      case 2: return L2_FEATURES;
      case 4: return L4_FEATURES;
      case 5: return L5_FEATURES;
      case 6: return L6_FEATURES;
      default: return [];
    }
  }

  function getL5Rounds() { return L5_ROUNDS; }
  function getRounds(level) {
    switch (level) {
      case 5: return L5_ROUNDS;
      case 6: return L6_ROUNDS;
      default: return [];
    }
  }

  function getCorrectIds(level) {
    if (level === 2) return L2_FEATURES.filter(f => f.correct).map(f => f.id);
    if (level === 4) return L4_FEATURES.filter(f => f.correct).map(f => f.id);
    return getHotspots(level).filter(h => h.correct).map(h => h.id);
  }

  function getWrongIds(level) {
    if (level === 2) return L2_FEATURES.filter(f => !f.correct).map(f => f.id);
    if (level === 4) return L4_FEATURES.filter(f => !f.correct).map(f => f.id);
    return getHotspots(level).filter(h => !h.correct).map(h => h.id);
  }

  function validateSelection(level, selectedIds) {
    const correct = getCorrectIds(level).sort();
    const selected = [...selectedIds].sort();
    return selected.length === correct.length &&
      selected.every((id, i) => id === correct[i]);
  }

  return {
    getItems, getHotspots, getFeatureCards,
    getCorrectIds, getWrongIds, validateSelection,
    getL5Rounds, getRounds
  };
})();
