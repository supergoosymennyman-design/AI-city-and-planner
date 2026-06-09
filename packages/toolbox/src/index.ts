/**
 * @edu/toolbox — canonical on-device AI/voice implementations behind the frozen
 * `@edu/contract` surfaces (§3/§5). The host composes these into `GameContext`;
 * games never import this package (golden rule #2, ctx-only I/O).
 *
 * - `createAIServices` → `AIServices` (pose/hands, teachable image, Web-Speech STT)
 * - `createAudioBus`   → `AudioBus`   (speechSynthesis TTS + Web-Audio chimes)
 * - raw managers       → escape hatch for continuous/streaming use the one-shot
 *                        contract surface intentionally doesn't expose.
 */
export { createAIServices } from './ai.js';
export type { ToolboxAIOptions } from './ai.js';

export { createAudioBus } from './audio.js';
export type { ToolboxAudioOptions } from './audio.js';

export { JointDetectionManager } from './engine/joints.js';
export type {
  JointDetectionOptions,
  VisionTasksLib,
  JointResults,
  MpLandmark,
} from './engine/joints.js';

export { RecognitionManager } from './engine/recognition.js';
export type {
  RecognitionOptions,
  ClassifyResult,
  CocoModel,
  CocoSsdLib,
  CocoPrediction,
  TfLib,
} from './engine/recognition.js';

export { ConversationManager } from './engine/conversation.js';
export type { ConversationOptions } from './engine/conversation.js';
