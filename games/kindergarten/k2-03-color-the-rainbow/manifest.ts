import type { GameManifest } from '@edu/contract';

/**
 * Color the Rainbow — game manifest (§3). The contract's outer surface, validated by
 * `validate-contracts` against the Zod `GameManifest`. Imported TYPE-ONLY from
 * @edu/contract, so this compiles to a dependency-free `dist/manifest.js` the gate can
 * load standalone (verbatimModuleSyntax erases the import).
 *
 * K2 Lesson 3 of the kindergarten track (docs/curriculum/kindergarten-k2-03-color-the-rainbow.md).
 * Inputs: SAY the colour (STT, Android-Chrome only) OR tap/keyboard — tap is always present (§6b).
 */
export const manifest: GameManifest = {
  // id == band-NN-slug, 1:1 with the game folder (docs/curriculum/README.md naming rule).
  id: 'k2-03-color-the-rainbow',
  track: 'kindergarten',
  lesson: 3, // K2 Lesson 3 — see docs/curriculum/kindergarten-k2-03-color-the-rainbow.md
  ageBand: 'K2', // the band, in caps (was 'K2-K3'; this lesson is specifically K2)
  title: { en: 'Color the Rainbow' },
  concept: 'Colours (red, blue, yellow) and that an AI only knows the labels you teach it',
  objective: {
    en: 'Teach an AI the names of colours by colouring shapes, then recognise red, blue and yellow.',
  },
  successCriteria: [
    'Teaches the AI red, blue and yellow by colouring a shape and naming each',
    'Names colours the AI shows in the recognition game',
    'Recognises that the AI repeats back exactly what it was taught',
  ],
  misconception:
    'That the AI already knows colours — it knows only what it is taught; teach it wrong and it answers wrong.',
  bigIdea: 3, // AI4K12 Big Idea 3 — Learning (teach-by-example, no ground truth)
  aiRepresentation: 'rule-based', // 1-NN over taught labels; the AI never judges the real colour
  a11y: {
    instructionChannels: ['visual', 'audio'], // on-screen bubble + spoken (TTS) twin
    inputChannels: ['tap', 'voice', 'keyboard'], // say the colour (STT) OR tap/keyboard buttons
    reducedMotion: true,
  },
  capabilities: ['speak', 'listen'], // TTS bot voice + STT "AI, this is red!" (tap fallback)
  assetMode: 'composed', // no external assets — shapes are SVG, sounds are synthesized
  assets: [],
  orientation: 'landscape',
};
