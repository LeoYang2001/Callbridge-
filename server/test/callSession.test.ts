import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallRecord, UserQuestion } from '../../shared/types';
import { CallManager, type CallManagerOptions } from '../src/calls/callManager';
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
  responses = 0;
  cancels = 0;
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
  forgotten: string[] = [];
  forget(itemId: string) {
    this.forgotten.push(itemId);
  }
  sendToolResult(callId: string, output: unknown, respond: boolean) {
    this.toolResults.push({ callId, output, respond });
  }
  prompt(text: string) {
    this.prompts.push(text);
  }
  respond() {
    this.responses++;
  }
  cancelResponse() {
    this.cancels++;
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
  userLegs: { to: string; streamToken: string }[] = [];
  async placeUserLeg(p: { to: string; streamToken: string }) {
    this.userLegs.push(p);
    return { providerCallId: 'CAUSER' };
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
  counterpartAgreedToAppointment: true,
  notesAboutCounterpart: ['Asks patients to arrive 10 minutes early.'],
  headlineInUserLanguage: '已预约：周四 10月8日 下午3:30 洗牙',
  nextStepsInUserLanguage: ['提前10分钟到。'],
};

const flush = () => new Promise((r) => setTimeout(r, 0));

/** 20 ms phone frames: loud speech (μ-law 0x00) or silence (0xFF). */
const LOUD = Buffer.alloc(160, 0x00).toString('base64');
const SILENT = Buffer.alloc(160, 0xff).toString('base64');
function frames(transport: FakeTransport, fromTs: number, count: number, payload = LOUD) {
  for (let i = 1; i <= count; i++) transport.emit('audio', payload, fromTs + i * 20);
  return fromTs + count * 20;
}
const waitFor = async (pred: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

const translator = { translate: async (text: string, to: string) => `[${to}] ${text}` };

function setup(opts: { failConnect?: boolean; analyzer?: CallAnalyzer | null; holdTimeoutMs?: number; holdCheckInMs?: number; onUserQuestion?: CallManagerOptions['onUserQuestion']; recordingsDir?: string } = {}) {
  const store = new CallStore(null);
  const agent = new FakeAgent(opts.failConnect);
  const telephony = new FakeTelephony();
  const manager = new CallManager(
    store,
    () => ({
      telephony,
      createAgent: () => agent,
      translator,
      analyzer: opts.analyzer === undefined ? { analyze: async () => analysis } : opts.analyzer,
      maxCallSeconds: 600,
      introDelayMs: 50,
      holdTimeoutMs: opts.holdTimeoutMs,
      holdCheckInMs: opts.holdCheckInMs,
      recordingsDir: opts.recordingsDir,
      log: (callId, type, detail) => store.update(callId, (r) => r.events.push({ at: Date.now(), type, detail })),
    }),
    { allowedDestinations: null, maxCallsPerHour: 10, maxConcurrentCalls: 1, onUserQuestion: opts.onUserQuestion },
  );
  return { store, agent, telephony, manager };
}

describe('recording', () => {
  it('saves the call as heard, with each line placed on the recording', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'cb-rec-'));
    try {
      const { store, agent, telephony, manager } = setup({ recordingsDir: dir });
      const created = manager.startCall({ ...dentistRequest(), record: true });
      await waitFor(() => telephony.placed.length === 1);
      manager.handleTelephonyState(created.id, 'answered');
      const transport = new FakeTransport();
      manager.attachMedia(created.id, (manager as any).sessions.get(created.id).streamToken, transport);
      // They speak for 1 s from 0.5 s; the assistant answers at 2 s for 0.5 s (sent all at once).
      agent.emit('speechStarted');
      let ts = frames(transport, 0, 25, 'AAAA');
      agent.emit('speechStopped');
      agent.emit('utteranceStarted', 'c1', 'counterpart');
      agent.emit('transcript', 'c1', 'counterpart', 'Smile Dental, how can I help?');
      ts = frames(transport, ts, 50, 'AAAA');
      agent.emit('utteranceStarted', 'a1', 'assistant');
      for (let i = 0; i < 25; i++) agent.emit('audio', 'a1', Buffer.alloc(160, 0).toString('base64'));
      agent.emit('transcript', 'a1', 'assistant', "Hi, I'm Leo's assistant.");
      agent.emit('responseDone');
      manager.handleTelephonyState(created.id, 'completed');
      await waitFor(() => store.get(created.id)!.status === 'completed');
      const r = store.get(created.id)!;
      expect(r.recording?.durationMs).toBe(2000);
      expect(r.transcript.find((t) => t.id === 'a1')?.audioMs).toBe(1500);
      expect(r.transcript.find((t) => t.id === 'c1')?.audioMs).toBe(0);
      const wav = await readFile(path.join(dir, `${created.id}.wav`));
      expect(wav.readUInt32LE(40)).toBe(2000 * 8 * 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("doesn't record when the user turned it off", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'cb-rec-'));
    try {
      const { store, telephony, manager } = setup({ recordingsDir: dir });
      const created = manager.startCall({ ...dentistRequest(), record: false });
      await waitFor(() => telephony.placed.length === 1);
      manager.handleTelephonyState(created.id, 'answered');
      const transport = new FakeTransport();
      manager.attachMedia(created.id, (manager as any).sessions.get(created.id).streamToken, transport);
      frames(transport, 0, 100);
      manager.handleTelephonyState(created.id, 'completed');
      await waitFor(() => ['completed', 'failed'].includes(store.get(created.id)!.status));
      expect(store.get(created.id)!.recording).toBeUndefined();
      expect(await readdir(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('ending the call', () => {
  it("adds a goodbye when the assistant hangs up without one, and waits for it to play", async () => {
    const { agent, telephony, manager } = setup();
    const created = manager.startCall(dentistRequest());
    await waitFor(() => telephony.placed.length === 1);
    manager.handleTelephonyState(created.id, 'answered');
    const line = new FakeTransport();
    manager.attachMedia(created.id, (manager as any).sessions.get(created.id).streamToken, line);
    agent.emit('utteranceStarted', 'a1', 'assistant');
    agent.emit('audio', 'a1', 'AAAA');
    agent.emit('transcript', 'a1', 'assistant', "Got it, I'll pass that along and then we can wrap up.");
    agent.emit('toolCall', 't1', 'end_call', '{"outcome":"objective_completed","reason":"Done"}');
    // Asked for a goodbye turn instead of hanging up on them.
    expect(agent.toolResults.at(-1)).toMatchObject({ callId: 't1', respond: true, output: { instructions: expect.stringMatching(/goodbye/) } });
    agent.emit('responseDone'); // the turn that ended the call
    line.emit('mark', 'a1');
    await new Promise((r) => setTimeout(r, 600));
    expect(telephony.hangups).toEqual([]);
    // The goodbye plays, then the call ends.
    agent.emit('utteranceStarted', 'a2', 'assistant');
    agent.emit('audio', 'a2', 'AAAA');
    agent.emit('transcript', 'a2', 'assistant', 'Thanks, Leo. Talk soon, bye!');
    agent.emit('responseDone');
    await new Promise((r) => setTimeout(r, 600));
    expect(telephony.hangups).toEqual([]); // not played yet
    line.emit('mark', 'a2');
    await waitFor(() => telephony.hangups.length === 1);
  });

  it('recognizes goodbyes in the common call languages', async () => {
    const { saidGoodbye } = await import('../src/calls/callSession');
    for (const said of ['Thanks, goodbye!', 'Have a great day.', '好的，谢谢，再见！', 'Gracias, adiós.', 'Cảm ơn, tạm biệt.', 'では、失礼します。']) expect(saidGoodbye(said), said).toBe(true);
    for (const said of ["Got it, I'll pass that along and then we can wrap up.", 'Is Thursday okay?']) expect(saidGoodbye(said), said).toBe(false);
  });
});

describe('take-over', () => {
  it('rings the user in, relays both ways while the assistant is quiet, and hands back with what was said', async () => {
    const { store, agent, telephony, manager } = setup();
    const created = manager.startCall(dentistRequest());
    await waitFor(() => telephony.placed.length === 1);
    manager.handleTelephonyState(created.id, 'answered');
    const line = new FakeTransport();
    manager.attachMedia(created.id, (manager as any).sessions.get(created.id).streamToken, line);
    const get = () => store.get(created.id)!;

    // Ring the user: the assistant says they're joining, then waits.
    expect(await manager.takeOver(created.id, '+19015550100')).toBeNull();
    expect(telephony.userLegs[0]?.to).toBe('+19015550100');
    expect(get().takeover?.state).toBe('ringing');
    expect(agent.prompts.at(-1)).toMatch(/joining this call themselves/);
    const responses = agent.responses;

    // A wrong token can't join; the right one does.
    const phone = new FakeTransport();
    expect(manager.attachUserMedia(created.id, 'nope'.padEnd(48, 'x'), phone)).toBe(false);
    expect(manager.attachUserMedia(created.id, telephony.userLegs[0]!.streamToken, phone)).toBe(true);
    expect(get().takeover?.state).toBe('live');
    expect(line.clears).toBeGreaterThan(0); // the assistant was cut off

    // Their audio reaches the user, the user's reaches them; the assistant doesn't answer.
    line.emit('audio', 'THEM', 20);
    phone.emit('audio', 'USER', 0);
    expect(phone.sent).toContain('THEM');
    expect(line.sent).toContain('USER');
    agent.emit('speechStarted');
    frames(line, 20, 20);
    agent.emit('speechStopped');
    agent.emit('utteranceStarted', 'c9', 'counterpart');
    agent.emit('transcript', 'c9', 'counterpart', 'Sure, Thursday at 3 works.');
    expect(agent.responses).toBe(responses);

    // Handing back: the user's leg is hung up, and the assistant hears what they said.
    expect(manager.handBack(created.id)).toBe(true);
    expect(get().takeover).toBeUndefined();
    expect(telephony.hangups).toContain('CAUSER');
    expect(agent.prompts.at(-1)).toMatch(/handed the call back[\s\S]*Sure, Thursday at 3 works\./);
    expect(get().transcript.filter((t) => t.event).map((t) => t.text)).toEqual(['Leo joined the call.', 'Leo handed the call back.']);
  });

  it('joins from the app with a one-time code, then relays like the phone bridge', async () => {
    const { store, agent, telephony, manager } = setup();
    const created = manager.startCall(dentistRequest());
    await waitFor(() => telephony.placed.length === 1);
    manager.handleTelephonyState(created.id, 'answered');
    const line = new FakeTransport();
    manager.attachMedia(created.id, (manager as any).sessions.get(created.id).streamToken, line);

    // A join cancelled before the app connects is never mentioned to them.
    const prompts = agent.prompts.length;
    manager.startAppJoin(created.id);
    manager.handBack(created.id);
    expect(agent.prompts.length).toBe(prompts);

    const started = manager.startAppJoin(created.id);
    expect('code' in started).toBe(true);
    const code = (started as { code: string }).code;
    expect(store.get(created.id)!.takeover?.state).toBe('ringing');
    expect(agent.prompts.length).toBe(prompts); // not announced on tap
    expect(telephony.userLegs).toEqual([]); // no phone rung

    // The webhook only connects the app's leg with the right code, and only once.
    expect(manager.appJoinStream(created.id, 'x'.repeat(code.length), 'CAAPP')).toBeNull();
    const token = manager.appJoinStream(created.id, code, 'CAAPP');
    expect(token).toBeTruthy();
    expect(agent.prompts.at(-1)).toMatch(/joining this call themselves/); // announced once it's real
    expect(manager.appJoinStream(created.id, code, 'CAAPP')).toBeNull();

    const app = new FakeTransport();
    expect(manager.attachUserMedia(created.id, token!, app)).toBe(true);
    app.emit('audio', 'USER', 0);
    expect(line.sent).toContain('USER');
    // Handing back hangs up the app's leg.
    manager.handBack(created.id);
    expect(telephony.hangups).toContain('CAAPP');
  });

  it("lets the assistant carry on when the user doesn't pick up", async () => {
    const { store, agent, telephony, manager } = setup();
    const created = manager.startCall(dentistRequest());
    await waitFor(() => telephony.placed.length === 1);
    manager.handleTelephonyState(created.id, 'answered');
    manager.attachMedia(created.id, (manager as any).sessions.get(created.id).streamToken, new FakeTransport());
    await manager.takeOver(created.id, '+19015550100');
    manager.handleUserLegState(created.id, 'no_answer');
    expect(store.get(created.id)!.takeover).toBeUndefined();
    // Not paused any more: a turn gets an answer again.
    const before = agent.responses;
    (manager as any).sessions.get(created.id).respond();
    expect(agent.responses).toBe(before + 1);
  });
});

describe('personal calls', () => {
  it("don't offer the appointment-slot check (the time in the message is the user's own)", async () => {
    const { agent, telephony, manager } = setup();
    manager.startCall(dentistRequest({ category: 'personal_call', counterpartName: 'Tabito' }));
    await waitFor(() => telephony.placed.length === 1);
    expect(agent.config?.tools.map((t) => t.name)).toEqual(['request_decision', 'confirm_agreement', 'end_call']);
  });
});

describe('live captions', () => {
  it('shows an assistant line a sentence at a time as its audio plays', async () => {
    const { store, agent, telephony, manager } = setup();
    const created = manager.startCall(dentistRequest());
    await waitFor(() => telephony.placed.length === 1);
    manager.handleTelephonyState(created.id, 'answered');
    const transport = new FakeTransport();
    const token = (manager as any).sessions.get(created.id).streamToken as string;
    manager.attachMedia(created.id, token, transport);
    const live = () => manager.liveView(store.get(created.id)!).transcript.find((t) => t.id === 'a1')?.text;

    const text = 'Hi, this is an assistant. I am calling about a cleaning. Is Thursday open?';
    agent.emit('utteranceStarted', 'a1', 'assistant');
    for (let i = 0; i < 4; i++) agent.emit('audio', 'a1', 'AAAAAAAA'); // four equal chunks
    agent.emit('transcript', 'a1', 'assistant', text);

    // Written in full, but nothing played yet: only the first sentence.
    expect(store.get(created.id)!.transcript.find((t) => t.id === 'a1')?.text).toBe(text);
    expect(live()).toBe('Hi, this is an assistant.');
    transport.emit('mark', 'a1');
    transport.emit('mark', 'a1'); // half played
    expect(live()).toBe('Hi, this is an assistant. I am calling about a cleaning.');
    transport.emit('mark', 'a1');
    transport.emit('mark', 'a1'); // all played
    expect(live()).toBe(text);
  });
});

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
    // Mid-call, an unauthorized charge goes to the user instead of being refused outright.
    expect(agent.toolResults.at(-1)?.output.decision).toBe('waiting_for_user');
    expect(get().questions).toMatchObject([{ category: 'additional_cost', amountUsd: 80, status: 'pending' }]);
    agent.emit('toolCall', 't3', 'confirm_agreement', '{"type":"appointment","description":"Dental cleaning","date":"2026-10-08","start_time":"15:30"}');
    expect(agent.toolResults.at(-1)?.output.accepted).toBe(true);

    // Barge-in: business talks over the assistant with sustained speech.
    agent.emit('utteranceStarted', 'a2', 'assistant');
    agent.emit('audio', 'a2', 'AAAAAAAAAAAA');
    agent.emit('speechStarted');
    frames(transport, 140, 30);
    await waitFor(() => transport.clears === 1);
    expect(agent.cancels).toBe(1);
    expect(agent.truncations).toHaveLength(1);
    expect(agent.truncations[0]!.itemId).toBe('a2');
    expect(get().transcript.find((t) => t.id === 'a2')?.interrupted).toBe(true);
    transport.emit('mark', 'a2'); // echoed mark for cleared audio is ignored
    agent.emit('audio', 'a2', 'AAAA'); // late audio from the cancelled response is dropped
    expect(transport.sent.at(-1)).toBe('AAAAAAAAAAAA');
    agent.emit('transcript', 'a2', 'assistant', 'Thursday at 3:30 works for');
    const before = agent.responses;
    agent.emit('speechStopped');
    expect(agent.responses).toBe(before + 1);

    // Goodbye, then end_call. Hangup waits for the response to finish and audio to play out.
    agent.emit('utteranceStarted', 'a3', 'assistant');
    agent.emit('audio', 'a3', 'AAAA');
    agent.emit('transcript', 'a3', 'assistant', 'Thanks so much, see you Thursday. Goodbye!');
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

  describe('turn-taking on a noisy line', () => {
    async function connected() {
      const ctx = setup();
      const created = ctx.manager.startCall(dentistRequest());
      await waitFor(() => ctx.telephony.placed.length === 1);
      const transport = new FakeTransport();
      const token = (ctx.manager as any).sessions.get(created.id).streamToken as string;
      ctx.manager.attachMedia(created.id, token, transport);
      ctx.agent.emit('speechStarted'); // "Hello?" so the intro nudge stays out of the way
      let ts = frames(transport, 0, 20);
      ctx.agent.emit('speechStopped');
      const responses = ctx.agent.responses;
      // The assistant starts talking.
      ctx.agent.emit('utteranceStarted', 'a1', 'assistant');
      ctx.agent.emit('audio', 'a1', 'AAAA');
      const get = () => ctx.store.get(created.id)!;
      return { ...ctx, transport, get, responses, at: () => ts, advance: (n: number, p?: string) => (ts = frames(transport, ts, n, p)) };
    }

    it('keeps talking through "mm-hm" and short noises', async () => {
      const c = await connected();
      c.agent.emit('speechStarted');
      c.advance(8); // 160 ms of sound
      c.advance(20, SILENT);
      await new Promise((r) => setTimeout(r, 150));
      c.agent.emit('speechStopped');
      c.agent.emit('utteranceStarted', 'c2', 'counterpart');
      c.agent.emit('transcript', 'c2', 'counterpart', 'Mm-hm.');
      expect(c.transport.clears).toBe(0);
      expect(c.agent.cancels).toBe(0);
      expect(c.agent.truncations).toHaveLength(0);
      // When the assistant finishes, the backchannel doesn't get its own answer.
      c.agent.emit('responseDone');
      c.transport.emit('mark', 'a1');
      expect(c.agent.responses).toBe(c.responses);
      // 160 ms is too short to be a word: noise, and gone from the transcript.
      expect(c.get().events.map((e) => e.type)).toContain('turn.noise');
      expect(c.get().transcript.find((t) => t.id === 'c2')).toBeUndefined();
    });

    it('ignores a word "heard" in a burst too short to be one (noise, or our own echo)', async () => {
      const c = await connected();
      c.agent.emit('speechStarted');
      c.advance(5); // 100 ms of sound
      c.advance(20, SILENT);
      c.agent.emit('speechStopped');
      c.agent.emit('utteranceStarted', 'c2', 'counterpart');
      c.agent.emit('transcript', 'c2', 'counterpart', 'Good');
      c.agent.emit('responseDone');
      c.transport.emit('mark', 'a1');
      expect(c.agent.responses).toBe(c.responses);
      expect(c.agent.forgotten).toEqual(['c2']);
      expect(c.get().transcript.some((t) => t.text === 'Good')).toBe(false);
    });

    it('answers a greeting said over the assistant, but not "はい" or "嗯"', async () => {
      for (const [said, answered] of [['こんにちは', true], ['はい', false], ['嗯', false], ['Okay, sure.', false], ['Hello?', true]] as const) {
        const c = await connected();
        c.agent.emit('speechStarted');
        c.advance(30, SILENT);
        c.agent.emit('speechStopped');
        c.agent.emit('utteranceStarted', 'c2', 'counterpart');
        c.agent.emit('transcript', 'c2', 'counterpart', said);
        c.agent.emit('responseDone');
        c.transport.emit('mark', 'a1');
        expect(c.agent.responses, said).toBe(c.responses + (answered ? 1 : 0));
      }
    });

    it('answers a real question asked over the assistant once it finishes', async () => {
      const c = await connected();
      // Quiet line: the gate can't confirm speech, so the assistant isn't cut off...
      c.agent.emit('speechStarted');
      c.advance(30, SILENT);
      c.agent.emit('speechStopped');
      c.agent.emit('utteranceStarted', 'c2', 'counterpart');
      c.agent.emit('transcript', 'c2', 'counterpart', 'Can I talk to him quickly?');
      expect(c.agent.responses).toBe(c.responses);
      // ...but the question is answered as soon as it's done talking.
      c.agent.emit('responseDone');
      c.transport.emit('mark', 'a1');
      expect(c.agent.responses).toBe(c.responses + 1);
    });

    it('ignores noise in silence unless the transcript has words', async () => {
      const c = await connected();
      c.agent.emit('responseDone');
      c.transport.emit('mark', 'a1');
      c.agent.emit('speechStarted');
      c.advance(3); // a 60 ms bang
      c.agent.emit('speechStopped');
      c.agent.emit('utteranceStarted', 'c2', 'counterpart');
      c.agent.emit('transcript', 'c2', 'counterpart', '');
      expect(c.agent.responses).toBe(c.responses);
      c.agent.emit('speechStarted');
      c.advance(3);
      c.agent.emit('speechStopped');
      c.agent.emit('utteranceStarted', 'c3', 'counterpart');
      c.agent.emit('transcript', 'c3', 'counterpart', 'Yes.');
      expect(c.agent.responses).toBe(c.responses + 1);
    });
  });

  it("translates finished lines into the user's language, unless the call is in it", async () => {
    for (const [callLanguage, expected] of [['English', '[Chinese (Mandarin)] Can I help you?'], ['Chinese (Mandarin)', undefined]] as const) {
      const { store, agent, telephony, manager } = setup();
      const created = manager.startCall(dentistRequest({ callLanguage }));
      await waitFor(() => telephony.placed.length === 1);
      agent.emit('utteranceStarted', 'c1', 'counterpart');
      agent.emit('transcript', 'c1', 'counterpart', 'Can I help you?');
      await new Promise((r) => setTimeout(r, 20));
      expect(store.get(created.id)!.transcript[0]!.translation).toBe(expected);
      manager.endCall(created.id);
    }
  });

  describe('human in the loop', () => {
    async function live(holdTimeoutMs?: number, holdCheckInMs?: number, onUserQuestion?: CallManagerOptions['onUserQuestion']) {
      const ctx = setup({ holdTimeoutMs, holdCheckInMs, onUserQuestion });
      const created = ctx.manager.startCall(dentistRequest());
      await waitFor(() => ctx.telephony.placed.length === 1);
      ctx.manager.handleTelephonyState(created.id, 'answered');
      const get = () => ctx.store.get(created.id)!;
      const ask = (args: object) => ctx.agent.emit('toolCall', `t${Math.random()}`, 'request_decision', JSON.stringify(args));
      return { ...ctx, id: created.id, get, ask };
    }

    it("notifies the user's phone once per question, in their language", async () => {
      const notified: UserQuestion[] = [];
      const c = await live(undefined, undefined, (_record, q) => notified.push(q));
      c.ask({ category: 'additional_cost', question: 'Add an $80 X-ray?', amount_usd: 80 });
      await waitFor(() => notified.length === 1);
      await new Promise((r) => setTimeout(r, 50));
      expect(notified).toHaveLength(1);
      expect(notified[0]).toMatchObject({ status: 'pending', questionInUserLanguage: '[Chinese (Mandarin)] Add an $80 X-ray?' });
    });

    it('"decide later" declines for now, tells them the user will follow up, and keeps it open', async () => {
      const c = await live();
      c.ask({ category: 'additional_cost', question: 'Add an $80 X-ray?', amount_usd: 80 });
      const q = c.get().questions![0]!;
      expect(c.manager.answerQuestion(c.id, q.id, { decision: 'later' })).toBeNull();
      expect(c.agent.prompts.at(-1)).toContain('another time');
      expect(c.get().unresolvedQuestions).toContain('Add an $80 X-ray?');
      expect(c.get().decisions.at(-1)!.outcome).not.toBe('authorized');
    });

    it("uses the call's own hold time", async () => {
      const ctx = setup();
      const created = ctx.manager.startCall({ ...dentistRequest(), holdSeconds: 45 });
      await waitFor(() => ctx.telephony.placed.length === 1);
      ctx.manager.handleTelephonyState(created.id, 'answered');
      ctx.agent.emit('toolCall', 't1', 'request_decision', JSON.stringify({ category: 'additional_cost', question: 'Add an $80 X-ray?', amount_usd: 80 }));
      const q = ctx.store.get(created.id)!.questions![0]!;
      expect(q.expiresAt - q.askedAt).toBe(45_000);
      ctx.manager.endCall(created.id);
    });

    it('asks the user, and an approved charge lets the booking through', async () => {
      const c = await live();
      const booking = { type: 'appointment', description: 'Cleaning + X-ray', date: '2026-10-08', start_time: '15:30', additional_cost_usd: 80 };
      c.agent.emit('toolCall', 'b1', 'confirm_agreement', JSON.stringify(booking));
      expect(c.agent.toolResults.at(-1)?.output.accepted).toBe(false);

      c.ask({ category: 'additional_cost', question: 'Add an $80 X-ray?', amount_usd: 80 });
      const q = c.get().questions![0]!;
      await waitFor(() => c.get().questions![0]!.questionInUserLanguage !== undefined);
      expect(c.get().questions![0]!.questionInUserLanguage).toBe('[Chinese (Mandarin)] Add an $80 X-ray?');

      expect(c.manager.answerQuestion(c.id, q.id, { decision: 'approve' })).toBeNull();
      expect(c.agent.prompts.at(-1)).toContain('approved');
      expect(c.get().questions![0]).toMatchObject({ status: 'answered', answer: { decision: 'approve' } });
      c.agent.emit('toolCall', 'b2', 'confirm_agreement', JSON.stringify(booking));
      expect(c.agent.toolResults.at(-1)?.output.accepted).toBe(true);
      expect(c.manager.answerQuestion(c.id, q.id, { decision: 'decline' })).toMatchObject({ status: 409 });
    });

    it('approving an offered time allows exactly that slot', async () => {
      const c = await live();
      c.ask({ category: 'schedule_outside_constraints', question: 'They offered Friday 10 am.', date: '2026-10-09', start_time: '10:00' });
      c.manager.answerQuestion(c.id, c.get().questions![0]!.id, { decision: 'approve' });
      const confirm = (date: string, time: string) => {
        c.agent.emit('toolCall', 'x', 'confirm_agreement', JSON.stringify({ type: 'appointment', description: 'Cleaning', date, start_time: time }));
        return c.agent.toolResults.at(-1)?.output.accepted;
      };
      expect(confirm('2026-10-09', '11:00')).toBe(false);
      expect(confirm('2026-10-09', '10:00')).toBe(true);
    });

    it('passes on a typed answer, but never sensitive data', async () => {
      const c = await live();
      c.ask({ category: 'information_not_provided', question: 'Do you have dental insurance?' });
      const qid = c.get().questions![0]!.id;
      expect(c.manager.answerQuestion(c.id, qid, { decision: 'reply', text: 'Card 4111 1111 1111 1111' })).toMatchObject({ status: 422 });
      expect(c.get().questions![0]!.status).toBe('pending');
      expect(c.manager.answerQuestion(c.id, qid, { decision: 'reply', text: 'Yes, Delta Dental' })).toBeNull();
      expect(c.agent.prompts.at(-1)).toContain('"Yes, Delta Dental"');
    });

    it('moves on without agreeing when the user does not answer in time', async () => {
      const c = await live(100);
      c.ask({ category: 'additional_service', question: 'Add a fluoride treatment?' });
      await waitFor(() => c.get().questions![0]!.status === 'expired');
      expect(c.agent.prompts.at(-1)).toContain("didn't answer in time");
      expect(c.get().unresolvedQuestions).toContain('Add a fluoride treatment?');
    });

    it('thanks them for holding while the user decides, then stops', async () => {
      const c = await live(undefined, 60);
      c.ask({ category: 'additional_service', question: 'Add a fluoride treatment?' });
      c.agent.emit('responseDone'); // "Let me check with Leo, one moment."
      await waitFor(() => c.get().events.some((e) => e.type === 'user.hold_checkin'));
      c.agent.emit('responseDone'); // "Thanks for holding."
      await waitFor(() => c.get().events.filter((e) => e.type === 'user.hold_checkin').length >= 2);
      expect(c.agent.prompts.at(-1)).toContain('thank them for holding');
      c.manager.answerQuestion(c.id, c.get().questions![0]!.id, { decision: 'decline' });
      const count = c.get().events.filter((e) => e.type === 'user.hold_checkin').length;
      await new Promise((r) => setTimeout(r, 200));
      expect(c.get().events.filter((e) => e.type === 'user.hold_checkin').length).toBe(count);
    });

    it('passes a message from the user to the assistant mid-call, but never sensitive data', async () => {
      const c = await live();
      expect(c.manager.sendUserMessage(c.id, "Tell them I'll be 10 minutes late")).toBeNull();
      expect(c.agent.prompts.at(-1)).toContain(`"Tell them I'll be 10 minutes late"`);
      expect(c.get().transcript.at(-1)).toMatchObject({ speaker: 'system', text: "Tell them I'll be 10 minutes late" });
      expect(c.manager.sendUserMessage(c.id, 'my SSN is 123-45-6789')).toMatchObject({ status: 422 });
      expect(c.manager.sendUserMessage('nope', 'hi')).toMatchObject({ status: 404 });
    });

    it('never puts them on hold on a handed-off call: it declines for follow-up instead', async () => {
      const ctx = setup();
      const created = ctx.manager.startCall(dentistRequest({ involvement: 'handoff' }));
      await waitFor(() => ctx.telephony.placed.length === 1);
      ctx.manager.handleTelephonyState(created.id, 'answered');
      expect(ctx.agent.config?.instructions).toContain("can't be reached during it");
      expect(ctx.agent.config?.instructions).not.toContain('waiting_for_user');
      ctx.agent.emit('toolCall', 't1', 'request_decision', JSON.stringify({ category: 'additional_cost', question: 'Add an $80 X-ray?', amount_usd: 80 }));
      expect(ctx.agent.toolResults.at(-1)?.output.decision).toBe('requires_user_approval');
      expect(ctx.store.get(created.id)!.questions ?? []).toHaveLength(0);
      expect(ctx.store.get(created.id)!.unresolvedQuestions).toContain('Add an $80 X-ray?');
    });

    it('never asks the user about categories that can never be authorized', async () => {
      const c = await live();
      c.ask({ category: 'payment_information', question: 'Card number on file?' });
      expect(c.agent.toolResults.at(-1)?.output.decision).toBe('never_authorized');
      expect(c.get().questions ?? []).toHaveLength(0);
    });
  });

  it('streams both sides of the call to a listening app, with a clear on interruption and an end', async () => {
    const { store, agent, telephony, manager } = setup();
    const created = manager.startCall(dentistRequest());
    await waitFor(() => telephony.placed.length === 1);
    const transport = new FakeTransport();
    manager.attachMedia(created.id, (manager as any).sessions.get(created.id).streamToken, transport);
    const heard: string[] = [];
    const stop = manager.listen(created.id, (e) => heard.push('a' in e ? `${e.t}:${e.a}` : e.t))!;
    transport.emit('audio', 'THEM1', 20);
    agent.emit('utteranceStarted', 'a1', 'assistant');
    agent.emit('audio', 'a1', 'AI1');
    agent.emit('speechStarted');
    frames(transport, 20, 30);
    await waitFor(() => heard.includes('clear'));
    stop();
    transport.emit('audio', 'AFTER', 999);
    expect(heard.slice(0, 2)).toEqual(['them:THEM1', 'ai:AI1']);
    expect(heard).not.toContain('them:AFTER');
    const again: string[] = [];
    manager.listen(created.id, (e) => again.push(e.t));
    manager.handleTelephonyState(created.id, 'completed');
    await waitFor(() => store.get(created.id)!.status === 'completed', 8000);
    expect(again).toContain('end');
    expect(manager.listen(created.id, () => {})).toBeNull();
  });

  it('hangs up when the user taps End call', async () => {
    const { store, telephony, manager } = setup();
    const created = manager.startCall(dentistRequest());
    await waitFor(() => telephony.placed.length === 1);
    manager.handleTelephonyState(created.id, 'answered');
    expect(manager.endCall(created.id)).toBe(true);
    await waitFor(() => telephony.hangups.length === 1);
    expect(telephony.hangups).toEqual(['CA123']);
    manager.handleTelephonyState(created.id, 'completed');
    await waitFor(() => store.get(created.id)!.status === 'completed');
    expect(store.get(created.id)!.endReason).toBe('user_ended');
    expect(manager.endCall(created.id)).toBe(false);
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
