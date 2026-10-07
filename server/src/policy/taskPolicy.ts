import type { TaskCategory, TaskReview } from '../../../shared/types';

/**
 * Ground rules: which kinds of calls CallBridge will place at all. A classifier labels the
 * request, but this table (code, not a prompt) decides. Anything not listed as allowed or
 * limited is refused, including `other`, so a new kind of task is denied until it's added here.
 *
 * The rules protect both ends of the call: the user (no banking or identity checks done by an
 * AI on their behalf) and the person who answers (no personal calls, sales, or deception).
 */

interface CategoryRule {
  tier: TaskReview['tier'];
  /** Why, in English. Refusals are explained to the user; limits go into the call prompt. */
  reason: string;
  /** Extra instructions the call assistant must follow (allowed and limited tiers). */
  rules: string[];
}

const SCHEDULING_RULES = [
  'Only book, reschedule, cancel, or ask about the item described in the task.',
];

export const TASK_RULES: Record<TaskCategory, CategoryRule> = {
  appointment: {
    tier: 'allowed',
    reason: 'Booking, rescheduling, or cancelling an appointment with a business.',
    rules: SCHEDULING_RULES,
  },
  healthcare_appointment: {
    tier: 'limited',
    reason: "Doctor's, dentist's, and pharmacy calls are limited to scheduling and status questions.",
    rules: [
      ...SCHEDULING_RULES,
      'This is a healthcare office: handle scheduling, appointment logistics, and status questions only (for example, whether a prescription is ready).',
      'Do not describe symptoms or medical history beyond what is listed under "Information you may share".',
      'Never discuss treatment choices, test results, diagnoses, or medication changes. Say the user will discuss these with the office directly.',
    ],
  },
  reservation: {
    tier: 'allowed',
    reason: 'Making or changing a reservation (restaurant, venue, or similar).',
    rules: ['Only make, change, or cancel the reservation described in the task.'],
  },
  business_inquiry: {
    tier: 'allowed',
    reason: 'Asking a business a question (hours, prices, availability, order or repair status).',
    rules: ['This call is for information only. Do not book, buy, or commit to anything unless the task says so.'],
  },
  service_request: {
    tier: 'allowed',
    reason: 'Scheduling a service with a business (repair, delivery, pickup, installation).',
    rules: SCHEDULING_RULES,
  },
  financial: {
    tier: 'refused',
    reason: 'Banking, accounts, payments, transfers, loans, and other money matters need you on the line, not an AI.',
    rules: [],
  },
  identity_verification: {
    tier: 'refused',
    reason:
      'Calls that need to verify your identity (insurance claims, government agencies, account changes) have to be made by you.',
    rules: [],
  },
  legal: {
    tier: 'refused',
    reason: 'Legal matters, disputes, and complaints with legal consequences need you or a lawyer.',
    rules: [],
  },
  emergency: {
    tier: 'refused',
    reason: 'For emergencies, call 911 yourself right away.',
    rules: [],
  },
  personal_call: {
    tier: 'refused',
    reason: 'CallBridge only calls businesses. It does not call private individuals.',
    rules: [],
  },
  sales_or_marketing: {
    tier: 'refused',
    reason: 'CallBridge does not make sales, marketing, survey, or bulk calls.',
    rules: [],
  },
  deceptive_or_harmful: {
    tier: 'refused',
    reason: 'CallBridge will not make calls that deceive, impersonate, harass, or threaten anyone.',
    rules: [],
  },
  other: {
    tier: 'refused',
    reason: 'CallBridge can help with appointments, reservations, service requests, and questions to businesses.',
    rules: [],
  },
};

export function reviewTask(category: TaskCategory, reasonInUserLanguage: string): TaskReview {
  const rule = TASK_RULES[category] ?? TASK_RULES.other;
  return {
    category: TASK_RULES[category] ? category : 'other',
    tier: rule.tier,
    reason: rule.reason,
    reasonInUserLanguage,
    rules: rule.rules,
  };
}
