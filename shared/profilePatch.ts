// Shared so the app (which relays the interview's tool calls) and the server agree on the shape.

/** update_profile arguments → the profile PATCH body. */
export function profilePatchFromArgs(args: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    name: 'name',
    pronouns: 'pronouns',
    preferred_language: 'preferredLanguage',
    other_languages: 'otherLanguages',
    default_call_language: 'defaultCallLanguage',
    timezone: 'timezone',
    usual_availability: 'usualAvailability',
    shareable: 'shareable',
    preferences: 'preferences',
    voice: 'voice',
  };
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) if (map[k] && v !== undefined && v !== null) patch[map[k]!] = v;
  return patch;
}
