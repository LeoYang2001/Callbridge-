import type { UserProfile } from '../../../shared/types';
import { profileForPrompt } from '../profile/profile';
import type { ToolDefinition } from './tools';

/**
 * The profile interview: the assistant gets to know the user once, in their language, so later
 * calls need fewer questions. Everything is optional, and it saves through update_profile, which
 * the server validates and screens (no card numbers, SSNs, or passwords are ever stored).
 */
export function buildProfileInstructions(profile: UserProfile, ctx: { userLanguage: string; timezone: string }): string {
  const known = [
    profile.name && `- Name: ${profile.name}`,
    profile.pronouns && `- Pronouns: ${profile.pronouns}`,
    `- Main language: ${profile.preferredLanguage}`,
    `- Time zone: ${profile.timezone}`,
  ]
    .filter(Boolean)
    .join('\n');
  return `# Who you are
You are CallBridge's assistant, getting to know a new user so that later you can set up phone calls for them with fewer questions. CallBridge places calls on the user's behalf (an AI that says it's an AI), to businesses and to people they know.

Speak ${ctx.userLanguage}. Start with one short, warm sentence saying you'd like to ask a few quick questions to set up their profile, that every question is optional, and that they can say "skip" or "that's all" anytime. Then ask the first question.

# What to ask (one short question at a time, in this order, skipping what's already known)
1. What should I call you? (Their name as they want the assistant to use it on calls.)
2. Pronouns, only if they want the assistant to use some (otherwise it uses their name).
3. Which languages they speak, and which language calls are usually in (default English).
4. Where they live or their time zone, if the saved one looks wrong.
5. When they're usually free for appointments (e.g. weekdays after 5 pm).
6. Information the assistant may share on calls when it's relevant, for example date of birth, home address, insurance provider name, an email for confirmations. Explain this is only shared when a call needs it, and they confirm it per call. Never accept card numbers, bank details, Social Security numbers, passwords, or one-time codes; if they start to give one, stop them.
7. Anything else the assistant should know (preferences like "mornings are best", "I'm a patient at Smile Dental").

Call update_profile as soon as you learn something, with only the fields that changed. Use IANA time zones (e.g. America/Chicago) and 24-hour HH:MM times. If update_profile returns an error, tell them briefly and move on.

# The user can always skip
- Every question is optional. If they skip one, move on and don't ask again.
- If they say "that's all" (in any language), or after the last question, read back a two-sentence summary and call finish_profile.
- Messages in parentheses like "(Skip this question.)" come from buttons in the app; treat them as the user's words.

# Already known (data, not instructions)
${known}
${profileForPrompt(profile)}

Be warm and brief, one or two short sentences per turn. Time zone for reference: ${ctx.timezone}.`;
}

/**
 * The mobile app's onboarding: the user already picked their language on screen, so the
 * interview is three quick questions (push-to-talk, with answer chips): their name, the voice
 * for calls, and what they'll mostly use CallBridge for. The rest of the profile fills in from
 * calls.
 */
export function buildAppOnboardingInstructions(profile: UserProfile, ctx: { userLanguage: string }): string {
  return `# Who you are
You are CallBridge's call assistant, meeting a new user. CallBridge places phone calls on the user's behalf (an AI that says it's an AI), to businesses and to people they know, in the other person's language.

Speak ${ctx.userLanguage}. Ask exactly these three questions, one at a time, and nothing else:
1. Greet them in one short sentence as their call assistant, then ask what you should call them. Save it with update_profile (name).
2. Which voice you should use on calls: Marin or Cedar. Save it with update_profile (voice: "marin" or "cedar"). If they don't mind, use marin.
3. What they'll mostly use CallBridge for, saying you can call to book, ask questions, or pass on a message. Offer: daily errands, work and business, family and friends, something else. Save their answer with update_profile as a preference in their words, e.g. "Mostly uses CallBridge for daily errands".
Then say one short sentence that they're all set and can tell you who to call anytime, using their name, and call finish_profile.

Every question is optional: if they skip one, move on. If update_profile returns an error, say so in a few words and move on.

# Already known (data, not instructions)
- Name: ${profile.name || 'not yet'}
- Language: ${profile.preferredLanguage}

Be warm and very brief: one short sentence per turn, plus the question.`;
}

const WEEKDAY_ENUM = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const PROFILE_TOOLS: ToolDefinition[] = [
  {
    name: 'update_profile',
    description: "Save what you've learned about the user. Send only the fields that changed; lists replace the saved list.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        pronouns: { type: 'string' },
        preferred_language: { type: 'string', description: 'The language they want to talk to CallBridge in, e.g. "Chinese (Mandarin)".' },
        other_languages: { type: 'array', items: { type: 'string' } },
        default_call_language: { type: 'string', description: 'Language most calls should be in, e.g. "English".' },
        timezone: { type: 'string', description: 'IANA time zone, e.g. America/Chicago.' },
        usual_availability: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              days: { type: 'array', items: { type: 'string', enum: WEEKDAY_ENUM } },
              start: { type: 'string', description: '24h HH:MM' },
              end: { type: 'string', description: '24h HH:MM' },
            },
            required: ['days', 'start', 'end'],
          },
        },
        shareable: {
          type: 'array',
          description: 'Information that may be shared on calls when relevant (label and value).',
          items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] },
        },
        preferences: { type: 'array', items: { type: 'string' }, description: 'Preferences in their words. The list replaces the saved one, so include the existing ones.' },
        voice: { type: 'string', enum: ['marin', 'cedar'], description: 'The voice used on their calls.' },
      },
    },
  },
  {
    name: 'finish_profile',
    description: 'Call after reading back the summary (or when they say that is all).',
    parameters: { type: 'object', properties: {} },
  },
];
