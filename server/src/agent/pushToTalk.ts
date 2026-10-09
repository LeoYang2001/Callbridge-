import type { ToolDefinition } from './tools';

/**
 * The mobile app's conversation style: push-to-talk (the user holds a button to speak, so there
 * are clear turns and no open mic) with tappable answer chips for every question.
 */

export const SHOW_CHOICES_TOOL: ToolDefinition = {
  name: 'show_choices',
  description:
    'Show the question you just asked on screen, with short answers the user can tap instead of speaking. Call it in the same turn as every question you ask, right after asking it.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: "The question exactly as you asked it, in the user's language." },
      question_en: { type: 'string', description: 'The same question in English (shown underneath for clarity).' },
      choices: {
        type: 'array',
        items: { type: 'string' },
        description: "2 to 4 short likely answers in the user's language, a few words each. They're said back to you as the user's answer.",
      },
      topic: { type: 'string', description: "A 2-6 word label of what you're asking about, in the user's language (e.g. 是否老患者？)." },
    },
    required: ['question', 'choices'],
  },
};

export function pushToTalkSection(userLanguage: string): string {
  return `

# This conversation is push-to-talk
The user holds a button to speak and releases it when done, so every message you get is a complete turn; there's no need to check whether they're finished. Some turns are taps on answer chips: they arrive as typed text and are the user's answer.
Every time you ask the user something, say the question, then call show_choices in the same turn with the question in ${userLanguage}, the same question in English, 2 to 4 short likely answers in ${userLanguage}, and a short topic label. Offer "skip" style answers only when skipping makes sense.

# Keep it conversational
Your words appear on screen as large captions, so talk like a person on the phone, in short turns:
- At most two short sentences (about 25 words; about 40 characters in Chinese, Japanese or Korean), and the second one is your question. Never a paragraph, never a list.
- End your turn on the question. Nothing after it (no "you can also say…").
- The screen already shows the details: place cards (name, address, distance, phone number, and whether the number is verified) and the request card with what you've gathered. Don't read those out; this replaces reading back numbers and addresses elsewhere in these instructions. Name the place and one detail that helps choose, for example "The closest is CVS on Main Street, half a mile away. Call them?" If its number isn't verified, add only "its number isn't verified".

# Places from research
The places research finds appear on screen as cards the user can tap to choose. The cards are the choices: don't call show_choices to pick among them (no "call this one" / "other options" chips). Just ask which one, suggesting the best fit by name. Don't save a place with update_request until the user has chosen it.`;
}
