import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallRecord } from '../../shared/types';
import { CallManager } from '../src/calls/callManager';
import { CallStore } from '../src/calls/store';
import type { CallAnalyzer, TranscriptAnalysis } from '../src/providers/analysis/types';
import type { MediaTransport, MediaTransportEvents, TelephonyProvider } from '../src/providers/telephony/types';
import type { VoiceAgent, VoiceAgentConfig, VoiceAgentEvents } from '../src/providers/voice/types';
import { dentistRequest } from './fixtures';

class FakeAgent implements VoiceAgent {
  readonly emitter = new EventEmitter();
  config: VoiceAgentConfig | null = null;
  audioIn = 0;
  toolResults: { callId: string; output: any; respond: boolean }[] = [];
  truncations: { itemId: string; ms: number }[] = [];
  prompts: string[] = [];
  closed = false;
  constructor(private readonly failConnect = false) {}
  async connect(config: VoiceAgentConfig) {
    if (this.failConnect) throw new Error('boom');
    this.config = config;
  }
  sendAudio() {
    this.audioIn++;
  }
  truncate(itemId: string, ms: number) {
    this.truncations.push({ itemId, ms });
  }
  sendToolResult(callId: string, output: unknown, respond: boolean) {
    this.toolResults.push({ callId, output, respond });
  }
  prompt(text: string) {
    this.prompts.push(text);
  }
  on<E extends keyof VoiceAgentEvents>(event: E, listener: VoiceAgentEvents[E]) {
    this.emitter.on(event, listener as any);
  }
  emit<E extends keyof VoiceAgentEvents>(event: E, ...args: Parameters<VoiceAgentEvents[E]>) {
    this.emitter.emit(event, ...args);
  }
  close() {
    this.closed = true;
  }
}

class FakeTransport implements MediaTransport {
  readonly emitter = new EventEmitter();
  sent: string[] = [];
  marks: string[] = [];
  clears = 0;
  sendAudio(p: string) {
    this.sent.push(p);
  }
  clearAudio() {
    this.clears++;
  }
  sendMark(name: string) {
    this.marks.push(name);
  }
  on<E extends keyof MediaTransportEvents>(event: E, listener: MediaTransportEvents[E]) {
    this.emitter.on(event, listener as any);
  }
  emit<E extends keyof MediaTransportEvents>(event: E, ...args: Parameters<MediaTransportEvents[E]>) {
    this.emitter.emit(event, ...args);
  }
  close() {}
}

class FakeTelephony implements TelephonyProvider {
  readonly name = 'fake';
  placed: unknown[] = [];
  hangups: string[] = [];
  async placeCall(p: unknown) {
    this.placed.push(p);
    return { providerCallId: 'CA123' };
  }
  async hangup(id: string) {
    this.hangups.push(id);
  }
}

const analysis: TranscriptAnalysis = {
  objective: 'schedule_dental_cleaning',
  objectiveAchieved: true,
  appointmentMentioned: { date: '2026-10-08', time: '15:30', notes: null },
  verbalCommitments: ['Cleaning on Thursday Oct 8 at 3:30 PM'],
  unresolvedQuestions: [],
  refusedRequests: [],
  followUpsForUser: ['Arrive 10 minutes early.'],
  possibleFabrications: [],
  summary: 'Dental cleaning scheduled for Thursday at 3:30 PM.',
  summaryInUserLanguage: '洗牙预约在周四下午3:30。',
};

const flush = () => new Promise((r) => setTimeout(r, 0));
const waitFor = async (pred: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

function setup(opts: { failConnect?: boolean; analyzer?: CallAnalyzer | null } = {}) {
  const store = new CallStore(null);
  const agent = new FakeAgent(opts.failConnect);
  const telephony = new FakeTelephony();
  const manager = new CallManager(
    store,
    () => ({
      telephony,
      createAgent: () => agent,
      analyzer: opts.analyzer === undefined ? { analyze: async () => analysis } : opts.analyzer,
      maxCallSeconds: 600,
      introDelayMs: 50,
      log: (callId, type, detail) => store.update(callId, (r) => r.events.push({ at: Date.now(), type, detail })),
    }),
    { allowedDestinations: null, maxCallsPerHour: 10, maxConcurrentCalls: 1 },
  );
  return { store, agent, telephony, manager };
}

describe('CallSession (simulated dentist call)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-06T17:00:00Z'), toFake: ['Date'], shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it('runs the full Phase 0 flow and returns a policy-backed result', async () => {
    const { store, agent, telephony, manager } = setup();
    const created = manager.startCall(dentistRequest());
    const get = (): CallRecord => store.get(created.id)!;

    await waitFor(() => telephony.placed.length === 1);
    expect(get().status).toBe('dialing');
    expect(agent.config?.instructions).toContain("Leo's AI language assistant");
    expect(agent.config?.tools.map((t) => t.name)).toEqual(['check_appointment_slot', 'request_decision', 'confirm_agreement', 'end_call']);

    manager.handleTelephonyState(created.id, 'answered');
    expect(get().status).toBe('connected');

    const transport = new FakeTransport();
    const token = (manager as any).sessions.get(created.id).streamToken as string;
    expect(manager.attachMedia(created.id, 'wrong-token-wrong-token-wrong-token-wrong-to', transport)).toBe(false);
    expect(manager.attachMedia(created.id, token, transport)).toBe(true);

    // Business answers.
    transport.emit('audio', 'AAAA', 20);
    expect(agent.audioIn).toBe(1);
    agent.emit('speechStarted');
    agent.emit('speechStopped');
    agent.emit('utteranceStarted', 'c1', 'counterpart');
    agent.emit('transcript', 'c1', 'counterpart', 'Smile Dental, how can I help?');
    expect(get().status).toBe('in_progress');

    // Assistant introduces itself.
    agent.emit('utteranceStarted', 'a1', 'assistant');
    agent.emit('audio', 'a1', 'AAAAAAAA');
    agent.emit('transcript', 'a1', 'assistant', "Hi, I'm Leo's AI language assistant.");
    agent.emit('responseDone');
    transport.emit('mark', 'a1');
    expect(transport.sent).toEqual(['AAAAAAAA']);
    expect(get().metrics.turnLatenciesMs).toHaveLength(1);

    // Tool calls go through the policy engine.
    agent.emit('toolCall', 't1', 'check_appointment_slot', '{"date":"2026-10-09","start_time":"15:00"}');
    expect(agent.toolResults.at(-1)).toMatchObject({ callId: 't1', respond: true, output: { allowed: false } });
    agent.emit('toolCall', 't2', 'request_decision', '{"category":"additional_cost","question":"Add an $80 X-ray?","amount_usd":80}');
    expect(agent.toolResults.at(-1)?.output.decision).toBe('requires_user_approval');
    agent.emit('toolCall', 't3', 'confirm_agreement', '{"type":"appointment","description":"Dental cleaning","date":"2026-10-08","start_time":"15:30"}');
    expect(agent.toolResults.at(-1)?.output.accepted).toBe(true);

    // Barge-in: business talks over the assistant.
    agent.emit('utteranceStarted', 'a2', 'assistant');
    agent.emit('audio', 'a2', 'AAAAAAAAAAAA');
    transport.emit('audio', 'AAAA', 140);
    agent.emit('speechStarted');
    expect(transport.clears).toBe(1);
    expect(agent.truncations).toHaveLength(1);
    expect(agent.truncations[0]!.itemId).toBe('a2');
    expect(get().transcript.find((t) => t.id === 'a2')?.interrupted).toBe(true);
    transport.emit('mark', 'a2'); // echoed mark for cleared audio is ignored
    agent.emit('transcript', 'a2', 'assistant', 'Thursday at 3:30 works for');

    // Goodbye, then end_call. Hangup waits for the response to finish and audio to play out.
    agent.emit('audio', 'a3', 'AAAA');
    agent.emit('toolCall', 't4', 'end_call', '{"outcome":"objective_completed","reason":"Booked"}');
    expect(agent.toolResults.at(-1)).toMatchObject({ callId: 't4', respond: false });
    agent.emit('responseDone');
    await new Promise((r) => setTimeout(r, 500));
    expect(telephony.hangups).toEqual([]); // a3 not played yet
    transport.emit('mark', 'a3');
    await waitFor(() => telephony.hangups.length === 1);

    manager.handleTelephonyState(created.id, 'completed');
    await waitFor(() => get().status === 'completed');

    const r = get();
    expect(agent.closed).toBe(true);
    expect(r.endReason).toBe('objective_completed');
    expect(r.result).toMatchObject({
      status: 'completed',
      success: true,
      objective: 'schedule_dental_cleaning',
      appointment: { date: '2026-10-08', time: '15:30' },
      additionalChargesAuthorized: false,
      policyWarnings: [],
    });
    expect(r.result!.unresolvedQuestions).toContain('Add an $80 X-ray?');
    expect(r.result!.refusedDecisions.map((d) => d.request)).toContain('Add an $80 X-ray?');
    expect(r.metrics.interruptions).toBe(1);
    expect(manager.activeCount).toBe(0);
  });

  it('nudges the assistant to introduce itself if nobody speaks', async () => {
    const { agent, telephony, manager } = setup();
    const created = manager.startCall(dentistRequest());
    await waitFor(() => telephony.placed.length === 1);
    const token = (manager as any).sessions.get(created.id).streamToken as string;
    manager.attachMedia(created.id, token, new FakeTransport());
    await waitFor(() => agent.prompts.length === 1);
  });

  it('reports no-answer as a failed call without analysis', async () => {
    const analyze = vi.fn();
    const { store, telephony, manager } = setup({ analyzer: { analyze } });
    const created = manager.startCall(dentistRequest());
    await waitFor(() => telephony.placed.length === 1);
    manager.handleTelephonyState(created.id, 'no_answer');
    await waitFor(() => store.get(created.id)!.status === 'failed');
    expect(store.get(created.id)!.result?.status).toBe('no_answer');
    expect(analyze).not.toHaveBeenCalled();
  });

  it('does not dial when the voice AI cannot connect', async () => {
    const { store, telephony, manager } = setup({ failConnect: true });
    const created = manager.startCall(dentistRequest());
    await waitFor(() => store.get(created.id)!.status === 'failed');
    await flush();
    expect(telephony.placed).toHaveLength(0);
    expect(store.get(created.id)!.failureReason).toContain('boom');
  });

  it('flags appointments that were mentioned but never validated', async () => {
    const { store, agent, telephony, manager } = setup();
    const created = manager.startCall(dentistRequest());
    await waitFor(() => telephony.placed.length === 1);
    const token = (manager as any).sessions.get(created.id).streamToken as string;
    const transport = new FakeTransport();
    manager.attachMedia(created.id, token, transport);
    agent.emit('utteranceStarted', 'a1', 'assistant');
    agent.emit('transcript', 'a1', 'assistant', 'Great, see you Thursday at 3:30.');
    transport.emit('stop');
    await waitFor(() => store.get(created.id)!.status === 'completed');
    const result = store.get(created.id)!.result!;
    expect(result.appointment).toBeNull();
    expect(result.policyWarnings.join(' ')).toMatch(/did not validate/);
  });

  it('enforces guardrails before dialing', () => {
    const { manager } = setup();
    expect(() => manager.startCall(dentistRequest({ to: '911' }))).toThrow(/valid phone number/);
    expect(() =>
      manager.startCall(dentistRequest({ authorizedInfo: [{ label: 'SSN', value: '123-45-6789' }] })),
    ).toThrow(/sensitive/);
    manager.startCall(dentistRequest());
    expect(() => manager.startCall(dentistRequest())).toThrow(/already in progress/);
  });
});
