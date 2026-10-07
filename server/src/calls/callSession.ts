import { randomBytes, randomUUID } from 'node:crypto';
import type { CallRecord, CallResult, CallStatus, Speaker } from '../../../shared/types';
import { buildInstructions, INTRO_NUDGE } from '../agent/prompt';
import { executeTool, TOOL_DEFINITIONS } from '../agent/tools';
import { PolicyEngine } from '../policy/policyEngine';
import type { CallAnalyzer, TranscriptAnalysis } from '../providers/analysis/types';
import type { MediaTransport, TelephonyCallState, TelephonyProvider } from '../providers/telephony/types';
import type { VoiceAgent } from '../providers/voice/types';
import { localToday } from '../util/time';
import type { CallStore } from './store';

export interface CallSessionDeps {
  store: CallStore;
  telephony: TelephonyProvider;
  createAgent: () => VoiceAgent;
  analyzer: CallAnalyzer | null;
  maxCallSeconds: number;
  introDelayMs: number;
  log: (callId: string, type: string, detail?: string) => void;
  /** Called exactly once, when the session is fully finished. */
  onFinished: (callId: string) => void;
}

const TERMINAL_FAILURES: Partial<Record<TelephonyCallState, CallResult['status']>> = {
  busy: 'busy',
  no_answer: 'no_answer',
  failed: 'failed',
  canceled: 'canceled',
};

/** μ-law at 8 kHz: one byte per sample → 8 bytes per millisecond. */
const ULAW_BYTES_PER_MS = 8;
const b64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/**
 * Orchestrates one phone call: telephony ↔ voice agent audio bridge, barge-in, tool calls into
 * the policy engine, hangup, and post-call result assembly.
 */
export class CallSession {
  readonly streamToken = randomBytes(24).toString('hex');
  private readonly policy: PolicyEngine;
  private agent: VoiceAgent | null = null;
  private transport: MediaTransport | null = null;

  // Playback tracking for barge-in. Times are on the media stream's clock.
  private latestMediaTs = 0;
  private currentItemId: string | null = null;
  private currentItemStartTs = 0;
  private currentItemSentMs = 0;
  /** Outbound audio chunks sent but not yet played, per assistant item (Twilio echoes marks). */
  private readonly unplayed = new Map<string, number>();

  private answered = false;
  private counterpartSpoke = false;
  private speechStoppedAt: number | null = null;
  private hangupRequested = false;
  private lastTelephonyState: TelephonyCallState | null = null;
  private awaitingResponseDone = false;
  private hungUp = false;
  private finalizing = false;
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    readonly id: string,
    private readonly deps: CallSessionDeps,
  ) {
    const r = this.record;
    this.policy = new PolicyEngine(r.request, localToday(r.request.timezone).date);
  }

  private get record(): CallRecord {
    const r = this.deps.store.get(this.id);
    if (!r) throw new Error(`Call ${this.id} not found`);
    return r;
  }

  private update(mutate: (r: CallRecord) => void) {
    this.deps.store.update(this.id, mutate);
  }

  private log(type: string, detail?: string) {
    this.deps.log(this.id, type, detail);
  }

  private setStatus(status: CallStatus) {
    if (this.record.status === status) return;
    this.update((r) => (r.status = status));
    this.log('call.status', status);
  }

  private timer(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  private clearTimer(t: NodeJS.Timeout | undefined) {
    if (!t) return;
    clearTimeout(t);
    this.timers.delete(t);
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  async start() {
    try {
      this.setStatus('preparing');
      const r = this.record;
      const instructions = buildInstructions(r.request, { today: localToday(r.request.timezone) });

      // Connect the voice model before dialing so it is ready the instant the call is answered.
      const agent = this.deps.createAgent();
      this.agent = agent;
      this.wireAgent(agent);
      const t0 = Date.now();
      await agent.connect({ instructions, tools: TOOL_DEFINITIONS });
      this.log('ai.connected', `${Date.now() - t0}ms`);
      if (this.finalizing) return;

      this.setStatus('dialing');
      const { providerCallId } = await this.deps.telephony.placeCall({
        callId: this.id,
        to: r.request.to,
        streamToken: this.streamToken,
        maxDurationSeconds: this.deps.maxCallSeconds,
      });
      this.update((rec) => {
        rec.providerCallId = providerCallId;
        rec.metrics.dialedAt = Date.now();
      });
      this.log('telephony.call_created', providerCallId);
      this.pollCallState(providerCallId);

      // Hard stop in case every other signal is lost (ring time + talk time + margin).
      this.timer((this.deps.maxCallSeconds + 90) * 1000, () => {
        this.log('call.timeout', 'maximum duration reached');
        this.endWith('max_duration_reached');
      });
    } catch (err) {
      this.fail(`Could not start call: ${(err as Error).message}`);
    }
  }

  /**
   * Safety net next to status callbacks: some accounts (e.g. Twilio's Limited trial) don't allow
   * them, and webhooks can be lost. Polls until the call ends.
   */
  private pollCallState(providerCallId: string) {
    const getState = this.deps.telephony.getCallState?.bind(this.deps.telephony);
    if (!getState) return;
    const tick = () => {
      if (this.finalizing) return;
      getState(providerCallId)
        .then((state) => state && this.handleTelephonyState(state))
        .catch(() => {})
        .finally(() => !this.finalizing && this.timer(4_000, tick));
    };
    this.timer(4_000, tick);
  }

  handleTelephonyState(state: TelephonyCallState) {
    if (state === this.lastTelephonyState) return;
    this.lastTelephonyState = state;
    this.log('telephony.status', state);
    if (state === 'answered' && !this.answered) {
      this.answered = true;
      this.update((r) => (r.metrics.answeredAt = Date.now()));
      this.setStatus('connected');
    } else if (state === 'completed') {
      this.update((r) => (r.endReason ??= 'remote_hangup'));
      void this.finalize();
    } else if (TERMINAL_FAILURES[state]) {
      if (this.answered) {
        void this.finalize();
      } else {
        void this.finalize(TERMINAL_FAILURES[state]);
      }
    }
  }

  attachMedia(transport: MediaTransport) {
    if (this.finalizing) {
      transport.close();
      return;
    }
    this.transport = transport;
    this.log('media.started');
    if (!this.answered) {
      this.answered = true;
      this.update((r) => (r.metrics.answeredAt ??= Date.now()));
      this.setStatus('connected');
    }

    transport.on('audio', (payload, ts) => {
      this.latestMediaTs = ts;
      this.agent?.sendAudio(payload);
    });
    transport.on('mark', (itemId) => {
      const left = (this.unplayed.get(itemId) ?? 0) - 1;
      if (left > 0) this.unplayed.set(itemId, left);
      else this.unplayed.delete(itemId);
      this.maybeHangup();
    });
    transport.on('stop', () => {
      if (this.finalizing) return;
      this.log('media.stopped');
      this.update((r) => (r.endReason ??= 'remote_hangup'));
      void this.finalize();
    });

    // Most people answer with "Hello?" — let them speak first; introduce ourselves if they don't.
    this.timer(this.deps.introDelayMs, () => {
      if (!this.counterpartSpoke && !this.finalizing) {
        this.log('ai.intro_nudge');
        this.agent?.prompt(INTRO_NUDGE);
      }
    });
  }

  // ───────────────────────────── voice agent ─────────────────────────────

  private wireAgent(agent: VoiceAgent) {
    agent.on('audio', (itemId, payload) => {
      if (!this.transport || this.finalizing) return;
      if (itemId !== this.currentItemId) {
        this.currentItemId = itemId;
        this.currentItemStartTs = this.latestMediaTs;
        this.currentItemSentMs = 0;
        const now = Date.now();
        if (this.speechStoppedAt) {
          const latency = now - this.speechStoppedAt;
          this.update((r) => r.metrics.turnLatenciesMs.push(latency));
          this.speechStoppedAt = null;
        }
        if (!this.record.metrics.firstAssistantAudioAt) {
          this.update((r) => (r.metrics.firstAssistantAudioAt = now));
          this.setStatus('in_progress');
        }
      }
      this.transport.sendAudio(payload);
      this.currentItemSentMs += b64Bytes(payload) / ULAW_BYTES_PER_MS;
      this.transport.sendMark(itemId);
      this.unplayed.set(itemId, (this.unplayed.get(itemId) ?? 0) + 1);
    });

    agent.on('speechStarted', () => {
      this.counterpartSpoke = true;
      if (this.record.status === 'connected') this.setStatus('in_progress');
      // Barge-in: the other party talked over us. Stop playback and tell the model what was heard.
      if (this.currentItemId && this.unplayed.has(this.currentItemId)) {
        const heardMs = Math.min(Math.max(0, this.latestMediaTs - this.currentItemStartTs), this.currentItemSentMs);
        agent.truncate(this.currentItemId, heardMs);
        this.transport?.clearAudio();
        const interruptedId = this.currentItemId;
        this.update((r) => {
          r.metrics.interruptions++;
          const entry = r.transcript.find((t) => t.id === interruptedId);
          if (entry) entry.interrupted = true;
        });
        this.log('ai.interrupted', `${Math.round(heardMs)}ms heard`);
        // Twilio echoes marks for cleared audio; forgetting the items makes those echoes no-ops.
        this.unplayed.clear();
        this.currentItemId = null;
      }
    });

    agent.on('speechStopped', () => {
      this.speechStoppedAt = Date.now();
    });

    agent.on('utteranceStarted', (itemId, speaker) => this.upsertTranscript(itemId, speaker, '', true));

    agent.on('transcript', (itemId, speaker, text) => {
      const clean = text.trim();
      if (!clean) {
        this.update((r) => (r.transcript = r.transcript.filter((t) => t.id !== itemId)));
        return;
      }
      this.upsertTranscript(itemId, speaker, clean, false);
    });

    agent.on('toolCall', (callId, name, args) => this.handleToolCall(callId, name, args));

    agent.on('responseDone', () => {
      this.awaitingResponseDone = false;
      this.maybeHangup();
    });

    agent.on('failure', (message, fatal) => {
      this.log(fatal ? 'ai.fatal_error' : 'ai.error', message);
      if (fatal && !this.finalizing) {
        this.update((r) => (r.failureReason = `Voice AI connection failed: ${message}`));
        this.endWith('ai_connection_lost');
      }
    });
  }

  private upsertTranscript(itemId: string, speaker: Speaker, text: string, pending: boolean) {
    this.update((r) => {
      const existing = r.transcript.find((t) => t.id === itemId);
      if (existing) {
        if (text) existing.text = text;
        existing.pending = pending;
      } else {
        r.transcript.push({ id: itemId, speaker, text, at: Date.now(), pending });
      }
    });
  }

  private handleToolCall(callId: string, name: string, args: string) {
    const exec = executeTool(name, args, this.policy);
    this.log('ai.tool_call', `${name} ${args}`);
    this.log('policy.result', `${name} → ${JSON.stringify(exec.output)}`);
    this.update((r) => {
      r.metrics.toolCalls++;
      if (exec.decision) r.decisions.push(exec.decision);
      if (exec.commitment) r.commitments.push(exec.commitment);
      if (exec.unresolvedQuestion && !r.unresolvedQuestions.includes(exec.unresolvedQuestion)) {
        r.unresolvedQuestions.push(exec.unresolvedQuestion);
      }
    });

    if (exec.endCall) {
      this.agent?.sendToolResult(callId, exec.output, false);
      this.update((r) => (r.endReason = exec.endCall!.outcome));
      this.log('ai.end_call', `${exec.endCall.outcome}: ${exec.endCall.reason}`);
      this.hangupRequested = true;
      this.awaitingResponseDone = true;
      // Fallback in case playback marks never arrive.
      this.timer(12_000, () => this.hangup());
      this.maybeHangup();
    } else {
      this.agent?.sendToolResult(callId, exec.output, true);
    }
  }

  /** Hang up once the goodbye has finished playing to the other party. */
  private maybeHangup() {
    if (!this.hangupRequested || this.awaitingResponseDone || this.unplayed.size > 0) return;
    this.timer(400, () => this.hangup());
  }

  private hangup() {
    if (this.hungUp) return;
    this.hungUp = true;
    const sid = this.record.providerCallId;
    this.log('telephony.hangup');
    if (sid) {
      this.deps.telephony.hangup(sid).catch((err) => this.log('telephony.hangup_error', (err as Error).message));
    }
    // If the provider never confirms, finish anyway.
    this.timer(5_000, () => void this.finalize());
  }

  private endWith(reason: string) {
    this.update((r) => (r.endReason ??= reason));
    this.hangup();
  }

  private fail(reason: string) {
    this.log('call.failed', reason);
    this.update((r) => (r.failureReason ??= reason));
    if (this.record.providerCallId) this.hangup();
    void this.finalize('failed');
  }

  // ───────────────────────────── wrap-up ─────────────────────────────

  /**
   * @param failure set when the call never connected (busy, no answer, provider/AI failure).
   */
  async finalize(failure?: CallResult['status']) {
    if (this.finalizing) return;
    this.finalizing = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.update((r) => (r.metrics.endedAt = Date.now()));
    this.log('call.ended', this.record.endReason ?? failure);

    try {
      if (failure && !this.answered) {
        this.closeConnections();
        const reason = this.record.failureReason ?? FAILURE_TEXT[failure] ?? 'The call could not be completed.';
        this.update((r) => {
          r.failureReason = reason;
          r.result = emptyResult(failure, reason);
          r.status = 'failed';
        });
        return;
      }

      this.setStatus('analyzing');
      await this.waitForPendingTranscripts(3_000);
      this.closeConnections();

      let analysis: TranscriptAnalysis | null = null;
      let analysisError: string | null = null;
      if (this.deps.analyzer) {
        try {
          const r = this.record;
          analysis = await this.deps.analyzer.analyze({
            request: r.request,
            transcript: r.transcript,
            decisions: r.decisions,
            commitments: r.commitments,
            endReason: r.endReason,
          });
          this.log('analysis.done');
        } catch (err) {
          analysisError = (err as Error).message;
          this.log('analysis.error', analysisError);
        }
      }
      this.update((r) => {
        r.result = buildResult(r, analysis, analysisError);
        r.status = r.failureReason && r.transcript.length === 0 ? 'failed' : 'completed';
      });
    } finally {
      this.log('call.finished', this.record.status);
      await this.deps.store.persist(this.id).catch((err) => this.log('store.persist_error', (err as Error).message));
      this.deps.onFinished(this.id);
    }
  }

  private closeConnections() {
    this.agent?.close();
    this.transport?.close();
  }

  private async waitForPendingTranscripts(timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && this.record.transcript.some((t) => t.pending)) {
      await new Promise((r) => setTimeout(r, 100));
    }
    this.update((r) => {
      r.transcript = r.transcript.filter((t) => !(t.pending && !t.text));
      r.transcript.forEach((t) => (t.pending = false));
    });
  }
}

const FAILURE_TEXT: Partial<Record<CallResult['status'], string>> = {
  busy: 'The line was busy.',
  no_answer: 'Nobody answered the call.',
  canceled: 'The call was canceled before it connected.',
  failed: 'The call could not be connected.',
};

function emptyResult(status: CallResult['status'], reason: string): CallResult {
  return {
    status,
    success: false,
    objective: 'call_not_connected',
    appointment: null,
    commitments: [],
    additionalChargesAuthorized: false,
    unresolvedQuestions: [],
    refusedDecisions: [],
    followUpsForUser: ['Try the call again later.'],
    summary: reason,
    summaryInUserLanguage: reason,
    policyWarnings: [],
  };
}

const dedupe = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Merge the model's transcript analysis with the backend ledger. Backend facts win: an
 * appointment only counts if the policy engine validated it; anything else that was said is
 * surfaced as a warning for the user to verify.
 */
export function buildResult(r: CallRecord, analysis: TranscriptAnalysis | null, analysisError: string | null): CallResult {
  const appt = r.commitments.find((c) => c.type === 'appointment');
  const warnings: string[] = [];

  if (analysisError) warnings.push(`Automatic transcript analysis failed (${analysisError}); result is based on the policy ledger only.`);
  if (analysis) {
    const m = analysis.appointmentMentioned;
    if (m?.date && (!appt || appt.date !== m.date || (m.time && appt.startTime !== m.time))) {
      warnings.push(
        `The conversation mentions an appointment on ${m.date}${m.time ? ` at ${m.time}` : ''} that the policy layer did not validate. Please confirm it directly with the business.`,
      );
    }
    if (r.commitments.length === 0 && analysis.verbalCommitments.length > 0) {
      warnings.push(`The assistant may have agreed to something without validation: ${analysis.verbalCommitments.join('; ')}`);
    }
    for (const f of analysis.possibleFabrications) warnings.push(`Possibly unsupported statement by the assistant: ${f}`);
  }

  const refused = [
    ...r.decisions
      .filter((d) => ['never_authorized', 'requires_user_approval'].includes(d.outcome) || (d.tool === 'confirm_agreement' && d.outcome === 'rejected'))
      .map((d) => ({ request: d.request, reason: d.reason, source: 'policy' as const })),
    ...(analysis?.refusedRequests ?? []).map((x) => ({ ...x, source: 'transcript' as const })),
  ];

  const additionalChargesAuthorized =
    r.commitments.some((c) => (c.costUsd ?? 0) > 0) ||
    r.decisions.some((d) => d.tool === 'request_decision' && d.category === 'additional_cost' && d.outcome === 'authorized');

  const status: CallResult['status'] = r.endReason === 'voicemail' ? 'voicemail' : 'completed';
  const fallbackSummary = appt
    ? `Appointment confirmed for ${appt.date} at ${appt.startTime} (${appt.description}).`
    : r.commitments[0]
      ? `Confirmed: ${r.commitments[0].description}.`
      : 'No commitment was confirmed during the call.';

  return {
    status,
    success: status !== 'voicemail' && (analysis ? analysis.objectiveAchieved : r.commitments.length > 0),
    objective: analysis?.objective ?? 'unknown',
    appointment: appt ? { date: appt.date!, time: appt.startTime!, notes: appt.description } : null,
    commitments: r.commitments,
    additionalChargesAuthorized,
    unresolvedQuestions: dedupe([...r.unresolvedQuestions, ...(analysis?.unresolvedQuestions ?? [])]),
    refusedDecisions: refused,
    followUpsForUser: analysis?.followUpsForUser ?? [],
    summary: analysis?.summary ?? fallbackSummary,
    summaryInUserLanguage: analysis?.summaryInUserLanguage ?? fallbackSummary,
    policyWarnings: warnings,
  };
}

export function newCallRecord(id: string, request: CallRecord['request']): CallRecord {
  const now = Date.now();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    status: 'preparing',
    request,
    transcript: [],
    decisions: [],
    commitments: [],
    unresolvedQuestions: [],
    metrics: { turnLatenciesMs: [], interruptions: 0, toolCalls: 0 },
    events: [],
  };
}

export const newCallId = () => randomUUID();
