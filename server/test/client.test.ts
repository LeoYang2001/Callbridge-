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

  it('keeps the draft from update_request and answers the tool call', async () => {
    const { c, sent, drafts } = conversation();
    c.handle(JSON.stringify({ type: 'response.function_call_arguments.done', name: 'update_request', call_id: 'f1', arguments: '{"counterpart_name":"Tabito","phone_number":"9015551234"}' }));
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(drafts.at(-1)).toEqual({ counterpartName: 'Tabito', phoneNumber: '9015551234' });
    expect(sent[0]).toMatchObject({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'f1', output: '{"saved":true}' } });
    expect(sent[1]).toEqual({ type: 'response.create' });
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
    await vi.waitFor(() => expect(sent).toHaveLength(2));
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
