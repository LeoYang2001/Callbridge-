import type { PlaceResult } from '../../../shared/types';
import { blockedReason, normalizePhone } from '../util/phone';

/**
 * Business listings from Google Places (the same data as Google Maps, through Google's API rather
 * than scraping it). Used as an optional tool by the research agent when GOOGLE_PLACES_API_KEY is
 * set; without it, the agent finds businesses with web search.
 */

export interface PlaceQuery {
  query: string;
  /** The user's location, from their phone, when they allowed it. */
  lat?: number;
  lng?: number;
  /** A place the user named ("in Germantown"), used instead of their location. */
  near?: string;
}

export interface PlaceSearch {
  readonly source: PlaceResult['source'];
  search(q: PlaceQuery): Promise<PlaceResult[]>;
}

const MAX_RESULTS = 5;

/** Great-circle distance in meters. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)));
}

/** Drops results without a dialable number and duplicates of the same number. */
export function cleanResults(results: PlaceResult[]): PlaceResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const phone = r.phone ? normalizePhone(r.phone) : null;
    if (!phone || blockedReason(phone) || seen.has(phone)) return false;
    seen.add(phone);
    r.phone = phone;
    return true;
  });
}

/** Google Places API (New), Text Search. https://developers.google.com/maps/documentation/places/web-service/text-search */
export class GooglePlaces implements PlaceSearch {
  readonly source = 'google' as const;

  constructor(private readonly apiKey: string) {}

  async search(q: PlaceQuery): Promise<PlaceResult[]> {
    const hasLocation = q.lat !== undefined && q.lng !== undefined && !q.near;
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': [
          'places.displayName',
          'places.formattedAddress',
          'places.nationalPhoneNumber',
          'places.internationalPhoneNumber',
          'places.location',
          'places.rating',
          'places.userRatingCount',
          'places.currentOpeningHours.openNow',
          'places.currentOpeningHours.nextCloseTime',
          'places.currentOpeningHours.nextOpenTime',
          'places.currentOpeningHours.weekdayDescriptions',
          'places.primaryTypeDisplayName',
          'places.priceLevel',
          'places.photos',
          'places.websiteUri',
          'places.googleMapsUri',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery: q.near ? `${q.query} near ${q.near}` : q.query,
        pageSize: MAX_RESULTS,
        ...(hasLocation
          ? { locationBias: { circle: { center: { latitude: q.lat, longitude: q.lng }, radius: 15_000 } }, rankPreference: 'DISTANCE' }
          : {}),
      }),
    });
    if (!res.ok) throw new Error(`Google Places error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { places?: GooglePlace[] };
    const places = body.places ?? [];
    // One photo per place, looked up together; a slow or missing photo just means no photo.
    const photos = await Promise.all(places.map((p) => (p.photos?.[0]?.name ? this.photoUrl(p.photos[0].name) : Promise.resolve(undefined))));
    return cleanResults(
      places.map((p, i) => ({
        name: p.displayName?.text ?? 'Unknown',
        phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
        address: p.formattedAddress,
        distanceMeters: hasLocation && p.location ? distanceMeters({ lat: q.lat!, lng: q.lng! }, { lat: p.location.latitude, lng: p.location.longitude }) : undefined,
        rating: p.rating,
        ratingCount: p.userRatingCount,
        openNow: p.currentOpeningHours?.openNow,
        closesAt: p.currentOpeningHours?.nextCloseTime,
        opensAt: p.currentOpeningHours?.nextOpenTime,
        weekHours: p.currentOpeningHours?.weekdayDescriptions,
        category: p.primaryTypeDisplayName?.text,
        priceLevel: PRICE_LEVELS[p.priceLevel ?? ''],
        photoUrl: photos[i],
        website: p.websiteUri,
        url: p.googleMapsUri,
        source: 'google',
        verified: true,
      })),
    );
  }

  /** A photo's image URL (Google's short-lived link, so the API key never reaches the phone). */
  private async photoUrl(name: string): Promise<string | undefined> {
    try {
      const res = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=640&skipHttpRedirect=true`, {
        headers: { 'X-Goog-Api-Key': this.apiKey },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return undefined;
      return ((await res.json()) as { photoUri?: string }).photoUri;
    } catch {
      return undefined;
    }
  }
}

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

interface GooglePlace {
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: { openNow?: boolean; nextCloseTime?: string; nextOpenTime?: string; weekdayDescriptions?: string[] };
  primaryTypeDisplayName?: { text: string };
  priceLevel?: string;
  photos?: { name: string }[];
  websiteUri?: string;
  googleMapsUri?: string;
}
