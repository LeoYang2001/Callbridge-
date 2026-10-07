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

/** A decision the call assistant may put to the user live, while the other party holds. */
export interface AskUser {
  category: DecisionCategory;
  question: string;
  amountUsd?: number;
  date?: string;
  startTime?: string;
}

export interface PolicyRuling {
  /** JSON-serializable payload returned to the model as the tool output. */
  output: Record<string, unknown>;
  decision: PolicyDecision;
  commitment?: ValidatedCommitment;
  /** An earlier commitment this one replaces (a rescheduled appointment). */
  replacesCommitmentId?: string;
  /** Put this to the user now (human in the loop) instead of deciding. */
  askUser?: AskUser;
  /** A question that needs the user's input after the call. */
  unresolvedQuestion?: string;
}

export interface DecisionInput {
  category: DecisionCategory;
  question: string;
  amountUsd?: number;
  /** For schedule_outside_constraints: the time they offered. */
  date?: string;
  startTime?: string;
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
  /** What the user approved live during this call (human in the loop). */
  private approvedExtraCostUsd = 0;
  private readonly approvedSlots = new Set<string>();

  constructor(
    private readonly request: CallRequest,
    /** "YYYY-MM-DD" in the user's time zone; used to reject dates in the past. */
    private readonly today: string,
  ) {}

  private get name() {
    return this.request.user.name;
  }

  private get maxCost() {
    return Math.max(0, this.request.constraints.maxAdditionalCostUsd || 0, this.approvedExtraCostUsd);
  }

  /** The availability check, plus any exact slot the user approved during the call. */
  private slot(date: string, startTime: string) {
    const check = checkSlot(this.request.constraints, date, startTime, this.today);
    if (!check.allowed && this.approvedSlots.has(`${date} ${startTime}`) && date >= this.today) {
      return { allowed: true, reason: `${this.name} approved this exact time during the call.` };
    }
    return check;
  }

  checkAppointmentSlot(date: string, startTime: string): PolicyRuling {
    const check = this.slot(date, startTime);
    return {
      output: {
        allowed: check.allowed,
        reason: check.reason,
        guidance: check.allowed
          ? 'You may propose or accept this time. Call confirm_agreement before confirming it verbally.'
          : `Do not accept this time yet. Ask for another option within the availability, or, if they can't offer one, call request_decision with category "schedule_outside_constraints", this date and start_time, to check with ${this.name}.`,
      },
      decision: this.decision('check_appointment_slot', `${date} ${startTime}`, 'schedule', check.allowed ? 'accepted' : 'rejected', check.reason),
    };
  }

  /**
   * @param canAskUser the user can be asked right now (live call): instead of refusing, the
   *   ruling asks the assistant to put the other party on hold while the user decides.
   */
  requestDecision({ category, question, amountUsd, date, startTime }: DecisionInput, canAskUser = false): PolicyRuling {
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
    if (needsUser && canAskUser) {
      return {
        output: {
          decision: 'waiting_for_user',
          reason,
          instructions: `Say you'll quickly check with ${this.name}, and ask them to hold for a moment. Do not agree, decline, or guess in the meantime. ${this.name}'s answer will arrive as a system message; continue from there.`,
        },
        decision: this.decision('request_decision', question, category, 'requires_user_approval', `${reason} Asked ${this.name} during the call.`),
        askUser: { category, question, amountUsd, date, startTime },
      };
    }
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
      const slot = this.slot(input.date, input.startTime);
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

  /**
   * Records the user's live answer. An approval only widens what this call may agree to, in
   * the narrowest form: the approved amount, the exact slot, or a fact they typed.
   */
  applyUserAnswer(ask: AskUser, approved: boolean, text?: string): PolicyDecision {
    if (NEVER_AUTHORIZE.has(ask.category)) {
      return this.decision('user_answer', ask.question, ask.category, 'never_authorized', 'This can never be authorized through the assistant.');
    }
    if (!approved) {
      return this.decision('user_answer', ask.question, ask.category, 'rejected', `${this.name} declined.`);
    }
    let reason = `${this.name} approved during the call.`;
    if (ask.category === 'additional_cost' && ask.amountUsd !== undefined) {
      this.approvedExtraCostUsd = Math.max(this.approvedExtraCostUsd, ask.amountUsd);
      reason = `${this.name} approved up to $${ask.amountUsd} in additional charges.`;
    } else if (ask.category === 'schedule_outside_constraints' && ask.date && ask.startTime) {
      this.approvedSlots.add(`${ask.date} ${ask.startTime}`);
      reason = `${this.name} approved ${ask.date} at ${ask.startTime}.`;
    } else if (text) {
      reason = `${this.name} provided: ${text}`;
    }
    return this.decision('user_answer', ask.question, ask.category, 'authorized', reason);
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
