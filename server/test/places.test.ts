import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaceResult } from '../../shared/types';
import { OtpRateLimit } from '../src/auth/otp';
import { Database } from '../src/db/database';
import { cleanResults, distanceMeters, GooglePlaces } from '../src/places/places';
import { emptyProfile } from '../src/profile/profile';
import type { ResearchAgent } from '../src/research/researcher';
import { registerResearchRoutes } from '../src/routes/research';

const place = (name: string, phone: string | null): PlaceResult => ({ name, phone, source: 'web', verified: false });

describe('place results', () => {
  it('keeps only dialable, distinct numbers, normalized', () => {
    const cleaned = cleanResults([place('A', '(901) 526-0037'), place('A again', '+1 901 526 0037'), place('No phone', null), place('Premium', '900-555-0100'), place('B', '901-590-4525')]);
    expect(cleaned.map((p) => [p.name, p.phone])).toEqual([
      ['A', '+19015260037'],
      ['B', '+19015904525'],
    ]);
  });

  it('measures distance', () => {
    // Downtown Memphis to Graceland is roughly 13 km.
    expect(distanceMeters({ lat: 35.1495, lng: -90.049 }, { lat: 35.0478, lng: -90.0261 })).toBeGreaterThan(11_000);
  });
});

describe('Google Places', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('searches near the user, nearest first, and maps the fields', async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          places: [
            {
              displayName: { text: 'Taqueria Uno' },
              formattedAddress: '1 Main St, Memphis, TN',
              internationalPhoneNumber: '+1 901-555-0101',
              location: { latitude: 35.15, longitude: -90.05 },
              rating: 4.6,
              userRatingCount: 210,
              currentOpeningHours: { openNow: true },
              googleMapsUri: 'https://maps.google.com/?cid=1',
            },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const results = await new GooglePlaces('key').search({ query: 'Mexican restaurant', lat: 35.1495, lng: -90.049 });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toContain('places.internationalPhoneNumber');
    expect(JSON.parse(init.body as string)).toMatchObject({ textQuery: 'Mexican restaurant', rankPreference: 'DISTANCE', locationBias: { circle: { center: { latitude: 35.1495 } } } });
    expect(results).toMatchObject([{ name: 'Taqueria Uno', phone: '+19015550101', openNow: true, rating: 4.6, source: 'google', verified: true }]);
    expect(results[0]!.distanceMeters).toBeLessThan(200);
  });
});

describe('research route', () => {
  it("answers with the user's language, marks results already in the phone book, and rate-limits per user", async () => {
    const db = new Database(':memory:');
    const user = db.createUser('+19014553148', { ...emptyProfile(), preferredLanguage: 'Chinese (Mandarin)', contacts: [{ id: 'c', name: 'Los Comales', phone: '+19015904525', notes: [], callCount: 1 }] });
    const asked: unknown[] = [];
    const researcher: ResearchAgent = {
      research: async (q) => {
        asked.push(q);
        return { answer: '附近有两家。', places: cleanResults([place('Los Comales Downtown', '(901) 590-4525'), place('Margaritas', '901-630-6303')]), sources: [] };
      },
    };
    const server = Fastify();
    server.addHook('onRequest', async (req) => {
      req.user = db.userById(user.id);
    });
    registerResearchRoutes(server, { researcher, perUser: new OtpRateLimit(2) });
    const ask = () => server.inject({ method: 'POST', url: '/api/research', payload: { question: 'nearest Mexican restaurant', lat: 35.1, lng: -90 } });
    const first = (await ask()).json() as { answer: string; places: PlaceResult[] };
    expect(asked[0]).toMatchObject({ depth: 'quick', userLanguage: 'Chinese (Mandarin)', lat: 35.1 });
    expect(first.answer).toBe('附近有两家。');
    expect(first.places.map((r) => r.inPhoneBookAs)).toEqual(['Los Comales', undefined]);
    expect((await ask()).statusCode).toBe(200);
    expect((await ask()).statusCode).toBe(429);
  });
});
