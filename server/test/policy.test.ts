import { describe, expect, it } from 'vitest';
import { executeTool } from '../src/agent/tools';
import { checkSlot, weekdayOf } from '../src/policy/availability';
import { PolicyEngine } from '../src/policy/policyEngine';
import { findSensitiveData } from '../src/policy/sensitive';
import { blockedReason, normalizePhone } from '../src/util/phone';
import { dentistRequest } from './fixtures';

const TODAY = '2026-10-06'; // Tuesday

describe('availability', () => {
  const constraints = dentistRequest().constraints;

  it('computes weekdays from calendar dates', () => {
    expect(weekdayOf('2026-10-06')).toBe('tue');
    expect(weekdayOf('2026-10-07')).toBe('wed');
    expect(weekdayOf('2026-10-11')).toBe('sun');
  });

  it('accepts Wednesday/Thursday after 2 PM', () => {
    expect(checkSlot(constraints, '2026-10-07', '14:00', TODAY).allowed).toBe(true);
    expect(checkSlot(constraints, '2026-10-08', '15:30', TODAY).allowed).toBe(true);
  });

  it('rejects other days, earlier times, the window end, and the past', () => {
    expect(checkSlot(constraints, '2026-10-09', '15:00', TODAY).allowed).toBe(false); // Friday
    expect(checkSlot(constraints, '2026-10-07', '13:59', TODAY).allowed).toBe(false);
    expect(checkSlot(constraints, '2026-10-07', '18:00', TODAY).allowed).toBe(false);
    expect(checkSlot(constraints, '2026-09-30', '15:00', TODAY).allowed).toBe(false);
  });

  it('enforces date bounds and rejects malformed input', () => {
    const bounded = { ...constraints, latestDate: '2026-10-10' };
    expect(checkSlot(bounded, '2026-10-14', '15:00', TODAY).allowed).toBe(false);
    expect(checkSlot(constraints, '2026-02-30', '15:00', TODAY).allowed).toBe(false);
    expect(checkSlot(constraints, '2026-10-07', '3pm', TODAY).allowed).toBe(false);
  });
});

describe('policy engine', () => {
  const engine = () => new PolicyEngine(dentistRequest(), TODAY);

  it('never authorizes Level 4 categories', () => {
    for (const category of ['medical_consent', 'payment_information', 'credentials_or_password', 'government_id', 'contract_or_signature'] as const) {
      const r = engine().requestDecision({ category, question: 'x' });
      expect(r.decision.outcome).toBe('never_authorized');
    }
  });

  it('requires the user for extra charges above the limit (default $0)', () => {
    const r = engine().requestDecision({ category: 'additional_cost', question: 'Add an $80 X-ray?', amountUsd: 80 });
    expect(r.decision.outcome).toBe('requires_user_approval');
    expect(r.unresolvedQuestion).toContain('X-ray');
  });

  it('authorizes charges within an explicit limit', () => {
    const e = new PolicyEngine(dentistRequest({ constraints: { ...dentistRequest().constraints, maxAdditionalCostUsd: 10 } }), TODAY);
    expect(e.requestDecision({ category: 'additional_cost', question: '$8 more per case', amountUsd: 8 }).decision.outcome).toBe('authorized');
    expect(e.requestDecision({ category: 'additional_cost', question: '$12 more', amountUsd: 12 }).decision.outcome).toBe('requires_user_approval');
    expect(e.requestDecision({ category: 'additional_cost', question: 'some fee' }).decision.outcome).toBe('requires_user_approval');
  });

  it('marks unknown information as needing confirmation', () => {
    const r = engine().requestDecision({ category: 'information_not_provided', question: 'Insurance member ID?' });
    expect(r.decision.outcome).toBe('unknown_information');
    expect(r.unresolvedQuestion).toBe('Insurance member ID?');
  });

  it('validates appointment commitments against availability and cost', () => {
    const e = engine();
    expect(e.confirmAgreement({ type: 'appointment', description: 'Cleaning', date: '2026-10-09', startTime: '15:00' }).output.accepted).toBe(false);
    expect(
      e.confirmAgreement({ type: 'appointment', description: 'Cleaning + X-ray', date: '2026-10-08', startTime: '15:30', additionalCostUsd: 80 }).output.accepted,
    ).toBe(false);
    const ok = e.confirmAgreement({ type: 'appointment', description: 'Cleaning', date: '2026-10-08', startTime: '15:30' });
    expect(ok.output.accepted).toBe(true);
    expect(ok.commitment).toMatchObject({ date: '2026-10-08', startTime: '15:30' });
    // A second booking on the same call is not authorized.
    expect(e.confirmAgreement({ type: 'appointment', description: 'Cleaning', date: '2026-10-07', startTime: '15:00' }).output.accepted).toBe(false);
  });

  it('rejects appointments with no availability configured', () => {
    const e = new PolicyEngine(dentistRequest({ constraints: { availability: [], maxAdditionalCostUsd: 0 } }), TODAY);
    expect(e.confirmAgreement({ type: 'appointment', description: 'x', date: '2026-10-08', startTime: '15:00' }).output.accepted).toBe(false);
  });
});

describe('tool dispatch', () => {
  const e = () => new PolicyEngine(dentistRequest(), TODAY);

  it('handles malformed arguments without throwing', () => {
    expect(executeTool('confirm_agreement', '{not json', e()).output.error).toBeDefined();
    expect(executeTool('confirm_agreement', '{"type":"bogus"}', e()).output.error).toBeDefined();
    expect(executeTool('nope', '{}', e()).output.error).toBeDefined();
  });

  it('maps unknown decision categories to "other" (requires user)', () => {
    const r = executeTool('request_decision', '{"category":"upsell","question":"Whitening?"}', e());
    expect(r.decision?.outcome).toBe('requires_user_approval');
  });

  it('end_call returns an end signal', () => {
    expect(executeTool('end_call', '{"outcome":"objective_completed","reason":"done"}', e()).endCall?.outcome).toBe('objective_completed');
  });
});

describe('sensitive data screen', () => {
  it('flags credentials, SSNs and card numbers', () => {
    const findings = findSensitiveData(
      dentistRequest({
        authorizedInfo: [
          { label: 'Portal password', value: 'hunter2' },
          { label: 'ID', value: '123-45-6789' },
          { label: 'Card', value: '4111 1111 1111 1111' },
        ],
      }),
    );
    expect(findings).toHaveLength(3);
  });

  it('allows ordinary facts', () => {
    expect(findSensitiveData(dentistRequest())).toEqual([]);
  });
});

describe('phone numbers', () => {
  it('normalizes and validates', () => {
    expect(normalizePhone('+1 (415) 555-0123')).toBe('+14155550123');
    expect(normalizePhone('415-555-0123')).toBe('+14155550123');
    expect(normalizePhone('911')).toBeNull();
    expect(normalizePhone('hello')).toBeNull();
  });

  it('blocks premium and N11 area codes', () => {
    expect(blockedReason('+19005550123')).not.toBeNull();
    expect(blockedReason('+14115550123')).not.toBeNull();
    expect(blockedReason('+14155550123')).toBeNull();
  });
});
