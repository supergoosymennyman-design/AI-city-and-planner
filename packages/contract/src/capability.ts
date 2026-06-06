import { z } from 'zod';

/**
 * The pre-enumerated set of AI capabilities a game may declare in its manifest.
 * First-pass set (§5); additive-only + versioned under core-guardian (§0.5).
 * A game lists only what it actually uses, so the host can size-budget models
 * and the capability-probe (R21) can gate features per device.
 */
export const Capability = z.enum([
  'recognizeImage', // MobileNet + knn-classifier teachable (ported, tfjs 4.x) — §5
  'recognizePose', // MediaPipe Hands + gesture classifier (ported) — §5, hardware-gated
  'listen', // STT — Android-Chrome-only, always skippable (§5)
  'speak', // TTS via speechSynthesis (English-primary)
  'converse', // scripted/rule-based dialogue via ConversationManager (ported)
  'generateImage', // offline sticker-remix (NOT real diffusion)
  'generateAudio', // Web Audio sequencing of recorded samples
  'trainModel', // on-device KNN / few-shot training
]);

export type Capability = z.infer<typeof Capability>;
