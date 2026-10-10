import { describe, expect, it } from 'vitest';
import { draftPatchFromArgs, draftToRequest, normalizeTime, requestToDraft } from '../../shared/intake';
import { writtenIn } from '../../shared/languages';
import { TASK_CATEGORIES, type TaskCategory } from '../../shared/types';
import { buildFollowUpSection, checkRequest } from '../src/agent/intake';
import { newCallRecord } from '../src/calls/callSession';
import { buildInstructions } from '../src/agent/prompt';
import { CallRequestSchema } from '../src/calls/requestSchema';
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
    expect(callable.sort()).toEqual(['appointment', 'business_inquiry', 'healthcare_appointment', 'personal_call', 'reservation', 'service_request']);
  });

  it('allows a personal message, delivered in the user\'s name, ending if unwanted', async () => {
    const review = reviewTask('personal_call', '');
    expect(review.tier).toBe('limited');
    expect(review.rules.join(' ')).toMatch(/never as if you were the user/);
    expect(review.rules.join(' ')).toMatch(/apologize briefly and end the call/);
    const req = dentistRequest({ counterpartName: 'my girlfriend', instructions: 'Tell her I love her and that I just got to work.', constraints: { availability: [], maxAdditionalCostUsd: 0 } });
    expect((await checkRequest(req, deps('personal_call'))).ok).toBe(true);
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

  it.each(['financial', 'emergency', 'deceptive_or_harmful', 'other'] as const)('refuses %s with the reason in both languages', async (category) => {
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

describe('intake and Start call agree', () => {
  const ctx = { userName: 'Leo', userLanguage: 'Chinese (Mandarin)', timezone: 'America/Chicago' };
  const draft = (start: string, end: string) =>
    draftToRequest(
      { phoneNumber: '9014553148', task: 'Schedule a teeth cleaning.', availability: [{ days: ['wed'], start, end }] },
      ctx,
    );

  it('flags a window that ends before it starts, in words the assistant can ask about', async () => {
    // "2 to 5 in the afternoon" written as 14:00–05:00 passed the old intake check, then failed at Start call.
    const result = await checkRequest(draft('14:00', '05:00'), deps('healthcare_appointment'));
    expect(result.ok).toBe(false);
    expect(result.problems).toContain('Time window 1 (wed 14:00–05:00) ends before it starts.');
  });

  it('only says ok for requests the call endpoint accepts', async () => {
    for (const [start, end] of [['14:00', '17:00'], ['9:00', '12:00'], ['14:00', '24:00'], ['2pm', '5pm']]) {
      const req = draft(start!, end!);
      const result = await checkRequest(req, deps('healthcare_appointment'));
      expect(result.ok, `${start}–${end}`).toBe(CallRequestSchema.safeParse(req).success);
    }
  });

  it('tidies unambiguous times and leaves the rest for the validator', () => {
    expect(['9:00', '9', '09.30', '24:00', '14:00', '5pm', '25:00'].map(normalizeTime)).toEqual([
      '09:00',
      '09:00',
      '09:30',
      '23:59',
      '14:00',
      '5pm',
      '25:00',
    ]);
  });
});

describe('appointments need a time window', () => {
  it('reports missing availability for a booking, but not for a question', async () => {
    const noWindows = dentistRequest({ constraints: { availability: [], maxAdditionalCostUsd: 0 } });
    const booking = await checkRequest(noWindows, deps('healthcare_appointment'));
    expect(booking.ok).toBe(false);
    expect(booking.missing).toEqual(['which days and times work (at least one time window)']);
    expect((await checkRequest(noWindows, deps('business_inquiry'))).ok).toBe(true);
  });

  it('lets the user skip the times when the call only asks what is available', async () => {
    const askOnly = dentistRequest({ instructions: 'Ask Smile Dental which cleaning times are available and report back. Do not book.', constraints: { availability: [], maxAdditionalCostUsd: 0 } });
    const classifier = { review: async () => reviewTask('healthcare_appointment', '', false) };
    expect((await checkRequest(askOnly, { classifier, allowedDestinations: null })).ok).toBe(true);
  });
});

describe('follow-up after a call', () => {
  const record = () => {
    const r = newCallRecord('5e6ca169-0903-45cc-b724-e253756f3726', dentistRequest({ counterpartName: 'David Clinic' }));
    r.status = 'completed';
    r.transcript = [
      { id: 'c1', speaker: 'counterpart', text: '3pm is the best I can do.', at: 1 },
      { id: 'a1', speaker: 'assistant', text: 'Thanks, I will let Leo know.', at: 2 },
    ];
    r.result = {
      status: 'completed', success: false, objective: 'schedule_cleaning', appointment: null, commitments: [],
      additionalChargesAuthorized: false, unresolvedQuestions: ['Accept Thursday 3 pm?'], refusedDecisions: [],
      followUpsForUser: ['Call back to accept 3 pm.'], summary: 'Not booked; they offered Thursday 3 pm.',
      summaryInUserLanguage: '没有预约成功；对方提供了周四下午3点。', headlineInUserLanguage: '未预约：对方只能周四下午3点',
      nextStepsInUserLanguage: ['回电接受下午3点。'], policyWarnings: [],
    };
    return r;
  };

  it('reports the result first, from the record, with the transcript as data', () => {
    const text = buildFollowUpSection(record(), 'Leo', 'Chinese (Mandarin)');
    expect(text).toContain('this replaces how to start');
    expect(text).toContain('未预约：对方只能周四下午3点');
    expect(text).toContain('Accept Thursday 3 pm?');
    expect(text).toContain('THEM: 3pm is the best I can do.');
    expect(text).toContain('"confirmedAppointment":null');
  });

  it('seeds the draft with the previous request so only changes need saying', () => {
    const draft = requestToDraft(record().request);
    const back = draftToRequest(draft, { userName: 'Leo', userLanguage: 'Chinese (Mandarin)', timezone: 'America/Los_Angeles' });
    expect(back.to).toBe('+14155550123');
    expect(back.constraints.availability).toEqual(record().request.constraints.availability);
    expect(back.counterpartName).toBe('David Clinic');
  });
});

describe('writtenIn', () => {
  it('checks the summary is in the user language, allowing names in another script', () => {
    expect(writtenIn('打电话给 Oliver，打个招呼并问他最近怎么样。', 'English')).toBe(false);
    expect(writtenIn('打电话给 Oliver，打个招呼并问他最近怎么样。', 'Chinese (Mandarin)')).toBe(true);
    expect(writtenIn('Call Oliver to say hi.', 'English')).toBe(true);
    expect(writtenIn('Call Oliver to say hi.', 'Chinese (Mandarin)')).toBe(false);
    expect(writtenIn('Llamar a Oliver para saludar.', 'Spanish')).toBe(true);
    expect(writtenIn('Позвонить Оливеру.', 'Russian')).toBe(true);
    expect(writtenIn('123', 'Korean')).toBe(true);
    expect(writtenIn('Call Oliver.', 'Klingon')).toBe(true);
  });

  it('drops a summary in the wrong language from the request', () => {
    const ctx = { userName: 'Leo', userLanguage: 'English', timezone: 'America/Chicago', voice: 'marin' as const };
    const req = draftToRequest({ phoneNumber: '9014553148', task: 'Say hi', taskInUserLanguage: '打个招呼' }, ctx);
    expect(req.taskInUserLanguage).toBeUndefined();
    expect(draftToRequest({ phoneNumber: '9014553148', task: 'Say hi', taskInUserLanguage: 'Say hi to Oliver' }, ctx).taskInUserLanguage).toBe('Say hi to Oliver');
  });
});
