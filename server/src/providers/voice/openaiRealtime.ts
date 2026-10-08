import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { VoiceAgent, VoiceAgentConfig, VoiceAgentEvents } from './types';

export interface OpenAIRealtimeOptions {
  apiKey: string;
  model: string;
  voice: string;
  transcriptionModel: string;
  turnDetection: 'semantic_vad' | 'server_vad';
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  /** Optional logger for protocol-level diagnostics. */
  log?: (type: string, detail?: string) => void;
}

/** Realtime models that accept the `reasoning` session field. */
const isReasoningModel = (model: string) => /^gpt-realtime-2/.test(model);

/**
 * OpenAI Realtime API (GA interface) over WebSocket. Audio in and out is G.711 μ-law, so
 * Twilio frames are forwarded byte-for-byte with no transcoding.
 */
export class OpenAIRealtimeAgent implements VoiceAgent {
  private ws: WebSocket | null = null;
  private readonly emitter = new EventEmitter();
  private responseActive = false;
  private responseQueued = false;
  /** We sent response.create and have not yet seen response.created. */
  private awaitingCreated = false;
  private closedByUs = false;
  /** Assistant transcript text per item, built from deltas, until its `.done` arrives. */
  private readonly partialTranscripts = new Map<string, string>();

  constructor(private readonly opts: OpenAIRealtimeOptions) {}

  connect(config: VoiceAgentConfig): Promise<void> {
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.opts.model)}`;
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${this.opts.apiKey}` } });
    this.ws = ws;

    return new Promise((resolve, reject) => {
      let ready = false;
      const timer = setTimeout(() => {
        if (!ready) reject(new Error('Timed out connecting to OpenAI Realtime'));
      }, 15_000);

      ws.on('open', () => {
        this.send({ type: 'session.update', session: this.sessionConfig(config) });
      });

      ws.on('message', (raw) => {
        let ev: any;
        try {
          ev = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (ev.type === 'session.updated' && !ready) {
          ready = true;
          clearTimeout(timer);
          resolve();
          this.emitter.emit('ready');
          return;
        }
        if (ev.type === 'error' && !ready) {
          clearTimeout(timer);
          reject(new Error(ev.error?.message ?? 'OpenAI Realtime error'));
          return;
        }
        this.handleEvent(ev);
      });

      ws.on('unexpected-response', (_req, res) => {
        clearTimeout(timer);
        reject(new Error(`OpenAI Realtime refused the connection (HTTP ${res.statusCode}). Check OPENAI_API_KEY and access to ${this.opts.model}.`));
        ws.terminate();
      });

      ws.on('error', (err) => {
        if (!ready) {
          clearTimeout(timer);
          reject(err);
        } else {
          this.emitter.emit('failure', err.message, true);
        }
      });

      ws.on('close', (code, reason) => {
        clearTimeout(timer);
        if (!ready) reject(new Error(`OpenAI Realtime closed (${code}) ${reason.toString()}`));
        else if (!this.closedByUs) this.emitter.emit('failure', `Realtime connection closed (${code}) ${reason.toString()}`, true);
        this.emitter.emit('closed');
      });
    });
  }

  private sessionConfig(config: VoiceAgentConfig) {
    // The model detects turns, but the call session decides whether to answer or stop (see
    // CallSession: confirmed barge-in), so automatic responses and interruptions are off.
    const turnDetection =
      this.opts.turnDetection === 'semantic_vad'
        ? { type: 'semantic_vad', eagerness: 'auto', create_response: false, interrupt_response: false }
        : {
            type: 'server_vad',
            threshold: 0.6,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: false,
            interrupt_response: false,
          };

    return {
      type: 'realtime',
      model: this.opts.model,
      instructions: config.instructions,
      output_modalities: ['audio'],
      audio: {
        input: {
          format: { type: 'audio/pcmu' },
          noise_reduction: { type: 'near_field' },
          transcription: { model: this.opts.transcriptionModel, ...(config.transcriptionLanguage ? { language: config.transcriptionLanguage } : {}) },
          turn_detection: turnDetection,
        },
        output: {
          format: { type: 'audio/pcmu' },
          voice: this.opts.voice,
        },
      },
      tools: config.tools.map((t) => ({ type: 'function', ...t })),
      tool_choice: 'auto',
      ...(isReasoningModel(this.opts.model) ? { reasoning: { effort: this.opts.reasoningEffort } } : {}),
    };
  }

  private handleEvent(ev: any) {
    switch (ev.type) {
      case 'response.created':
        this.responseActive = true;
        this.awaitingCreated = false;
        break;
      case 'response.done': {
        this.responseActive = false;
        const status = ev.response?.status;
        if (status && status !== 'completed') this.opts.log?.('ai.response_done', status);
        // A cancelled (interrupted) response may never send transcript.done; flush what we have.
        for (const [itemId, text] of this.partialTranscripts) this.emitter.emit('transcript', itemId, 'assistant', text);
        this.partialTranscripts.clear();
        this.emitter.emit('responseDone');
        if (this.responseQueued) {
          this.responseQueued = false;
          this.createResponse();
        }
        break;
      }
      case 'response.output_audio.delta':
        this.emitter.emit('audio', ev.item_id, ev.delta);
        break;
      case 'response.output_item.added':
        if (ev.item?.type === 'message' && ev.item?.role === 'assistant') {
          this.emitter.emit('utteranceStarted', ev.item.id, 'assistant');
        }
        break;
      case 'response.output_audio_transcript.delta':
        this.partialTranscripts.set(ev.item_id, (this.partialTranscripts.get(ev.item_id) ?? '') + (ev.delta ?? ''));
        break;
      case 'response.output_audio_transcript.done':
        this.partialTranscripts.delete(ev.item_id);
        this.emitter.emit('transcript', ev.item_id, 'assistant', ev.transcript ?? '');
        break;
      case 'input_audio_buffer.speech_started':
        this.emitter.emit('speechStarted');
        break;
      case 'input_audio_buffer.speech_stopped':
        this.emitter.emit('speechStopped');
        break;
      case 'input_audio_buffer.committed':
        this.emitter.emit('utteranceStarted', ev.item_id, 'counterpart');
        break;
      case 'conversation.item.input_audio_transcription.completed':
        this.emitter.emit('transcript', ev.item_id, 'counterpart', ev.transcript ?? '');
        break;
      case 'conversation.item.input_audio_transcription.failed':
        this.emitter.emit('transcript', ev.item_id, 'counterpart', '[inaudible]');
        this.opts.log?.('ai.transcription_failed', ev.error?.message);
        break;
      case 'response.function_call_arguments.done':
        this.emitter.emit('toolCall', ev.call_id, ev.name, ev.arguments ?? '{}');
        break;
      case 'error':
        // Cancelling a response that already finished is harmless (a barge-in raced its end).
        if (ev.error?.code === 'response_cancel_not_active') break;
        if (this.awaitingCreated && ev.error?.code !== 'conversation_already_has_active_response') {
          this.awaitingCreated = false;
          this.responseActive = false;
        }
        // Most realtime errors are recoverable (e.g. truncating an already-finished item).
        this.emitter.emit('failure', ev.error?.message ?? 'Unknown realtime error', false);
        break;
    }
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private createResponse() {
    if (this.responseActive) {
      this.responseQueued = true;
      return;
    }
    // Optimistic: avoids a double create before response.created arrives.
    this.responseActive = true;
    this.awaitingCreated = true;
    this.send({ type: 'response.create' });
  }

  sendAudio(payloadB64: string) {
    this.send({ type: 'input_audio_buffer.append', audio: payloadB64 });
  }

  truncate(itemId: string, audioEndMs: number) {
    this.send({ type: 'conversation.item.truncate', item_id: itemId, content_index: 0, audio_end_ms: Math.max(0, Math.round(audioEndMs)) });
  }

  sendToolResult(callId: string, output: unknown, respond: boolean) {
    this.send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
    });
    if (respond) this.createResponse();
  }

  prompt(systemText: string) {
    this.send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: systemText }] },
    });
    this.createResponse();
  }

  respond() {
    this.createResponse();
  }

  cancelResponse() {
    this.responseQueued = false;
    if (this.responseActive) this.send({ type: 'response.cancel' });
  }

  on<E extends keyof VoiceAgentEvents>(event: E, listener: VoiceAgentEvents[E]) {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  close() {
    this.closedByUs = true;
    this.ws?.close();
  }
}
