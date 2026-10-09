import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIntakeConversation, type IntakeHandlers } from '../../shared/client/intake';
import { decodeUlawBase64, ulawToFloat } from '../../shared/client/listen';
import type { IntakeDraft } from '../../shared/types';

/** The client logic the web and mobile apps share (shared/client). */

describe('μ-law decoding', () => {
  it('maps silence to zero and the extremes to ±1', () => {
    expect(ulawToFloat(0xff)).toBe(0);
    expect(ulawToFloat(0x00)).toBeCloseTo(-1, 1);
    expect(ulawToFloat(0x80)).toBeCloseTo(1, 1);
    expect(Array.from(decodeUlawBase64(Buffer.from([0xff, 0x7f]).toString('base64')))).toEqual([0, -0]);
  });
});

describe('intake conversation', () => {
  afterEach(() => vi.unstubAllGlobals());

  function conversation(open = true) {
    const sent: any[] = [];
    const drafts: IntakeDraft[] = [];
    const lines: { role: string; text: string }[] = [];
    const h: IntakeHandlers = {
      onStatus: () => {},
      onLine: (l) => lines.push(l),
      onDraft: (d) => drafts.push(d),
      onCheck: () => {},
      onReady: () => {},
    };
    let isOpen = open;
    const c = createIntakeConversation({
      conn: { serverUrl: 'https://cb.test', sessionToken: 'tok' },
      ctx: { userName: 'Leo', userLanguage: 'Chinese (Mandarin)', timezone: 'America/Chicago' },
      handlers: h,
      send: (e) => isOpen && (sent.push(e), true),
      isOpen: () => isOpen,
      locate: async () => ({ lat: 35.1, lng: -90 }),
    });
    return { c, sent, drafts, lines, open: () => (isOpen = true) };
  }

  it('keeps the draft from update_request and answers once the assistant turn is done', async () => {
    const { c, sent, drafts } = conversation();
    c.handle(JSON.stringify({ type: 'response.function_call_arguments.done', name: 'update_request', call_id: 'f1', arguments: '{"counterpart_name":"Tabito","phone_number":"9015551234"}' }));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(drafts.at(-1)).toEqual({ counterpartName: 'Tabito', phoneNumber: '9015551234' });
    expect(sent[0]).toMatchObject({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'f1', output: '{"saved":true}' } });
    c.handle(JSON.stringify({ type: 'response.done', response: { output: [{ type: 'message' }, { type: 'function_call', name: 'update_request', call_id: 'f1' }] } }));
    await vi.waitFor(() => expect(sent.at(-1)).toEqual({ type: 'response.create' }));
    expect(sent).toHaveLength(2);
  });

  it('shows answer chips without making the assistant speak again, unless it said nothing', async () => {
    const sent: any[] = [];
    const shown: unknown[] = [];
    const chips = createIntakeConversation({
      conn: { serverUrl: 'https://cb.test', sessionToken: 'tok' },
      ctx: { userName: 'Leo', userLanguage: 'Chinese (Mandarin)', timezone: 'America/Chicago' },
      handlers: { onStatus: () => {}, onLine: () => {}, onDraft: () => {}, onCheck: () => {}, onReady: () => {}, onChoices: (x) => shown.push(x) },
      send: (e) => (sent.push(e), true),
      isOpen: () => true,
      locate: async () => null,
      pushToTalk: true,
    });
    const args = JSON.stringify({ question: '您以前去过吗？', question_en: 'Have you been there before?', choices: ['是，老患者', '第一次去'], topic: '是否老患者？' });
    chips.handle(JSON.stringify({ type: 'response.function_call_arguments.done', name: 'show_choices', call_id: 's1', arguments: args }));
    chips.handle(JSON.stringify({ type: 'response.done', response: { output: [{ type: 'message' }, { type: 'function_call', name: 'show_choices', call_id: 's1' }] } }));
    await vi.waitFor(() => expect(shown).toHaveLength(1));
    expect(shown[0]).toEqual({ question: '您以前去过吗？', questionEn: 'Have you been there before?', choices: ['是，老患者', '第一次去'], topic: '是否老患者？' });
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.filter((e) => e.type === 'response.create')).toHaveLength(0);

    chips.handle(JSON.stringify({ type: 'response.function_call_arguments.done', name: 'show_choices', call_id: 's2', arguments: args }));
    chips.handle(JSON.stringify({ type: 'response.done', response: { output: [{ type: 'function_call', name: 'show_choices', call_id: 's2' }] } }));
    await vi.waitFor(() => expect(sent.filter((e) => e.type === 'response.create')).toHaveLength(1));
  });

  function bare(extra: Partial<Parameters<typeof createIntakeConversation>[0]> = {}) {
    const sent: any[] = [];
    const statuses: string[] = [];
    const lines: { id: string; text: string; partial?: boolean }[] = [];
    const c = createIntakeConversation({
      conn: { serverUrl: 'https://cb.test', sessionToken: 'tok' },
      ctx: { userName: 'Leo', userLanguage: 'English', timezone: 'America/Chicago' },
      handlers: { onStatus: (s) => statuses.push(s), onLine: (l) => lines.push(l), onDraft: () => {}, onCheck: () => {}, onReady: () => {} },
      send: (e) => (sent.push(e), true),
      isOpen: () => true,
      locate: async () => null,
      pushToTalk: true,
      ...extra,
    });
    return { c, sent, statuses, lines };
  }

  it('opens with a tapped suggestion instead of the greeting, or waits for the talk button', () => {
    const tapped = bare({ firstText: 'the nearest pharmacy' });
    expect(tapped.lines).toMatchObject([{ text: 'the nearest pharmacy' }]);
    tapped.c.opened();
    expect(tapped.sent.filter((e) => e.type === 'response.create')).toHaveLength(1);
    expect(tapped.sent[0]).toMatchObject({ type: 'conversation.item.create', item: { content: [{ text: 'the nearest pharmacy' }] } });

    const holding = bare({ waitForUser: true });
    holding.c.opened();
    expect(holding.sent).toEqual([]);
  });

  it('keeps "looking it up" on while a search runs, even after "let me check" finishes playing', async () => {
    let finish!: () => void;
    vi.stubGlobal('fetch', () => new Promise((resolve) => (finish = () => resolve(new Response(JSON.stringify({ answer: 'ok', places: [], sources: [] }))))));
    const { c, statuses } = bare();
    c.handle(JSON.stringify({ type: 'response.function_call_arguments.done', name: 'research', call_id: 'r1', arguments: '{"question":"nearest pharmacy"}' }));
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('searching'));
    c.handle(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
    expect(statuses.at(-1)).toBe('searching');
    finish();
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('thinking'));
  });

  it('stops a search when the user talks, without the assistant then talking about it', async () => {
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const { c, sent, statuses } = bare();
    c.handle(JSON.stringify({ type: 'response.function_call_arguments.done', name: 'research', call_id: 'r1', arguments: '{"question":"nearest pharmacy"}' }));
    c.handle(JSON.stringify({ type: 'response.done', response: { output: [{ type: 'message' }, { type: 'function_call', name: 'research', call_id: 'r1' }] } }));
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('searching'));
    c.startTurn();
    expect(statuses.at(-1)).toBe('listening');
    await vi.waitFor(() => expect(sent.some((e) => e.item?.call_id === 'r1')).toBe(true));
    expect(JSON.parse(sent.find((e) => e.item?.call_id === 'r1').item.output)).toMatchObject({ stopped: true });
    await new Promise((r) => setTimeout(r, 20));
    // Only the press's own events; no response.create for the stopped search.
    expect(sent.filter((e) => e.type === 'response.create')).toHaveLength(0);
  });

  it('captions the assistant a sentence at a time once its voice starts', () => {
    vi.useFakeTimers();
    try {
      const { c, lines } = bare();
      const say = 'One moment please. Let me look that up for you now. Okay, I found three.';
      c.handle(JSON.stringify({ type: 'response.output_audio_transcript.delta', item_id: 'a1', delta: say }));
      c.handle(JSON.stringify({ type: 'response.output_audio_transcript.done', item_id: 'a1', transcript: say }));
      expect(lines).toEqual([]); // written, but not spoken yet
      c.handle(JSON.stringify({ type: 'output_audio_buffer.started' }));
      expect(lines.at(-1)).toMatchObject({ text: 'One moment please.', partial: true });
      vi.advanceTimersByTime(2000); // ~30 characters in at 15 a second
      expect(lines.at(-1)).toMatchObject({ text: 'One moment please. Let me look that up for you now.', partial: true });
      c.handle(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
      expect(lines.at(-1)).toEqual({ id: 'a1', role: 'assistant', text: say });
    } finally {
      vi.useRealTimers();
    }
  });

  it('push-to-talk: clears on press, commits and asks for an answer on release', () => {
    const { c, sent } = conversation();
    c.startTurn();
    expect(sent.map((e) => e.type)).toEqual(['response.cancel', 'output_audio_buffer.clear', 'input_audio_buffer.clear']);
    c.endTurn();
    expect(sent.slice(-2).map((e) => e.type)).toEqual(['input_audio_buffer.commit', 'response.create']);
  });

  it('sends what was typed before the channel opened, once it opens', () => {
    const { c, sent, lines, open } = conversation(false);
    c.sendText('call Maria');
    expect(sent).toEqual([]);
    expect(lines).toEqual([{ id: 'typed-1', role: 'user', text: 'call Maria' }]);
    open();
    c.opened();
    expect(sent[0]).toMatchObject({ item: { role: 'user', content: [{ type: 'input_text', text: 'call Maria' }] } });
    expect(sent.at(-1)).toEqual({ type: 'response.create' });
  });

  it("searches near the user's location and gives the model compact results", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ answer: 'Two nearby.', places: [{ name: 'Taqueria', phone: '+19015550101', distanceMeters: 1609, source: 'google', verified: true }], sources: [] })));
    vi.stubGlobal('fetch', fetch);
    const { c, sent } = conversation();
    c.handle(JSON.stringify({ type: 'response.function_call_arguments.done', name: 'research', call_id: 'r1', arguments: '{"question":"nearest taqueria"}' }));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cb.test/api/research');
    expect(JSON.parse(init.body as string)).toMatchObject({ question: 'nearest taqueria', depth: 'quick', lat: 35.1, lng: -90 });
    expect(JSON.parse(sent[0].item.output)).toMatchObject({ places: [{ name: 'Taqueria', distance_miles: 1, verified: true }], location_used: 'the user’s current location' });
  });
});

describe('device language', () => {
  it('maps phone locales to the languages the app offers', async () => {
    const { languageFromLocale } = await import('../../shared/languages');
    expect(languageFromLocale('zh-Hans-US')).toBe('Chinese (Mandarin)');
    expect(languageFromLocale('zh-Hant-HK')).toBe('Chinese (Cantonese)');
    expect(languageFromLocale('fil-PH')).toBe('Tagalog');
    expect(languageFromLocale('es-MX')).toBe('Spanish');
    expect(languageFromLocale('nl-NL')).toBe('English');
  });
});

describe('app languages', () => {
  it('gives every offered language a transcription hint except Hmong', async () => {
    const { APP_LANGUAGES, languageCode } = await import('../../shared/languages');
    expect(APP_LANGUAGES).toHaveLength(30);
    expect(APP_LANGUAGES.filter((l) => !languageCode(l.name)).map((l) => l.name)).toEqual(['Hmong']);
  });
});
