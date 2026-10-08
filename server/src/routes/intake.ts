import type { FastifyInstance } from 'fastify';
import OpenAI from 'openai';
import { z } from 'zod';
import { draftToRequest } from '../../../shared/intake';
import { REALTIME_VOICES, type IntakeDraft, type IntakeSession } from '../../../shared/types';
import { buildFollowUpSection, buildIntakeInstructions, checkRequest, INTAKE_TOOLS, type CheckDeps } from '../agent/intake';
import { languageCode } from '../../../shared/languages';
import { buildAppOnboardingInstructions, buildProfileInstructions, PROFILE_TOOLS } from '../agent/profileIntake';
import { pushToTalkSection, SHOW_CHOICES_TOOL } from '../agent/pushToTalk';
import type { CallStore } from '../calls/store';
import { profileForPrompt } from '../profile/profile';
import type { AppConfig } from '../config';
import { isValidTimeZone, localToday } from '../util/time';

const ContextSchema = z.object({
  userName: z.string().trim().max(80).default(''),
  userLanguage: z.string().trim().min(1).max(60),
  timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
  voice: z.enum(REALTIME_VOICES).optional(),
});

const SessionSchema = ContextSchema.extend({
  /** A finished call to report on and possibly follow up. */
  followUpOf: z.string().uuid().optional(),
  /** "profile" runs the profile interview instead of setting up a call. */
  mode: z.enum(['call', 'profile']).default('call'),
  /** The mobile app: push-to-talk turns and answer chips (the web app keeps the open mic). */
  pushToTalk: z.boolean().default(false),
});

/** The draft is model output relayed by the browser, so it's shape-checked like any input. */
const DraftSchema = z
  .object({
    counterpartName: z.string().max(120),
    counterpartRelationship: z.string().max(60),
    counterpartAddress: z.string().max(200),
    phoneNumber: z.string().max(40),
    task: z.string().max(2000),
    taskInUserLanguage: z.string().max(500),
    callLanguage: z.string().max(60),
    userName: z.string().max(80),
    availability: z
      .array(z.object({ days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])), start: z.string().max(5), end: z.string().max(5) }))
      .max(10),
    earliestDate: z.string().max(10),
    latestDate: z.string().max(10),
    maxAdditionalCostUsd: z.number().min(0).max(10_000),
    shareableInfo: z.array(z.object({ label: z.string().max(60), value: z.string().max(300) })).max(20),
  })
  .partial();

/** A minute to start the session; the session itself may then run longer. */
const SECRET_TTL_SECONDS = 60;

export function registerIntakeRoutes(app: FastifyInstance, deps: { config: AppConfig; checkDeps: CheckDeps; store: CallStore }) {
  const { config, checkDeps, store } = deps;
  const openai = config.OPENAI_API_KEY ? new OpenAI({ apiKey: config.OPENAI_API_KEY }) : null;

  /**
   * Mints a short-lived key so the browser can talk to OpenAI Realtime directly over WebRTC.
   * The real API key never leaves the server, and the session's instructions and tools are
   * fixed here.
   */
  app.post('/api/intake/session', async (req, reply) => {
    if (!openai) return reply.code(503).send({ error: 'OPENAI_API_KEY is not set on the server.' });
    const parsed = SessionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues.map((i) => i.message).join('; ') });
    const profile = req.user!.profile;
    const ctx = { ...parsed.data, userName: profile.name || parsed.data.userName || 'there' };
    const previous = ctx.followUpOf ? store.getOrLoad(ctx.followUpOf) : undefined;
    if (ctx.followUpOf && previous?.userId !== req.user!.id) return reply.code(404).send({ error: 'That call is no longer on the server.' });
    const isProfile = ctx.mode === 'profile';
    const ptt = ctx.pushToTalk;
    const instructions =
      (isProfile
        ? ptt && !profile.onboarded
          ? buildAppOnboardingInstructions(profile, ctx)
          : buildProfileInstructions(profile, ctx)
        : buildIntakeInstructions({ ...ctx, today: localToday(ctx.timezone), profile: profileForPrompt(profile) }) +
          (previous ? buildFollowUpSection(previous, ctx.userName, ctx.userLanguage) : '')) + (ptt ? pushToTalkSection(ctx.userLanguage) : '');
    const tools = [...(isProfile ? PROFILE_TOOLS : INTAKE_TOOLS), ...(ptt ? [SHOW_CHOICES_TOOL] : [])];

    const secret = await openai.realtime.clientSecrets.create({
      expires_after: { anchor: 'created_at', seconds: SECRET_TTL_SECONDS },
      session: {
        type: 'realtime',
        model: config.REALTIME_MODEL,
        instructions,
        output_modalities: ['audio'],
        audio: {
          input: {
            noise_reduction: { type: 'near_field' },
            transcription: { model: config.TRANSCRIPTION_MODEL, ...(languageCode(ctx.userLanguage) ? { language: languageCode(ctx.userLanguage) } : {}) },
            // Push-to-talk: the app commits each turn when the button is released.
            turn_detection: ptt ? null : { type: 'semantic_vad', eagerness: 'auto', create_response: true, interrupt_response: true },
          },
          output: { voice: ctx.voice ?? config.REALTIME_VOICE },
        },
        tools: tools.map((t) => ({ type: 'function' as const, ...t })),
        tool_choice: 'auto',
        ...(/^gpt-realtime-2/.test(config.REALTIME_MODEL) ? { reasoning: { effort: config.REALTIME_REASONING_EFFORT } } : {}),
      },
    });
    const session: IntakeSession = { clientSecret: secret.value, expiresAt: secret.expires_at, model: config.REALTIME_MODEL };
    return session;
  });

  /** The intake's check_request tool: what's missing, and whether the task is allowed. */
  app.post('/api/intake/check', async (req, reply) => {
    const parsed = z.object({ context: ContextSchema, draft: DraftSchema }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    const request = draftToRequest(parsed.data.draft as IntakeDraft, parsed.data.context);
    const result = await checkRequest(request, checkDeps);
    app.log.info({ event: 'intake.check', ok: result.ok, category: result.review?.category, missing: result.missing.length }, 'intake.check');
    return result;
  });
}
