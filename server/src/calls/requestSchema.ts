import { z } from 'zod';
import { REALTIME_VOICES, WEEKDAYS } from '../../../shared/types';
import { isValidDate, isValidTime } from '../policy/availability';
import { isValidTimeZone } from '../util/time';

/**
 * The shape every call request must have. POST /api/calls parses with it, and the intake check
 * reports the same problems, so a request the intake calls "ok" can't fail at Start call.
 */
const text = (max: number) => z.string().trim().max(max);

export const CallRequestSchema = z
  .object({
    to: text(32).min(1),
    voice: z.enum(REALTIME_VOICES).optional(),
    involvement: z.enum(['supervised', 'handoff']).optional(),
    counterpartName: text(120).optional(),
    counterpartRelationship: text(60).optional(),
    counterpartAddress: text(200).optional(),
    taskInUserLanguage: text(500).optional(),
    user: z.object({
      name: text(80).min(1, 'Name is required'),
      pronouns: text(40).optional(),
      preferredLanguage: text(60).min(1),
    }),
    callLanguage: text(60).min(1).default('English'),
    timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
    authorizedInfo: z.array(z.object({ label: text(60), value: text(300) })).max(20).default([]),
    instructions: text(2000).min(10, 'Describe the task in a sentence or two'),
    constraints: z.object({
      availability: z
        .array(
          z
            .object({
              days: z.array(z.enum(WEEKDAYS)).min(1, 'has no days'),
              start: z.string().refine(isValidTime, 'start must be a 24-hour time like 14:00'),
              end: z.string().refine(isValidTime, 'end must be a 24-hour time like 17:00'),
            })
            .refine((w) => w.start < w.end, 'ends before it starts'),
        )
        .max(10)
        .default([]),
      earliestDate: z.string().refine(isValidDate, 'YYYY-MM-DD').optional().or(z.literal('').transform(() => undefined)),
      latestDate: z.string().refine(isValidDate, 'YYYY-MM-DD').optional().or(z.literal('').transform(() => undefined)),
      maxAdditionalCostUsd: z.number().min(0).max(10_000).default(0),
    }),
  })
  .transform((r) => ({ ...r, authorizedInfo: r.authorizedInfo.filter((f) => f.label && f.value) }));

/** Human-readable problems with a request's limits and settings (fields other than who/what). */
export function requestProblems(input: unknown): string[] {
  const parsed = CallRequestSchema.safeParse(input);
  if (parsed.success) return [];
  const req = input as { constraints?: { availability?: { days?: string[]; start?: string; end?: string }[] } };
  return parsed.error.issues
    // Missing number, task, or name are reported separately as "missing".
    .filter((i) => !['to', 'instructions', 'user'].includes(String(i.path[0])))
    .map((i) => {
      const [section, field, index] = i.path;
      if (section === 'constraints' && field === 'availability' && typeof index === 'number') {
        const w = req.constraints?.availability?.[index];
        const what = w ? ` (${(w.days ?? []).join('/') || 'no days'} ${w.start ?? '?'}–${w.end ?? '?'})` : '';
        return `Time window ${index + 1}${what} ${i.message}.`;
      }
      const label: Record<string, string> = {
        earliestDate: 'The earliest date',
        latestDate: 'The latest date',
        maxAdditionalCostUsd: 'The extra-charge limit',
      };
      const name = section === 'constraints' ? (label[String(field)] ?? 'A limit') : section === 'timezone' ? 'The time zone' : `"${String(section)}"`;
      return `${name} is invalid: ${i.message}.`;
    });
}
