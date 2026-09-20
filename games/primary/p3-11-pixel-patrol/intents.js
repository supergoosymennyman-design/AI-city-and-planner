/* intents.js — Iris intent classification (fully offline) */
const Intents = (() => {
  const INTENTS = {
    what_is_edge:     { words: ['edge','wireframe','outline','silhouette'], reply: 'Edge Mode strips away colour and shadow, leaving only outlines — like a colouring book without the colours! AI uses this to focus on shapes.' },
    what_is_cv:       { words: ['computer vision','see','vision','camera'], reply: 'Computer Vision is how AI understands images — like teaching a computer to describe what it sees in a photo.' },
    what_is_classification: { words: ['classify','classification','label','category'], reply: 'Classification means sorting things into groups. You did this when you labelled shapes as Person, Car, or Bike!' },
    what_is_noise:    { words: ['noise','filter','glare','shadow','rain'], reply: 'Noise is extra visual information that confuses AI — like rain on a camera lens. Filtering removes the noise so AI can see clearly.' },
    what_is_segmentation: { words: ['segment','separation','split','overlap','separate'], reply: 'Segmentation means splitting a clump of objects into individual ones. Like untangling a pile of headphones — each one becomes separate!' },
    hint:             { words: ['hint','help','stuck','confused','what do'], reply: 'Look at the scene carefully. Try switching between RGB and Edge Mode to compare. Edge Mode shows outlines that are easy to count!' },
    greeting:         { words: ['hi','hello','hey','iris'], reply: 'Hey there, Trainer! Ready to teach me how to see? Switch to Edge Mode and let\'s find some objects!' },
    encourage:        { words: ['good','well done','great','nice'], reply: 'You\'re teaching me to see better every round! Keep going, Trainer!' },
    off_topic:        { words: [], reply: 'I\'m still learning to see! Let\'s focus on finding objects in the scene.' }
  };

  function match(text) {
    const t = text.toLowerCase().trim();
    // Check for direct address
    if (!t.includes('iris') && !t.includes('ai') && !t.includes('trainer') && !t.includes('help')) return null;
    for (const [id, def] of Object.entries(INTENTS)) {
      if (def.words.some(w => t.includes(w))) return { id, reply: def.reply };
    }
    return { id: 'off_topic', reply: INTENTS.off_topic.reply };
  }
  return { match, INTENTS };
})();
