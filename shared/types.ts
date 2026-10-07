// Types shared by the server and the web UI.

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** A recurring window in which the user is available, e.g. Wed/Thu 14:00–18:00. */
export interface AvailabilityWindow {
  days: Weekday[];
  /** 24h local time, "HH:MM". Appointment must start at or after this. */
  start: string;
  /** 24h local time, "HH:MM". Appointment must start before this. */
  end: string;
}

/** A single fact the user explicitly authorized the assistant to share (Level 1). */
export interface AuthorizedFact {
  label: string;
  value: string;
}

/**
 * What kind of call this is. The server classifies every request before dialing, and
 * `server/src/policy/taskPolicy.ts` decides in code which categories may be called at all.
 */
export const TASK_CATEGORIES = [
  'appointment',
  'healthcare_appointment',
  'reservation',
  'business_inquiry',
  'service_request',
  'financial',
  'identity_verification',
  'legal',
  'emergency',
  'personal_call',
  'sales_or_marketing',
  'deceptive_or_harmful',
  'other',
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

/** The server's ruling on a request, shown to the user before any call is placed. */
export interface TaskReview {
  category: TaskCategory;
  tier: 'allowed' | 'limited' | 'refused';
  /** English explanation, for the call record and logs. */
  reason: string;
  /** The same explanation in the user's language. */
  reasonInUserLanguage: string;
  /** Extra rules the call assistant must follow for this category. */
  rules: string[];
}

/** Voices the OpenAI Realtime API offers. `marin` and `cedar` are its most natural ones. */
export const REALTIME_VOICES = ['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'] as const;
export type RealtimeVoice = (typeof REALTIME_VOICES)[number];

export interface CallRequest {
  /** Destination in E.164 format, e.g. +14155550123 */
  to: string;
  /** Voice for the call assistant; the server's REALTIME_VOICE when omitted. */
  voice?: RealtimeVoice;
  /** Who is being called, e.g. "Smile Dental". */
  counterpartName?: string;
  /** The task as the user described it, in the user's language (shown on the review card). */
  taskInUserLanguage?: string;
  /** Set by the server's task review; never trusted from the client. */
  category?: TaskCategory;
  user: {
    name: string;
    /** Optional, e.g. "she/her". When empty the assistant refers to the user by name. */
    pronouns?: string;
    /** Language the user prefers to read results in, e.g. "Chinese (Mandarin)". */
    preferredLanguage: string;
  };
  /** Language the assistant should speak on the call. */
  callLanguage: string;
  /** IANA time zone used to interpret dates and times, e.g. America/Los_Angeles */
  timezone: string;
  /** Level 1 — facts the assistant may share. */
  authorizedInfo: AuthorizedFact[];
  /** Free-text task instructions from the user. */
  instructions: string;
  /** Level 2 — machine-checkable negotiation boundaries. */
  constraints: {
    availability: AvailabilityWindow[];
    /** Inclusive, "YYYY-MM-DD". */
    earliestDate?: string;
    /** Inclusive, "YYYY-MM-DD". */
    latestDate?: string;
    /** Extra charges the assistant may accept without asking. Default 0. */
    maxAdditionalCostUsd: number;
  };
}

export type CallStatus =
  | 'preparing'
  | 'dialing'
  | 'connected'
  | 'in_progress'
  | 'analyzing'
  | 'completed'
  | 'failed';

export type Speaker = 'assistant' | 'counterpart' | 'system';

export interface TranscriptEntry {
  id: string;
  speaker: Speaker;
  text: string;
  /** ms since epoch when the utterance started (or was first observed) */
  at: number;
  /** true while the transcription is still being produced */
  pending?: boolean;
  /** true if the assistant was interrupted mid-utterance */
  interrupted?: boolean;
}

export type DecisionOutcome =
  | 'authorized'
  | 'requires_user_approval'
  | 'never_authorized'
  | 'unknown_information';

/** A ruling the backend policy layer made during the call. */
export interface PolicyDecision {
  id: string;
  at: number;
  tool: string;
  request: string;
  category: string;
  outcome: DecisionOutcome | 'accepted' | 'rejected';
  reason: string;
}

/** A commitment the backend validated and allowed the assistant to make. */
export interface ValidatedCommitment {
  id: string;
  at: number;
  type: 'appointment' | 'task_outcome';
  description: string;
  date?: string;
  startTime?: string;
  costUsd?: number;
}

export interface RefusedDecision {
  request: string;
  reason: string;
  source: 'policy' | 'transcript';
}

export interface CallResult {
  status: 'completed' | 'failed' | 'no_answer' | 'busy' | 'voicemail' | 'canceled';
  success: boolean;
  objective: string;
  appointment: { date: string; time: string; notes?: string } | null;
  commitments: ValidatedCommitment[];
  additionalChargesAuthorized: boolean;
  unresolvedQuestions: string[];
  refusedDecisions: RefusedDecision[];
  followUpsForUser: string[];
  summary: string;
  summaryInUserLanguage: string;
  /** One-line outcome in the user's language (absent on calls analyzed before it existed). */
  headlineInUserLanguage?: string;
  nextStepsInUserLanguage?: string[];
  /** Discrepancies between what was said and what the policy layer validated. */
  policyWarnings: string[];
}

export interface CallMetrics {
  dialedAt?: number;
  answeredAt?: number;
  firstAssistantAudioAt?: number;
  endedAt?: number;
  /** Counterpart stops speaking → first assistant audio, per turn (ms). */
  turnLatenciesMs: number[];
  interruptions: number;
  toolCalls: number;
}

export interface CallLogEvent {
  at: number;
  type: string;
  detail?: string;
}

export interface CallRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: CallStatus;
  request: CallRequest;
  providerCallId?: string;
  failureReason?: string;
  transcript: TranscriptEntry[];
  decisions: PolicyDecision[];
  commitments: ValidatedCommitment[];
  /** Questions the policy layer said need the user's input. */
  unresolvedQuestions: string[];
  /** Why the call ended (end_call outcome, remote hangup, timeout, error…). */
  endReason?: string;
  result?: CallResult;
  metrics: CallMetrics;
  events: CallLogEvent[];
}

/** What the voice intake has gathered so far. Everything is optional until the review. */
export interface IntakeDraft {
  counterpartName?: string;
  phoneNumber?: string;
  task?: string;
  taskInUserLanguage?: string;
  callLanguage?: string;
  userName?: string;
  availability?: AvailabilityWindow[];
  earliestDate?: string;
  latestDate?: string;
  maxAdditionalCostUsd?: number;
  shareableInfo?: AuthorizedFact[];
}

/** Server response to an intake check: what's still missing, and the task ruling. */
export interface IntakeCheckResult {
  ok: boolean;
  missing: string[];
  problems: string[];
  review: TaskReview | null;
}

export interface IntakeSession {
  clientSecret: string;
  expiresAt: number;
  model: string;
}

export interface PublicConfig {
  telephonyConfigured: boolean;
  voiceConfigured: boolean;
  allowlistActive: boolean;
  realtimeModel: string;
  defaultVoice: string;
}
