import * as Location from 'expo-location';

/**
 * The phone's location, for "call the nearest …" searches. Asked for the first time it's needed
 * (not at launch), reused for 10 minutes, and null if the user said no: the assistant then asks
 * for a city or zip instead.
 */
let lastFix: { lat: number; lng: number; at: number } | null = null;

export async function currentLocation(): Promise<{ lat: number; lng: number } | null> {
  if (lastFix && Date.now() - lastFix.at < 600_000) return lastFix;
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const known = await Location.getLastKnownPositionAsync({ maxAge: 600_000 });
    const p = known ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    lastFix = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() };
    return lastFix;
  } catch {
    return null;
  }
}
