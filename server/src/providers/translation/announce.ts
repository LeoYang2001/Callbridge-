import { Downsampler, pcm16FromBytes } from '../../audio/pcm';

/**
 * Speech for the phone line: OpenAI text-to-speech as raw 24 kHz PCM, brought down to 8 kHz.
 * Used for the interpreter's short "I've joined" notice. Each text is made once and kept.
 */

const cache = new Map<string, Promise<Int16Array | null>>();

export function speakForPhone(opts: { apiKey: string; model: string; voice: string; fetch?: typeof fetch }, text: string): Promise<Int16Array | null> {
  const key = `${opts.model}|${opts.voice}|${text}`;
  let job = cache.get(key);
  if (!job) {
    job = make(opts, text).catch(() => null);
    cache.set(key, job);
    void job.then((audio) => audio || cache.delete(key));
  }
  return job;
}

async function make(opts: { apiKey: string; model: string; voice: string; fetch?: typeof fetch }, text: string): Promise<Int16Array | null> {
  const res = await (opts.fetch ?? fetch)('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      voice: opts.voice,
      input: text,
      instructions: 'Calm, clear and friendly, like a professional phone interpreter. Native pronunciation.',
      response_format: 'pcm',
    }),
  });
  if (!res.ok) return null;
  return new Downsampler().process(pcm16FromBytes(Buffer.from(await res.arrayBuffer())));
}
