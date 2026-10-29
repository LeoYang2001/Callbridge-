import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TranslatedCallRecord } from '../../shared/types';
import { Downsampler, mixFrame, OverlayQueue, ulawDecode, ulawEncode, Upsampler } from '../src/audio/pcm';
import { CaptionTrack } from '../src/calls/captions';
import { TranslatedCall, type TranslationStream } from '../src/calls/translatedCall';
import { TranslatedCallManager } from '../src/calls/translatedCallManager';
import { LiveTranslation } from '../src/providers/translation/liveTranslation';
import type { MediaTransport, MediaTransportEvents, TelephonyProvider } from '../src/providers/telephony/types';

const sine = (hz: number, rate: number, n: number, amp = 8000) => Int16Array.from({ length: n }, (_, i) => Math.round(amp * Math.sin((2 * Math.PI * hz * i) / rate)));
const rms = (a: Int16Array, from = 0) => Math.sqrt(a.slice(from).reduce((s, x) => s + x * x, 0) / (a.length - from));

describe('phone audio', () => {
  it('round-trips μ-law within its quantization error', () => {
    const pcm = sine(440, 8000, 160);
    const back = ulawDecode(ulawEncode(pcm));
    pcm.forEach((x, i) => expect(Math.abs(back[i]! - x)).toBeLessThanOrEqual(Math.max(16, Math.abs(x) * 0.07)));
    expect(ulawDecode(ulawEncode([0]))[0]).toBe(0);
  });

  it('resamples 8 kHz ↔ 24 kHz, keeping speech and dropping what the phone line cannot carry', () => {
    expect(new Upsampler().process(new Int16Array(160)).length).toBe(480);
    const down = new Downsampler();
    const voice = down.process(sine(1000, 24000, 4800));
    expect(voice.length).toBe(1600);
    expect(rms(voice, 100)).toBeGreaterThan(5000);
    const hiss = new Downsampler().process(sine(7000, 24000, 4800));
    expect(rms(hiss, 100)).toBeLessThan(800);
  });

  it('queues translated speech and mixes it over the ducked voice', () => {
    const q = new OverlayQueue();
    expect(q.take(160)).toBeNull();
    q.push(new Int16Array(100).fill(1000));
    q.push(new Int16Array(100).fill(2000));
    const frame = q.take(160)!;
    expect([frame[0], frame[99], frame[100], frame[159]]).toEqual([1000, 1000, 2000, 2000]);
    expect(q.pendingMs).toBe(5);
    const voice = ulawEncode(new Int16Array(160).fill(10000));
    expect(mixFrame(voice, null)).toBe(voice);
    const mixed = ulawDecode(mixFrame(voice, new Int16Array(160).fill(4000)));
    expect(Math.abs(mixed[0]! - 7000)).toBeLessThan(400);
  });
});

describe('caption lines', () => {
  it('starts a line after a pause and pairs each translation with its line', () => {
    let t = 0;
    const lines = new Map<string, { original: string; translation: string; final: boolean }>();
    const track = new CaptionTrack('them', (l) => lines.set(l.id, l), 1200, () => t);
    track.source('Hello, ');
    t = 300;
    track.source('this is the dentist.');
    t = 2000;
    track.translation('你好，');
    track.source('Can you come Tuesday?');
    t = 2400;
    track.translation('这里是牙医诊所。');
    t = 4000;
    track.translation('你周二能来吗？');
    track.close();
    expect([...lines.values()].map((l) => [l.original, l.translation, l.final])).toEqual([
      ['Hello, this is the dentist.', '你好，这里是牙医诊所。', true],
      ['Can you come Tuesday?', '你周二能来吗？', true],
    ]);
  });
});

class FakeSocket extends EventEmitter {
  readyState = 1;
  sent: any[] = [];
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  terminate() {}
}

describe('live translation stream', () => {
  it('configures the target language, sends 200 ms frames, and returns phone audio', async () => {
    const socket = new FakeSocket();
    const t = new LiveTranslation({ apiKey: 'sk', model: 'gpt-realtime-translate', targetLanguage: 'en', transcriptionModel: 'gpt-4o-transcribe', connect: () => socket as any });
    const heard: string[] = [];
    const audio: Buffer[] = [];
    t.on('source', (d) => heard.push(`src:${d}`));
    t.on('translation', (d) => heard.push(`tr:${d}`));
    t.on('audio', (b64) => audio.push(Buffer.from(b64, 'base64')));
    const ready = t.connect();
    socket.emit('open');
    expect(socket.sent[0]).toEqual({
      type: 'session.update',
      session: { audio: { input: { transcription: { model: 'gpt-4o-transcribe' }, noise_reduction: { type: 'near_field' } }, output: { language: 'en' } } },
    });
    socket.emit('message', JSON.stringify({ type: 'session.updated' }));
    await ready;

    const frame = Buffer.alloc(160, 0xff).toString('base64');
    for (let i = 0; i < 9; i++) t.sendAudio(frame);
    expect(socket.sent).toHaveLength(1);
    t.sendAudio(frame);
    expect(socket.sent[1].type).toBe('session.input_audio_buffer.append');
    expect(Buffer.from(socket.sent[1].audio, 'base64').length).toBe(4800 * 2);

    socket.emit('message', JSON.stringify({ type: 'session.input_transcript.delta', delta: '你好' }));
    socket.emit('message', JSON.stringify({ type: 'session.output_transcript.delta', delta: 'Hello' }));
    const pcm = Buffer.alloc(4800 * 2);
    socket.emit('message', JSON.stringify({ type: 'session.output_audio.delta', delta: pcm.toString('base64'), sample_rate: 24000 }));
    expect(heard).toEqual(['src:你好', 'tr:Hello']);
    expect(audio[0]!.length).toBe(1600);
  });
});

class FakeTransport extends EventEmitter implements MediaTransport {
  sent: string[] = [];
  closed = false;
  cleared = 0;
  sendAudio(b64: string) {
    this.sent.push(b64);
  }
  clearAudio() {
    this.cleared++;
  }
  sendMark() {}
  override on<E extends keyof MediaTransportEvents>(event: E, listener: MediaTransportEvents[E]) {
    return super.on(event, listener as (...a: any[]) => void) as any;
  }
  close() {
    this.closed = true;
  }
}

class FakeTranslation extends EventEmitter implements TranslationStream {
  input: string[] = [];
  closed = false;
  constructor(readonly target: string) {
    super();
  }
  async connect() {}
  sendAudio(b64: string) {
    this.input.push(b64);
  }
  override on(event: any, listener: any) {
    return super.on(event, listener) as any;
  }
  close() {
    this.closed = true;
  }
}

function setup(join: 'app' | 'phone' = 'phone') {
  const telephony = {
    name: 'fake',
    placeCall: vi.fn(async () => ({ providerCallId: 'CA-them' })),
    placeUserLeg: vi.fn(async () => ({ providerCallId: 'CA-you' })),
    hangup: vi.fn(async () => {}),
  } satisfies TelephonyProvider;
  const translations: FakeTranslation[] = [];
  const finished: TranslatedCallRecord[] = [];
  const manager = new TranslatedCallManager(
    () => ({
      telephony,
      createTranslation: (target) => {
        const t = new FakeTranslation(target);
        translations.push(t);
        return t;
      },
      speak: async () => new Int16Array(800).fill(3000),
      maxCallSeconds: 600,
      log: () => {},
    }),
    { allowedDestinations: null, maxCallsPerHour: 10 },
  );
  return { telephony, translations, finished, manager };
}

const caller = { userId: 'u1', name: 'Li', language: 'Chinese (Mandarin)', phone: '+14155550100' };
const silence = Buffer.alloc(160, 0xff).toString('base64');

describe('translated call', () => {
  afterEach(() => vi.useRealTimers());

  it('rings you, dials them, relays both ways with captions, and adds the interpreter on request', async () => {
    vi.useFakeTimers();
    const { telephony, translations, manager } = setup();
    const { record } = await manager.start({ to: '+14155550123', contactName: 'Dr. Kim', theirLanguage: 'English', join: 'phone' }, caller);
    expect(record.id.startsWith('tc_')).toBe(true);
    expect(telephony.placeUserLeg).toHaveBeenCalledWith(expect.objectContaining({ to: '+14155550100' }));

    const you = new FakeTransport();
    const youToken = (manager as any).calls.get(record.id).userToken;
    expect(manager.attachUserMedia(record.id, 'wrong', you)).toBe(false);
    expect(manager.attachUserMedia(record.id, youToken, you)).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(telephony.placeCall).toHaveBeenCalledWith(expect.objectContaining({ to: '+14155550123' }));
    expect(record.status).toBe('dialing');
    expect(you.sent.length).toBeGreaterThan(2); // ringback

    const them = new FakeTransport();
    expect(manager.attachMedia(record.id, manager.streamTokenFor(record.id)!, them)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(record.status).toBe('live');
    // Captions are on by default: one translation each way.
    expect(translations.map((t) => t.target).sort()).toEqual(['en', 'zh']);
    const toEnglish = translations.find((t) => t.target === 'en')!;
    const toChinese = translations.find((t) => t.target === 'zh')!;

    you.sent = [];
    them.emit('audio', silence, 20);
    you.emit('audio', silence, 20);
    expect(you.sent).toEqual([silence]);
    expect(them.sent).toEqual([silence]);
    expect(toChinese.input).toEqual([silence]);
    expect(toEnglish.input).toEqual([silence]);

    toChinese.emit('source', 'Hello');
    toChinese.emit('translation', '你好');
    expect(record.lines).toEqual([expect.objectContaining({ speaker: 'them', original: 'Hello', translation: '你好' })]);

    // Translated speech isn't played until the interpreter joins.
    toEnglish.emit('audio', Buffer.alloc(160, 0x80).toString('base64'));
    them.sent = [];
    you.emit('audio', silence, 40);
    expect(them.sent).toEqual([silence]);

    const live = manager.live(record.id, 'u1')!;
    await expect(live.setInterpreter(true)).resolves.toBeNull();
    expect(record.interpreter).toBe('on');
    them.sent = [];
    you.emit('audio', silence, 60);
    expect(them.sent[0]).not.toBe(silence); // the announcement, mixed in

    them.emit('stop');
    expect(record.status).toBe('ended');
    expect(telephony.hangup).toHaveBeenCalledWith('CA-them');
    expect(telephony.hangup).toHaveBeenCalledWith('CA-you');
    expect(translations.every((t) => t.closed)).toBe(true);
    expect(manager.get(record.id, 'u1')).toBe(record);
    expect(manager.get(record.id, 'someone-else')).toBeUndefined();
  });

  it('joins from the app with a one-time code, and reports a call nobody answered', async () => {
    const { telephony, manager } = setup('app');
    const { record, code } = await manager.start({ to: '+14155550123', theirLanguage: 'Japanese', join: 'app' }, caller);
    expect(telephony.placeUserLeg).not.toHaveBeenCalled();
    expect(manager.appJoinStream(record.id, 'nope'.padEnd(code!.length, 'x'), 'CA-app')).toBeNull();
    const token = manager.appJoinStream(record.id, code!, 'CA-app');
    expect(token).toBeTruthy();
    expect(manager.appJoinStream(record.id, code!, 'CA-app')).toBeNull();
    manager.attachUserMedia(record.id, token!, new FakeTransport());
    await new Promise((r) => setTimeout(r, 0));
    manager.handleTelephonyState(record.id, 'no_answer');
    expect(record.status).toBe('failed');
    expect(record.failureReason).toBe('No one answered.');
    expect(telephony.hangup).toHaveBeenCalledWith('CA-app');
  });

  it('refuses calls that need no translation or a second call at once', async () => {
    const { manager } = setup();
    await expect(manager.start({ to: '+14155550123', theirLanguage: 'Chinese', join: 'phone' }, caller)).rejects.toThrow(/nothing to translate/);
    await manager.start({ to: '+14155550123', theirLanguage: 'English', join: 'phone' }, caller);
    await expect(manager.start({ to: '+14155550124', theirLanguage: 'English', join: 'phone' }, caller)).rejects.toThrow(/already have a call/);
  });

  it("won't add an interpreter that can't speak a side's language", async () => {
    const { manager } = setup();
    const { record } = await manager.start({ to: '+14155550123', theirLanguage: 'Tagalog', join: 'phone' }, caller);
    const call = manager.live(record.id, 'u1')! as TranslatedCall;
    call.attachUserMedia(new FakeTransport());
    call.attachMedia(new FakeTransport());
    await expect(call.setInterpreter(true)).resolves.toMatch(/can't speak Tagalog/);
    expect(record.interpreter).toBe('off');
  });
});
