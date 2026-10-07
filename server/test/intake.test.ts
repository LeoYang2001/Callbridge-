import { describe, expect, it } from 'vitest';
import { draftPatchFromArgs, draftToRequest } from '../../shared/intake';
import { TASK_CATEGORIES, type TaskCategory } from '../../shared/types';
import { checkRequest } from '../src/agent/intake';
import { buildInstructions } from '../src/agent/prompt';
import { TaskReviewUnavailableError, type TaskClassifier } from '../src/policy/taskClassifier';
import { reviewTask, TASK_RULES } from '../src/policy/taskPolicy';
import { dentistRequest } from './fixtures';

const classifierSaying = (category: TaskCategory): TaskClassifier => ({
  review: async () => reviewTask(category, `[translated ${category}]`),
});
const deps = (category: TaskCategory) => ({ classifier: classifierSaying(category), allowedDestinations: null });

describe('ground rules', () => {
  it('has a rule for every category, and refuses anything not explicitly allowed', () => {
    expect(Object.keys(TASK_RULES).sort()).toEqual([...TASK_CATEGORIES].sort());
    const callable = TASK_CATEGORIES.filter((c) => TASK_RULES[c].tier !== 'refused');
    expect(callable.sort()).toEqual(['appointment', 'business_inquiry', 'healthcare_appointment', 'reservation', 'service_request']);
  });

  it('limits healthcare calls to scheduling and status', () => {
    const review = reviewTask('healthcare_appointment', '');
    expect(review.tier).toBe('limited');
    expect(review.rules.join(' ')).toMatch(/Never discuss treatment/);
  });

  it('falls back to other for an unknown label', () => {
    expect(reviewTask('open_bank_account' as TaskCategory, '').tier).toBe('refused');
  });
});

describe('checkRequest', () => {
  it('allows a dentist appointment and returns its category', async () => {
    const result = await checkRequest(dentistRequest(), deps('healthcare_appointment'));
    expect(result.ok).toBe(true);
    expect(result.review?.category).toBe('healthcare_appointment');
  });

  it.each(['financial', 'emergency', 'personal_call', 'other'] as const)('refuses %s with the reason in both languages', async (category) => {
    const result = await checkRequest(dentistRequest(), deps(category));
    expect(result.ok).toBe(false);
    expect(result.problems).toContain(TASK_RULES[category].reason);
    expect(result.review?.reasonInUserLanguage).toBe(`[translated ${category}]`);
  });

  it('lists missing details without asking the classifier', async () => {
    let asked = false;
    const classifier: TaskClassifier = { review: async () => ((asked = true), reviewTask('appointment', '')) };
    const result = await checkRequest(dentistRequest({ to: '', instructions: '' }), { classifier, allowedDestinations: null });
    expect(result.missing).toEqual(['phone number', 'what the call should achieve']);
    expect(asked).toBe(false);
  });

  it('fails closed when the review is unavailable', async () => {
    const classifier: TaskClassifier = {
      review: async () => {
        throw new TaskReviewUnavailableError('timeout');
      },
    };
    const result = await checkRequest(dentistRequest(), { classifier, allowedDestinations: null });
    expect(result.ok).toBe(false);
    expect((await checkRequest(dentistRequest(), { classifier: null, allowedDestinations: null })).ok).toBe(false);
  });

  it('enforces the allowlist and the sensitive-data screen', async () => {
    const offList = await checkRequest(dentistRequest(), { ...deps('appointment'), allowedDestinations: ['+19014553148'] });
    expect(offList.problems.join(' ')).toMatch(/allowlist/);
    const card = await checkRequest(dentistRequest({ instructions: 'Book it and pay with 4111 1111 1111 1111' }), deps('appointment'));
    expect(card.problems.join(' ')).toMatch(/card number/);
  });
});

describe('voice intake draft', () => {
  it('maps update_request arguments and builds a request', () => {
    const draft = draftPatchFromArgs({
      counterpart_name: 'Smile Dental',
      phone_number: '901 455 3148',
      task: 'Schedule a teeth cleaning.',
      task_in_user_language: '预约洗牙',
      availability: [{ days: ['wed'], start: '14:00', end: '18:00' }],
      ignored_field: 'x',
      latest_date: null,
    });
    expect(draft).not.toHaveProperty('ignored_field');
    const req = draftToRequest(draft, { userName: 'Leo', userLanguage: 'Chinese (Mandarin)', timezone: 'America/Chicago' });
    expect(req).toMatchObject({
      to: '+19014553148',
      counterpartName: 'Smile Dental',
      taskInUserLanguage: '预约洗牙',
      callLanguage: 'English',
      user: { name: 'Leo', preferredLanguage: 'Chinese (Mandarin)' },
      constraints: { availability: [{ days: ['wed'], start: '14:00', end: '18:00' }], maxAdditionalCostUsd: 0 },
    });
  });

  it("puts the category's rules into the call instructions", () => {
    const today = { date: '2026-10-06', weekday: 'Tuesday', time: '10:00' };
    const text = buildInstructions(dentistRequest({ category: 'healthcare_appointment', counterpartName: 'Smile Dental' }), { today });
    expect(text).toContain('You are calling Smile Dental.');
    expect(text).toContain('# Rules for this kind of call');
    expect(buildInstructions(dentistRequest(), { today })).not.toContain('# Rules for this kind of call');
  });
});
