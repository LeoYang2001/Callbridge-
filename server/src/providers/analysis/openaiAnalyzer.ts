import OpenAI from 'openai';
import { localToday } from '../../util/time';
import type { AnalysisInput, CallAnalyzer, TranscriptAnalysis } from './types';

const nullableString = { type: ['string', 'null'] };
const stringArray = { type: 'array', items: { type: 'string' } };

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'objective',
    'objectiveAchieved',
    'appointmentMentioned',
    'verbalCommitments',
    'unresolvedQuestions',
    'refusedRequests',
    'followUpsForUser',
    'possibleFabrications',
    'summary',
    'summaryInUserLanguage',
    'headlineInUserLanguage',
    'nextStepsInUserLanguage',
    'counterpartAgreedToAppointment',
    'notesAboutCounterpart',
  ],
  properties: {
    objective: { type: 'string', description: 'snake_case label for the task, e.g. schedule_dental_cleaning' },
    objectiveAchieved: { type: 'boolean' },
    appointmentMentioned: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['date', 'time', 'notes'],
          properties: {
            date: { ...nullableString, description: 'YYYY-MM-DD' },
            time: { ...nullableString, description: '24h HH:MM' },
            notes: nullableString,
          },
        },
      ],
    },
    verbalCommitments: { ...stringArray, description: 'Everything the AI assistant agreed to out loud.' },
    unresolvedQuestions: { ...stringArray, description: 'Questions that still need the user to answer.' },
    refusedRequests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['request', 'reason'],
        properties: { request: { type: 'string' }, reason: { type: 'string' } },
      },
    },
    followUpsForUser: { ...stringArray, description: 'Concrete next steps for the user (bring X, call back Y).' },
    possibleFabrications: {
      ...stringArray,
      description: 'Statements by the AI assistant not supported by the authorized information or task.',
    },
    summary: { type: 'string', description: 'Two or three sentences in English.' },
    summaryInUserLanguage: { type: 'string', description: "The same summary in the user's preferred language." },
    notesAboutCounterpart: {
      ...stringArray,
      description:
        'Facts the OTHER PARTY stated that would help on a future call with them: requirements (bring insurance card), hours, policies, staff names, preferred booking times. Short English sentences. Nothing about the user, no opinions, nothing sensitive.',
    },
    counterpartAgreedToAppointment: {
      type: ['boolean', 'null'],
      description:
        'null if validatedCommitments has no appointment. Otherwise true only if OTHER PARTY explicitly offered or agreed to that exact date and time in the transcript; false if only the AI assistant proposed it.',
    },
    headlineInUserLanguage: {
      type: 'string',
      description:
        "One short line in the user's language stating the outcome, e.g. booked for <weekday, date, time> at <business>, or not booked and why. A booking may only be stated if it is in validatedCommitments; if the other party never agreed to it, say it still needs confirmation.",
    },
    nextStepsInUserLanguage: { ...stringArray, description: "followUpsForUser, written in the user's language." },
  },
} as const;

export class OpenAIAnalyzer implements CallAnalyzer {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async analyze(input: AnalysisInput): Promise<TranscriptAnalysis> {
    // The user's own messages from the app (speaker "system") are context the AI acted on.
    const transcript = input.transcript
      .filter((t) => t.text.trim())
      .map((t) =>
        t.event
          ? `[CALL EVENT] ${t.text}`
          : `${t.speaker === 'assistant' ? 'AI ASSISTANT' : t.speaker === 'system' ? 'USER (via app, not heard by the other party)' : 'OTHER PARTY'}: ${t.text}${t.interrupted ? ' [interrupted]' : ''}`,
      )
      .join('\n');

    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: 'system',
          content:
            `You audit phone calls made by an AI assistant on behalf of a user. Extract facts strictly from the transcript and the policy ledger. Do not infer details that were not said. Dates must be YYYY-MM-DD and times 24h HH:MM; resolve relative dates using the call date provided. Write summaryInUserLanguage, headlineInUserLanguage and nextStepsInUserLanguage in ${input.request.user.preferredLanguage}, and only in ${input.request.user.preferredLanguage}, whatever language the call was in; in them, write times the way people say them in that language (e.g. "7 PM" in English). [CALL EVENT] lines mark when the user joined the call and talked with the other party themselves (their own words aren't transcribed) or handed it back: then the headline and summary say the user took over and what came of it from the other party's side, rather than counting the assistant's unfinished task as a failure.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            callDate: localToday(input.request.timezone).date,
            userName: input.request.user.name,
            userPreferredLanguage: input.request.user.preferredLanguage,
            task: input.request.instructions,
            authorizedInformation: input.request.authorizedInfo,
            policyDecisions: input.decisions.map(({ tool, request, category, outcome, reason }) => ({ tool, request, category, outcome, reason })),
            validatedCommitments: input.commitments,
            endReason: input.endReason ?? null,
            transcript: transcript || '(no speech was transcribed)',
          }),
        },
      ],
      text: { format: { type: 'json_schema', name: 'call_analysis', strict: true, schema: SCHEMA as unknown as Record<string, unknown> } },
    });

    return JSON.parse(response.output_text) as TranscriptAnalysis;
  }
}
