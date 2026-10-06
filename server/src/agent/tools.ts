import { z } from 'zod';
import type { PolicyDecision, ValidatedCommitment } from '../../../shared/types';
import { DECISION_CATEGORIES, type PolicyEngine } from '../policy/policyEngine';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const END_CALL_OUTCOMES = [
  'objective_completed',
  'objective_not_possible',
  'needs_user_follow_up',
  'voicemail',
  'wrong_number',
  'counterpart_ended',
  'other',
] as const;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'check_appointment_slot',
    description:
      "Ask the policy system whether a specific appointment start time fits the user's authorized availability. Call this before proposing or accepting any date/time.",
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Calendar date, YYYY-MM-DD.' },
        start_time: { type: 'string', description: 'Start time, 24h HH:MM.' },
      },
      required: ['date', 'start_time'],
      additionalProperties: false,
    },
  },
  {
    name: 'request_decision',
    description:
      'Ask the policy system how to handle a question, request, or choice that the task does not explicitly cover: extra charges, extra services, information you were not given, sensitive requests. Follow the returned decision exactly.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: [...DECISION_CATEGORIES] },
        question: {
          type: 'string',
          description: 'What the other party asked or offered, in plain English, including any specifics (amounts, names, dates).',
        },
        amount_usd: { type: 'number', description: 'Dollar amount involved, if any.' },
      },
      required: ['category', 'question'],
      additionalProperties: false,
    },
  },
  {
    name: 'confirm_agreement',
    description:
      'Validate a commitment with the policy system BEFORE verbally agreeing to it. Use type "appointment" for bookings, "task_outcome" for any other result the task asked for (e.g. a cancellation or confirmation). Only confirm out loud if accepted is true.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['appointment', 'task_outcome'] },
        description: { type: 'string', description: 'What is being agreed, e.g. "Dental cleaning with Dr. Kim".' },
        date: { type: 'string', description: 'YYYY-MM-DD (required for appointments).' },
        start_time: { type: 'string', description: '24h HH:MM (required for appointments).' },
        additional_cost_usd: {
          type: 'number',
          description: 'Charges beyond what the user asked for (fees, add-ons). 0 if none.',
        },
      },
      required: ['type', 'description'],
      additionalProperties: false,
    },
  },
  {
    name: 'end_call',
    description: 'Hang up. Only call this after you have said goodbye (unless the other party already hung up or it is voicemail).',
    parameters: {
      type: 'object',
      properties: {
        outcome: { type: 'string', enum: [...END_CALL_OUTCOMES] },
        reason: { type: 'string', description: 'One short sentence explaining why the call is ending.' },
      },
      required: ['outcome', 'reason'],
      additionalProperties: false,
    },
  },
];

const SlotArgs = z.object({ date: z.string(), start_time: z.string() });
const DecisionArgs = z.object({
  category: z.enum(DECISION_CATEGORIES).catch('other'),
  question: z.string().min(1),
  amount_usd: z.number().optional(),
});
const AgreementArgs = z.object({
  type: z.enum(['appointment', 'task_outcome']),
  description: z.string().min(1),
  date: z.string().optional(),
  start_time: z.string().optional(),
  additional_cost_usd: z.number().optional(),
});
const EndCallArgs = z.object({
  outcome: z.enum(END_CALL_OUTCOMES).catch('other'),
  reason: z.string().default(''),
});

export interface ToolExecution {
  output: Record<string, unknown>;
  decision?: PolicyDecision;
  commitment?: ValidatedCommitment;
  unresolvedQuestion?: string;
  endCall?: z.infer<typeof EndCallArgs>;
}

export function executeTool(name: string, rawArgs: string, policy: PolicyEngine): ToolExecution {
  let json: unknown;
  try {
    json = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { output: { error: 'Arguments were not valid JSON. Try again.' } };
  }

  const invalid = (err: z.ZodError) => ({
    output: { error: `Invalid arguments: ${err.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` },
  });

  switch (name) {
    case 'check_appointment_slot': {
      const a = SlotArgs.safeParse(json);
      if (!a.success) return invalid(a.error);
      return policy.checkAppointmentSlot(a.data.date, a.data.start_time);
    }
    case 'request_decision': {
      const a = DecisionArgs.safeParse(json);
      if (!a.success) return invalid(a.error);
      return policy.requestDecision({ category: a.data.category, question: a.data.question, amountUsd: a.data.amount_usd });
    }
    case 'confirm_agreement': {
      const a = AgreementArgs.safeParse(json);
      if (!a.success) return invalid(a.error);
      return policy.confirmAgreement({
        type: a.data.type,
        description: a.data.description,
        date: a.data.date,
        startTime: a.data.start_time,
        additionalCostUsd: a.data.additional_cost_usd,
      });
    }
    case 'end_call': {
      const a = EndCallArgs.safeParse(json);
      if (!a.success) return invalid(a.error);
      return { output: { ok: true }, endCall: a.data };
    }
    default:
      return { output: { error: `Unknown tool "${name}".` } };
  }
}
