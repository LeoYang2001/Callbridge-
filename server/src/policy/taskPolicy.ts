import type { TaskCategory, TaskReview } from '../../../shared/types';

/**
 * Ground rules: which kinds of calls CallBridge will place at all. A classifier labels the
 * request, but this table (code, not a prompt) decides. Anything not listed as allowed or
 * limited is refused, including `other`, so a new kind of task is denied until it's added here.
 *
 * The rules protect both ends of the call: the user (no banking or identity checks done by an
 * AI on their behalf) and the person who answers (an AI that says so, no sales, deception, or
 * pressure; personal calls only deliver a message and end if they're unwanted).
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
    tier: 'limited',
    reason: 'A short personal message to someone you know, delivered by an AI that says it is an AI.',
    rules: [
      'This is a personal call to someone the user knows, not a business. Deliver the message in the task, then ask once whether they want to pass anything back; take a short reply if they give one, thank them, say goodbye, and end the call.',
      'Deliver the message in the user\'s name, never as if you were the user: "Leo asked me to tell you he loves you", not "I love you".',
      'If the message is cheeky banter or mild swearing between friends, deliver it as is, in the user\'s name and in good humor ("Leo says: screw you!"), without apologizing for it or softening it.',
      'Do not argue, persuade, pressure, or ask them personal questions. Do not share anything about the user beyond the message and what is listed under "Information you may share".',
      'If they say they don\'t want this call, or ask you to stop, apologize briefly and end the call.',
      'If you reach voicemail, hang up without leaving the message.',
      'If a call screener answers, the person sees your words live on their phone: say who you are and give the message itself in one or two sentences, then wait quietly in case they pick up.',
    ],
  },
  sales_or_marketing: {
    tier: 'refused',
    reason: 'CallBridge does not make sales, marketing, survey, or bulk calls.',
    rules: [],
  },
  deceptive_or_harmful: {
    tier: 'refused',
    reason: 'CallBridge will not make calls that deceive, impersonate, harass, threaten, or pressure anyone, including personal calls.',
    rules: [],
  },
  other: {
    tier: 'refused',
    reason: 'CallBridge can help with appointments, reservations, service requests, questions to businesses, and short personal messages.',
    rules: [],
  },
};

export function reviewTask(category: TaskCategory, reasonInUserLanguage: string, booksATime?: boolean): TaskReview {
  const rule = TASK_RULES[category] ?? TASK_RULES.other;
  return {
    category: TASK_RULES[category] ? category : 'other',
    tier: rule.tier,
    reason: rule.reason,
    reasonInUserLanguage,
    rules: rule.rules,
    booksATime,
  };
}
