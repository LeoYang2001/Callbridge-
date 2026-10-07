import type { CallRequest, IntakeDraft } from './types';

export interface IntakeContext {
  userName: string;
  userLanguage: string;
  timezone: string;
}

/** Turns what the voice intake gathered into a call request (the server re-validates all of it). */
export function draftToRequest(draft: IntakeDraft, ctx: IntakeContext): CallRequest {
  const digits = (draft.phoneNumber ?? '').replace(/\D/g, '');
  return {
    to: digits ? `+${digits.length === 10 ? `1${digits}` : digits}` : '',
    counterpartName: draft.counterpartName?.trim() || undefined,
    taskInUserLanguage: draft.taskInUserLanguage?.trim() || undefined,
    user: { name: draft.userName?.trim() || ctx.userName, preferredLanguage: ctx.userLanguage },
    callLanguage: draft.callLanguage?.trim() || 'English',
    timezone: ctx.timezone,
    authorizedInfo: (draft.shareableInfo ?? []).filter((f) => f.label?.trim() && f.value?.trim()),
    instructions: draft.task?.trim() ?? '',
    constraints: {
      availability: draft.availability ?? [],
      earliestDate: draft.earliestDate || undefined,
      latestDate: draft.latestDate || undefined,
      maxAdditionalCostUsd: Math.max(0, draft.maxAdditionalCostUsd ?? 0),
    },
  };
}

/** Converts update_request arguments (snake_case) into a draft patch. */
export function draftPatchFromArgs(args: Record<string, unknown>): IntakeDraft {
  const map: Record<string, keyof IntakeDraft> = {
    counterpart_name: 'counterpartName',
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
