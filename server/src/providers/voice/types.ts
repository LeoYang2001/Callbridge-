import type { ToolDefinition } from '../../agent/tools';

/**
 * A realtime speech-to-speech conversational agent. Implementations: OpenAI Realtime today;
 * could be swapped for another realtime provider or a cascaded STT → LLM → TTS pipeline as long
 * as it emits these events.
 */
export interface VoiceAgentConfig {
  instructions: string;
  tools: ToolDefinition[];
}

export interface VoiceAgentEvents {
  /** Session configured and ready to accept audio. */
  ready: () => void;
  /** Base64 μ-law audio chunk for the assistant item `itemId`. */
  audio: (itemId: string, payloadB64: string) => void;
  /** The remote party started speaking (used for barge-in). */
  speechStarted: () => void;
  speechStopped: () => void;
  /** A new utterance has begun; its text will follow in `transcript`. */
  utteranceStarted: (itemId: string, speaker: 'assistant' | 'counterpart') => void;
  transcript: (itemId: string, speaker: 'assistant' | 'counterpart', text: string) => void;
  toolCall: (callId: string, name: string, args: string) => void;
  responseDone: () => void;
  /** Named `failure` rather than `error` so a missing listener never throws. */
  failure: (message: string, fatal: boolean) => void;
  closed: () => void;
}

export interface VoiceAgent {
  connect(config: VoiceAgentConfig): Promise<void>;
  sendAudio(payloadB64: string): void;
  /** Tell the model how much of item `itemId` the listener actually heard before interrupting. */
  truncate(itemId: string, audioEndMs: number): void;
  /** Return a tool result. `respond` asks the model to speak after it. */
  sendToolResult(callId: string, output: unknown, respond: boolean): void;
  /** Inject a system note and ask the model to respond. */
  prompt(systemText: string): void;
  on<E extends keyof VoiceAgentEvents>(event: E, listener: VoiceAgentEvents[E]): void;
  close(): void;
}
