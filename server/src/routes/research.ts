import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ResearchResult } from '../../../shared/types';
import type { OtpRateLimit } from '../auth/otp';
import type { ResearchAgent } from '../research/researcher';

/** The intake's `research` tool: ask the research agent anything. Per-user rate limited (it costs money). */
export function registerResearchRoutes(app: FastifyInstance, deps: { researcher: ResearchAgent | null; perUser: OtpRateLimit }) {
  const { researcher, perUser } = deps;

  app.post('/api/research', async (req, reply) => {
    if (!researcher) return reply.code(503).send({ error: 'Research is not set up on the server (OPENAI_API_KEY).' });
    const parsed = z
      .object({
        question: z.string().trim().min(2).max(500),
        depth: z.enum(['quick', 'thorough']).default('quick'),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        near: z.string().trim().max(120).optional(),
        userLanguage: z.string().trim().max(60).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Ask a question to look up.' });
    if (!perUser.allow(req.user!.id)) return reply.code(429).send({ error: 'Too many lookups this hour. Try again later.' });
    const started = Date.now();
    let result: ResearchResult;
    try {
      result = await researcher.research({ ...parsed.data, userLanguage: parsed.data.userLanguage || req.user!.profile.preferredLanguage });
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, 'research.failed');
      return reply.code(502).send({ error: "Couldn't look that up right now. Try again, or give me the details." });
    }
    // Mark places already in the phone book ("in your phone book as Los Comales").
    const contacts = req.user!.profile.contacts;
    for (const p of result.places) p.inPhoneBookAs = contacts.find((c) => c.phone === p.phone)?.name;
    req.log.info({ event: 'research', depth: parsed.data.depth, ms: Date.now() - started, places: result.places.length }, 'research');
    return result;
  });
}
