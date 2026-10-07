import type { CallRequest, IntakeDraft, RealtimeVoice } from './types';

export interface IntakeContext {
  userName: string;
  userLanguage: string;
  timezone: string;
  voice?: RealtimeVoice;
}

/**
 * Tidies a model-written time into HH:MM when the meaning is unambiguous ("9:00" → "09:00",
 * "24:00" → "23:59"). Anything else is passed through for the validator to reject, so the
 * intake asks the user rather than guessing (e.g. whether "5:00" meant 5 pm).
 */
export function normalizeTime(t: string): string {
  const m = t.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
  if (!m) return t.trim();
  const h = Number(m[1]);
  const min = m[2] ?? '00';
  if (h === 24 && min === '00') return '23:59';
  return h <= 23 ? `${String(h).padStart(2, '0')}:${min}` : t.trim();
}

/** Turns what the voice intake gathered into a call request (the server re-validates all of it). */
export function draftToRequest(draft: IntakeDraft, ctx: IntakeContext): CallRequest {
  const digits = (draft.phoneNumber ?? '').replace(/\D/g, '');
  return {
    to: digits ? `+${digits.length === 10 ? `1${digits}` : digits}` : '',
    voice: ctx.voice,
    counterpartName: draft.counterpartName?.trim() || undefined,
    counterpartRelationship: draft.counterpartRelationship?.trim() || undefined,
    taskInUserLanguage: draft.taskInUserLanguage?.trim() || undefined,
    user: { name: draft.userName?.trim() || ctx.userName, preferredLanguage: ctx.userLanguage },
    callLanguage: draft.callLanguage?.trim() || 'English',
    timezone: ctx.timezone,
    authorizedInfo: (draft.shareableInfo ?? []).filter((f) => f.label?.trim() && f.value?.trim()),
    instructions: draft.task?.trim() ?? '',
    constraints: {
      availability: (draft.availability ?? []).map((w) => ({ ...w, start: normalizeTime(w.start), end: normalizeTime(w.end) })),
      earliestDate: draft.earliestDate || undefined,
      latestDate: draft.latestDate || undefined,
      maxAdditionalCostUsd: Math.max(0, draft.maxAdditionalCostUsd ?? 0),
    },
  };
}

/** The inverse of draftToRequest: seeds a follow-up conversation with the previous call's request. */
export function requestToDraft(req: CallRequest): IntakeDraft {
  return {
    counterpartName: req.counterpartName,
    counterpartRelationship: req.counterpartRelationship,
    phoneNumber: req.to.replace(/^\+1(?=\d{10}$)/, '').replace(/\D/g, ''),
    task: req.instructions,
    taskInUserLanguage: req.taskInUserLanguage,
    callLanguage: req.callLanguage,
    userName: req.user.name,
    availability: req.constraints.availability,
    earliestDate: req.constraints.earliestDate,
    latestDate: req.constraints.latestDate,
    maxAdditionalCostUsd: req.constraints.maxAdditionalCostUsd,
    shareableInfo: req.authorizedInfo,
  };
}

/** Converts update_request arguments (snake_case) into a draft patch. */
export function draftPatchFromArgs(args: Record<string, unknown>): IntakeDraft {
  const map: Record<string, keyof IntakeDraft> = {
    counterpart_name: 'counterpartName',
    counterpart_relationship: 'counterpartRelationship',
    phone_number: 'phoneNumber',
    task: 'task',
    task_in_user_language: 'taskInUserLanguage',
    call_language: 'callLanguage',
    user_name: 'userName',
    availability: 'availability',
    earliest_date: 'earliestDate',
    latest_date: 'latestDate',
    max_additional_cost_usd: 'maxAdditionalCostUsd',
    shareable_info: 'shareableInfo',
  };
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) if (map[k] && v !== undefined && v !== null) patch[map[k]] = v;
  return patch as IntakeDraft;
}
