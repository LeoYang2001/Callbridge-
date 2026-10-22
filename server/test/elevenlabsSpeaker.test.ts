import { describe, expect, it, vi } from 'vitest';
import { ElevenLabsSpeaker, elevenLabsLanguageCode, splitSentences, voiceLanguageKey } from '../src/providers/voice/elevenlabsSpeaker';

const audio = (bytes: number) => new Response(new Uint8Array(bytes).fill(0xff));

function speakerWith(fetch: ReturnType<typeof vi.fn>, languageCode?: string) {
  const speaker = new ElevenLabsSpeaker({ apiKey: 'xi-test', voiceId: 'voice1', model: 'eleven_flash_v2_5', languageCode, fetch: fetch as unknown as typeof globalThis.fetch });
  const chunks: [string, number][] = [];
  speaker.on('audio', (itemId, b64) => chunks.push([itemId, Buffer.from(b64, 'base64').length]));
  const idle = new Promise<void>((resolve) => speaker.on('idle', resolve));
  return { speaker, chunks, idle };
}

describe('ElevenLabs speaker', () => {
  it('cuts sentences in Latin and CJK text, keeping unfinished ones', () => {
    expect(splitSentences('Hi there. It costs 3.5 dollars. And', false)).toEqual([['Hi there.', 'It costs 3.5 dollars.'], ' And']);
    expect(splitSentences('你好。我想预约。明天', false)).toEqual([['你好。', '我想预约。'], '明天']);
    expect(splitSentences('Is that right?" he', false)).toEqual([['Is that right?"'], ' he']);
    expect(splitSentences('Thanks.', false)).toEqual([[], 'Thanks.']);
    expect(splitSentences('Thanks.', true)).toEqual([['Thanks.'], '']);
  });

  it('voices each sentence in order as phone audio, with the earlier text for continuity', async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => audio(JSON.parse(String(init.body)).text.length * 100));
    const { speaker, chunks, idle } = speakerWith(fetch, 'ja');
    speaker.write('item1', 'こんにちは。予約');
    speaker.write('item1', 'をお願いします。');
    speaker.end('item1');
    await idle;

    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[1]!;
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice1/stream?output_format=ulaw_8000');
    expect(JSON.parse(String(init.body))).toEqual({ text: '予約をお願いします。', model_id: 'eleven_flash_v2_5', previous_text: 'こんにちは。', language_code: 'ja' });
    expect(chunks).toEqual([['item1', 600], ['item1', 1000]]);
    expect(speaker.busy()).toBe(false);
  });

  it('drops a language code the model rejects and keeps speaking', async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => (JSON.parse(String(init.body)).language_code ? new Response('bad language', { status: 400 }) : audio(80)));
    const { speaker, chunks, idle } = speakerWith(fetch, 'fil');
    speaker.write('a', 'Magandang araw po. ');
    speaker.end('a');
    await idle;
    expect(chunks).toEqual([['a', 80]]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports a rejected key as fatal', async () => {
    const fetch = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const { speaker, idle } = speakerWith(fetch);
    const failures: [string, boolean][] = [];
    speaker.on('failure', (m, fatal) => failures.push([m, fatal]));
    speaker.write('a', 'Hello. ');
    speaker.end('a');
    await idle;
    expect(failures).toEqual([[expect.stringContaining('HTTP 401'), true]]);
  });

  it('works out what the listener heard before an interruption', async () => {
    // 8 bytes per ms: "One." plays 400 ms, "Two three." 1000 ms.
    const fetch = vi.fn(async (_url: string, init: RequestInit) => audio(JSON.parse(String(init.body)).text === 'One.' ? 3200 : 8000));
    const { speaker, idle } = speakerWith(fetch);
    speaker.write('a', 'One. Two three.');
    speaker.end('a');
    await idle;
    expect(speaker.heardText('a', 300)).toBe('One');
    expect(speaker.heardText('a', 900)).toBe('One. Two t');
    expect(speaker.heardText('a', 5000)).toBe('One. Two three.');
    speaker.stop();
    expect(speaker.heardText('a', 5000)).toBe('One. Two three.');
  });

  it('maps call languages to voices and ElevenLabs codes', () => {
    expect(voiceLanguageKey('Chinese (Cantonese)', 'zh')).toBe('yue');
    expect(voiceLanguageKey('Chinese (Mandarin)', 'zh')).toBe('zh');
    expect(elevenLabsLanguageCode('tl')).toBe('fil');
    expect(elevenLabsLanguageCode('yue')).toBeUndefined();
    expect(elevenLabsLanguageCode('ja')).toBe('ja');
  });
});
