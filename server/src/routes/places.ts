import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PlaceResult } from '../../../shared/types';
import type { OtpRateLimit } from '../auth/otp';
import type { PlaceSearch } from '../places/places';

/** Business search for the intake's search_places tool. Per-user rate limited; each search costs money. */
export function registerPlacesRoutes(app: FastifyInstance, deps: { places: PlaceSearch | null; perUser: OtpRateLimit }) {
  const { places, perUser } = deps;

  app.post('/api/places/search', async (req, reply) => {
    if (!places) return reply.code(503).send({ error: 'Business search is not set up on the server.' });
    const parsed = z
      .object({
        query: z.string().trim().min(2).max(120),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        near: z.string().trim().max(120).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Say what kind of place to look for.' });
    if (!perUser.allow(req.user!.id)) return reply.code(429).send({ error: 'Too many searches this hour. Try again later.' });
    let results: PlaceResult[];
    try {
      results = await places.search(parsed.data);
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, 'places.search_failed');
      return reply.code(502).send({ error: "Couldn't search right now. Try again, or give me the number." });
    }
    // Mark places already in the phone book, so the user sees "Maria's salon (in your phone book)".
    const contacts = req.user!.profile.contacts;
    for (const r of results) r.inPhoneBookAs = contacts.find((c) => c.phone === r.phone)?.name;
    req.log.info({ event: 'places.search', source: places.source, results: results.length }, 'places.search');
    return { source: places.source, results };
  });
}
