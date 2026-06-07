/**
 * Hand-written types for conversation.js. Exported raw as an escape hatch for the
 * future `converse` capability; not used by the AIServices/AudioBus adapters.
 */
export interface ConversationOptions {
  systemPrompt?: string;
  sttMode?: string;
  ttsMode?: string;
  llmMode?: string;
  llmApiUrl?: string;
  llmApiKey?: string;
  vadThreshold?: number;
  vadFramesBefore?: number;
  vadFramesAfter?: number;
}

export declare class ConversationManager {
  constructor(options?: ConversationOptions);

  state: string;
  listening: boolean;
  speaking: boolean;
  ready: boolean;

  onStateChange: ((state: string) => void) | null;
  onUserSpeech: ((text: string) => void) | null;
  onError: ((message: string) => void) | null;
  onReady: ((ready: boolean) => void) | null;
  onListeningChange: ((listening: boolean) => void) | null;

  initialize(): void;
  startListening(): void;
  stopListening(): void;
  respondTo(text: string, systemPrompt?: string, callback?: (reply: string) => void): void;
  speak(text: string): void;
  interrupt(): void;
  setSystemPrompt(prompt: string): void;
  getState(): Record<string, unknown>;
  destroy(): void;
}
