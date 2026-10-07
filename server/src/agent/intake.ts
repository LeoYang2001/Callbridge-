import type { CallRequest, IntakeCheckResult } from '../../../shared/types';
import { findSensitiveData } from '../policy/sensitive';
import { TaskReviewUnavailableError, type TaskClassifier } from '../policy/taskClassifier';
import { TASK_RULES } from '../policy/taskPolicy';
import { blockedReason, normalizePhone } from '../util/phone';
import type { ToolDefinition } from './tools';

/**
 * The voice intake: an assistant that talks with the user in their own language and fills in a
 * call request. It has no authority. It can't dial, and everything it gathers goes through
 * `checkRequest` (and again through POST /api/calls) before a call can be placed.
 */

export interface IntakePromptContext {
  userName: string;
  userLanguage: string;
  timezone: string;
  today: { date: string; weekday: string; time: string };
}

const ALLOWED_KINDS = Object.entries(TASK_RULES)
  .filter(([, r]) => r.tier !== 'refused')
  .map(([, r]) => `- ${r.reason}`)
  .join('\n');
const REFUSED_KINDS = Object.entries(TASK_RULES)
  .filter(([k, r]) => r.tier === 'refused' && k !== 'other')
  .map(([, r]) => `- ${r.reason}`)
  .join('\n');

export function buildIntakeInstructions(ctx: IntakePromptContext): string {
  return `# Who you are
You are CallBridge's intake assistant. ${ctx.userName} wants you to set up a phone call that a separate AI assistant will make to a business on ${ctx.userName}'s behalf. You only gather the details and fill in the request. You never place calls yourself, and you never promise that a call will happen or what its outcome will be.

Start by greeting ${ctx.userName} in one short sentence and asking what call they'd like to make.

# Language
Speak ${ctx.userLanguage} with ${ctx.userName}, even when the call itself will be in another language. If ${ctx.userName} switches language, follow them.

# What CallBridge can do
${ALLOWED_KINDS}

What it will not do (explain kindly in ${ctx.userLanguage} and offer what is possible instead):
${REFUSED_KINDS}

# What to gather
Ask only for what's missing, one short question at a time:
1. Who to call: the business name and its phone number. Repeat the number back digit by digit to confirm it.
2. What the call should achieve, in enough detail for the call assistant to act alone.
3. The call language. Default to English unless ${ctx.userName} says otherwise.
4. For appointments or reservations: which days and times work, any date range, and the party size or service if relevant.
5. Whether any extra charges are acceptable, and up to how much. Default to none.
6. What the call assistant may share if asked (for example a callback number or date of birth). Nothing else will be shared.

Call update_request whenever you learn something new, so the screen stays current. Write "task" in English as clear instructions for the call assistant, and "task_in_user_language" as a one-sentence summary in ${ctx.userLanguage}.

# Safety
- Never ask for or accept passwords, PINs, verification codes, card or bank numbers, or Social Security or ID numbers. If ${ctx.userName} starts to say one, stop them and explain the call assistant must never have it.
- Don't add details ${ctx.userName} didn't give you. If something is unclear, ask.

# Finishing
When you have the essentials, call check_request. Its answer comes from CallBridge's rules and is final:
- If it lists missing details or problems, ask about them, update the request, and check again.
- If it refuses the task, explain the reason it gives in ${ctx.userName}'s language. Don't argue with it or look for a way around it.
- If it's ok, read back a short summary in ${ctx.userLanguage} (who, what, when, limits), then call finish_intake. Tell ${ctx.userName} to review the details on screen and tap Start call.

# How to talk
Be warm and brief, like a capable assistant on the phone: one or two short sentences per turn, no lists read aloud. Use natural spoken ${ctx.userLanguage}.

# Context
Today is ${ctx.today.weekday}, ${ctx.today.date}, ${ctx.today.time} (${ctx.timezone}). Resolve relative dates such as "next Thursday" against today; use YYYY-MM-DD dates and 24-hour HH:MM times in tools.`;
}

const WEEKDAY_ENUM = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const INTAKE_TOOLS: ToolDefinition[] = [
  {
    name: 'update_request',
    description: 'Save details of the call request as you learn them. Send only the fields that changed.',
    parameters: {
      type: 'object',
      properties: {
        counterpart_name: { type: 'string', description: 'Business to call, e.g. "Smile Dental".' },
        phone_number: { type: 'string', description: 'Phone number to call, digits only, with country code if given.' },
        task: { type: 'string', description: 'In English: what the call assistant should do, as clear instructions.' },
        task_in_user_language: { type: 'string', description: "One-sentence summary in the user's language." },
        call_language: { type: 'string', description: 'Language to speak on the call, e.g. "English".' },
        user_name: { type: 'string', description: "The user's name, if they give a different one." },
        availability: {
          type: 'array',
          description: 'When the user is available. Replaces any earlier windows.',
          items: {
            type: 'object',
            properties: {
              days: { type: 'array', items: { type: 'string', enum: WEEKDAY_ENUM } },
              start: { type: 'string', description: '24h HH:MM' },
              end: { type: 'string', description: '24h HH:MM' },
            },
            required: ['days', 'start', 'end'],
          },
        },
        earliest_date: { type: 'string', description: 'YYYY-MM-DD' },
        latest_date: { type: 'string', description: 'YYYY-MM-DD' },
        max_additional_cost_usd: { type: 'number', description: 'Extra charges the user accepts. 0 for none.' },
        shareable_info: {
          type: 'array',
          description: 'Facts the call assistant may share if asked. Replaces the earlier list.',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, value: { type: 'string' } },
            required: ['label', 'value'],
          },
        },
      },
    },
  },
  {
    name: 'check_request',
    description: "Ask CallBridge whether the request is complete and allowed. Its answer is final.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'finish_intake',
    description: 'Call after check_request returned ok and you read back the summary. Shows the review screen.',
    parameters: { type: 'object', properties: {} },
  },
];

export interface CheckDeps {
  classifier: TaskClassifier | null;
  allowedDestinations: string[] | null;
}

/**
 * Everything the server requires before a call may be placed, in one place: required fields,
 * a dialable number, sensitive data, and the task ruling. Used by the intake (to tell the user
 * what's missing) and by POST /api/calls (to refuse anything that fails).
 */
export async function checkRequest(req: CallRequest, deps: CheckDeps): Promise<IntakeCheckResult> {
  const missing: string[] = [];
  const problems: string[] = [];

  const to = normalizePhone(req.to);
  if (!req.to) missing.push('phone number');
  else if (!to) problems.push('The phone number is not a valid number.');
  else {
    const blocked = blockedReason(to);
    if (blocked) problems.push(`This number cannot be called: ${blocked}.`);
    else if (deps.allowedDestinations && !deps.allowedDestinations.includes(to)) {
      problems.push('This number is not on the allowlist for this deployment.');
    }
  }
  if (req.instructions.trim().length < 10) missing.push('what the call should achieve');
  if (!req.user.name.trim()) missing.push("the user's name");
  for (const s of findSensitiveData(req)) problems.push(`Remove sensitive data: ${s.field} ${s.reason}.`);

  if (missing.length || !deps.classifier) {
    return { ok: false, missing, problems: deps.classifier ? problems : [...problems, 'Task review is unavailable.'], review: null };
  }

  let review;
  try {
    review = await deps.classifier.review({
      task: req.instructions,
      taskInUserLanguage: req.taskInUserLanguage,
      counterpartName: req.counterpartName,
      userLanguage: req.user.preferredLanguage,
    });
  } catch (err) {
    if (err instanceof TaskReviewUnavailableError) {
      return { ok: false, missing, problems: [...problems, 'The task could not be reviewed right now. Try again in a moment.'], review: null };
    }
    throw err;
  }
  if (review.tier === 'refused') problems.push(review.reason);
  return { ok: problems.length === 0, missing, problems, review };
}

