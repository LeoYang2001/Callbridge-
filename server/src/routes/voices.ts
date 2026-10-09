import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { languageCode } from '../../../shared/languages';
import { REALTIME_VOICES } from '../../../shared/types';

/**
 * A short sample of each assistant voice, in the user's language, so they can hear one before
 * picking it. Made once per voice and language with OpenAI text-to-speech (a few seconds of
 * audio, a fraction of a cent) and kept on disk after that.
 */

const SAMPLE_TEXT: Record<string, string> = {
  en: "Hi, I'm your CallBridge assistant. I'll make the call for you and keep you posted.",
  zh: '你好，我是你的 CallBridge 助手。我来帮你打电话，有消息马上告诉你。',
  yue: '你好，我係你嘅 CallBridge 助手。我幫你打電話，有消息即刻話你知。',
  es: 'Hola, soy tu asistente de CallBridge. Yo hago la llamada y te mantengo al tanto.',
  vi: 'Xin chào, tôi là trợ lý CallBridge của bạn. Tôi sẽ gọi điện giúp bạn và báo lại ngay.',
  ko: '안녕하세요, CallBridge 비서입니다. 제가 대신 전화하고 바로 알려 드릴게요.',
  tl: 'Hi, ako ang iyong CallBridge assistant. Ako ang tatawag para sa iyo at ibabalita ko agad.',
  ja: 'こんにちは、CallBridgeのアシスタントです。代わりにお電話して、すぐにお知らせします。',
  fr: "Bonjour, je suis votre assistant CallBridge. Je passe l'appel pour vous et je vous tiens au courant.",
  pt: 'Olá, sou seu assistente do CallBridge. Eu faço a ligação por você e te mantenho informado.',
  de: 'Hallo, ich bin Ihr CallBridge-Assistent. Ich übernehme den Anruf und halte Sie auf dem Laufenden.',
  it: 'Ciao, sono il tuo assistente CallBridge. Faccio io la telefonata e ti tengo aggiornato.',
  ru: 'Здравствуйте, я ваш помощник CallBridge. Я позвоню за вас и сразу сообщу, как всё прошло.',
  uk: 'Вітаю, я ваш помічник CallBridge. Я зателефоную за вас і одразу повідомлю результат.',
  ar: 'مرحبًا، أنا مساعدك في CallBridge. سأجري المكالمة نيابةً عنك وأبقيك على اطلاع.',
  hi: 'नमस्ते, मैं आपका CallBridge सहायक हूँ। मैं आपके लिए कॉल करूँगा और आपको तुरंत बताऊँगा।',
};

/** The sample's language: Cantonese has its own text; otherwise the language code, else English. */
export function sampleLanguage(language: string): string {
  if (/cantonese|粵|粤/i.test(language)) return 'yue';
  const code = languageCode(language);
  return code && SAMPLE_TEXT[code] ? code : 'en';
}

export function registerVoiceRoutes(app: FastifyInstance, deps: { apiKey?: string; cacheDir: string; model?: string; onMade?: (userId: string | null, detail: string) => void }) {
  const making = new Map<string, Promise<Buffer>>();

  const make = async (voice: string, lang: string, userId: string | null): Promise<Buffer> => {
    const file = path.join(deps.cacheDir, `${voice}-${lang}.wav`);
    const cached = await readFile(file).catch(() => null);
    if (cached) return cached;
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: deps.model ?? 'gpt-4o-mini-tts',
        voice,
        input: SAMPLE_TEXT[lang],
        instructions: 'Warm, calm and friendly, like a capable personal assistant.',
        response_format: 'wav',
      }),
    });
    if (!res.ok) throw new Error(`Text-to-speech failed (HTTP ${res.status}).`);
    const audio = Buffer.from(await res.arrayBuffer());
    await mkdir(deps.cacheDir, { recursive: true });
    await writeFile(file, audio);
    deps.onMade?.(userId, `${voice} ${lang}`);
    return audio;
  };

  app.get<{ Params: { voice: string }; Querystring: { language?: string } }>('/api/voices/:voice/sample', async (req, reply) => {
    const { voice } = req.params;
    if (!(REALTIME_VOICES as readonly string[]).includes(voice)) return reply.code(404).send({ error: 'No such voice.' });
    if (!deps.apiKey) return reply.code(503).send({ error: 'Voice samples need the OpenAI key on the server.' });
    const lang = sampleLanguage(req.query.language ?? req.user?.profile.preferredLanguage ?? 'English');
    const key = `${voice}-${lang}`;
    let job = making.get(key);
    if (!job) {
      job = make(voice, lang, req.user?.id ?? null).finally(() => making.delete(key));
      making.set(key, job);
    }
    try {
      const audio = await job;
      return reply.header('Content-Type', 'audio/wav').header('Cache-Control', 'private, max-age=86400').send(audio);
    } catch (e) {
      req.log.warn({ err: e }, 'voice sample failed');
      return reply.code(502).send({ error: "Couldn't load the voice sample. Try again." });
    }
  });
}
