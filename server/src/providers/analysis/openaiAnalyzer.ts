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
    const transcript = input.transcript
      .filter((t) => t.speaker !== 'system' && t.text.trim())
      .map((t) => `${t.speaker === 'assistant' ? 'AI ASSISTANT' : 'OTHER PARTY'}: ${t.text}${t.interrupted ? ' [interrupted]' : ''}`)
      .join('\n');

    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: 'system',
          content:
            'You audit phone calls made by an AI assistant on behalf of a user. Extract facts strictly from the transcript and the policy ledger. Do not infer details that were not said. Dates must be YYYY-MM-DD and times 24h HH:MM; resolve relative dates using the call date provided.',
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
