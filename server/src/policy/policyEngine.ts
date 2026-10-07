import { randomUUID } from 'node:crypto';
import type {
  CallRequest,
  DecisionOutcome,
  PolicyDecision,
  ValidatedCommitment,
} from '../../../shared/types';
import { checkSlot } from './availability';

/**
 * The backend policy layer. The voice model handles conversation; this class decides what may
 * actually be agreed to. Every consequential step the model takes goes through a tool call that
 * lands here, and the post-call result is built from this ledger rather than from the model's
 * own claims.
 */

export const DECISION_CATEGORIES = [
  'additional_cost',
  'additional_service',
  'information_not_provided',
  'schedule_outside_constraints',
  'medical_consent',
  'contract_or_signature',
  'payment_information',
  'credentials_or_password',
  'government_id',
  'legal_matter',
  'other',
] as const;
export type DecisionCategory = (typeof DECISION_CATEGORIES)[number];

/** Level 4 — never authorized, regardless of what the user typed into the task. */
export const NEVER_AUTHORIZE: ReadonlySet<DecisionCategory> = new Set([
  'medical_consent',
  'contract_or_signature',
  'payment_information',
  'credentials_or_password',
  'government_id',
  'legal_matter',
]);

export interface PolicyRuling {
  /** JSON-serializable payload returned to the model as the tool output. */
  output: Record<string, unknown>;
  decision: PolicyDecision;
  commitment?: ValidatedCommitment;
  /** An earlier commitment this one replaces (a rescheduled appointment). */
  replacesCommitmentId?: string;
  /** A question that needs the user's input after the call. */
  unresolvedQuestion?: string;
}

export interface DecisionInput {
  category: DecisionCategory;
  question: string;
  amountUsd?: number;
}

export interface AgreementInput {
  type: 'appointment' | 'task_outcome';
  description: string;
  date?: string;
  startTime?: string;
  additionalCostUsd?: number;
}

export class PolicyEngine {
  private readonly commitments: ValidatedCommitment[] = [];

  constructor(
    private readonly request: CallRequest,
    /** "YYYY-MM-DD" in the user's time zone; used to reject dates in the past. */
    private readonly today: string,
  ) {}

  private get name() {
    return this.request.user.name;
  }

  private get maxCost() {
    return Math.max(0, this.request.constraints.maxAdditionalCostUsd || 0);
  }

  checkAppointmentSlot(date: string, startTime: string): PolicyRuling {
    const check = checkSlot(this.request.constraints, date, startTime, this.today);
    return {
      output: {
        allowed: check.allowed,
        reason: check.reason,
        guidance: check.allowed
          ? 'You may propose or accept this time. Call confirm_agreement before confirming it verbally.'
          : 'Do not accept this time. Politely ask for another option within the availability.',
      },
      decision: this.decision('check_appointment_slot', `${date} ${startTime}`, 'schedule', check.allowed ? 'accepted' : 'rejected', check.reason),
    };
  }

  requestDecision({ category, question, amountUsd }: DecisionInput): PolicyRuling {
    let outcome: DecisionOutcome;
    let reason: string;
    let say: string;

    if (NEVER_AUTHORIZE.has(category)) {
      outcome = 'never_authorized';
      reason = `${category.replace(/_/g, ' ')} can never be authorized by the assistant.`;
      say = `I'm not able to authorize that on ${this.name}'s behalf. ${this.name} would need to handle that directly.`;
    } else if (category === 'information_not_provided') {
      outcome = 'unknown_information';
      reason = `${this.name} did not provide this information.`;
      say = `I don't have that information. I'll need to confirm it with ${this.name}.`;
    } else if (
      category === 'additional_cost' &&
      amountUsd !== undefined &&
      amountUsd >= 0 &&
      this.maxCost > 0 &&
      amountUsd <= this.maxCost
    ) {
      outcome = 'authorized';
      reason = `$${amountUsd} is within the $${this.maxCost} additional-cost limit ${this.name} set.`;
      say = 'You may accept this charge. Restate the amount clearly when you accept it.';
    } else {
      outcome = 'requires_user_approval';
      reason =
        category === 'additional_cost'
          ? `${amountUsd === undefined ? 'An unspecified charge' : `$${amountUsd}`} exceeds what ${this.name} authorized ($${this.maxCost}).`
          : `${this.name} has not authorized this decision.`;
      say = `I'm not able to agree to that without checking with ${this.name} first. I'll pass it along to them.`;
    }

    const needsUser = outcome === 'requires_user_approval' || outcome === 'unknown_information';
    return {
      output: {
        decision: outcome,
        reason,
        suggested_response: say,
        instructions:
          outcome === 'authorized'
            ? 'Proceed within the stated amount only.'
            : 'Do not agree, guess, or improvise an answer. Tell them the suggested response in your own words, then continue with the rest of the task.',
      },
      decision: this.decision('request_decision', question, category, outcome, reason),
      unresolvedQuestion: needsUser ? question : undefined,
    };
  }

  confirmAgreement(input: AgreementInput): PolicyRuling {
    const reject = (reason: string, unresolved?: string): PolicyRuling => ({
      output: {
        accepted: false,
        reason,
        instructions: 'Do NOT confirm this verbally. Politely explain you cannot confirm it, and offer an alternative within the constraints or say you will check with the user.',
      },
      decision: this.decision('confirm_agreement', input.description, input.type, 'rejected', reason),
      unresolvedQuestion: unresolved,
    });

    const cost = input.additionalCostUsd ?? 0;
    if (cost < 0) return reject('Additional cost cannot be negative.');
    if (cost > this.maxCost) {
      return reject(
        `It includes $${cost} in additional charges; ${this.name} authorized $${this.maxCost}.`,
        `Approve $${cost} additional charge? (${input.description})`,
      );
    }

    if (input.type === 'appointment') {
      if (!input.date || !input.startTime) return reject('Appointments need both date (YYYY-MM-DD) and start_time (HH:MM).');
      const slot = checkSlot(this.request.constraints, input.date, input.startTime, this.today);
      if (!slot.allowed) return reject(slot.reason);
    }
    // One appointment per call: a new time inside the user's window replaces the earlier one
    // (the business moved it, or the first confirmation was premature).
    const replaced = input.type === 'appointment' ? this.commitments.findIndex((c) => c.type === 'appointment') : -1;
    const previous = replaced >= 0 ? this.commitments.splice(replaced, 1)[0] : undefined;

    const commitment: ValidatedCommitment = {
      id: randomUUID(),
      at: Date.now(),
      type: input.type,
      description: input.description,
      date: input.date,
      startTime: input.startTime,
      costUsd: cost || undefined,
    };
    this.commitments.push(commitment);
    return {
      output: {
        accepted: true,
        instructions: 'You may now confirm this verbally. Read back the key details (date, time, any cost) to the other party.',
      },
      decision: this.decision(
        'confirm_agreement',
        input.description,
        input.type,
        'accepted',
        previous ? `Within authorized constraints; replaces ${previous.date} ${previous.startTime}.` : 'Within authorized constraints.',
      ),
      commitment,
      replacesCommitmentId: previous?.id,
    };
  }

  private decision(
    tool: string,
    request: string,
    category: string,
    outcome: PolicyDecision['outcome'],
    reason: string,
  ): PolicyDecision {
    return { id: randomUUID(), at: Date.now(), tool, request, category, outcome, reason };
  }
}
