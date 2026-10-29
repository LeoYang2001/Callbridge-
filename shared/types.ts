/**
 * Types shared by the server and both apps. CallBridge puts a translator on calls the user
 * makes themselves: live captions both ways, and an AI interpreter that joins when both sides
 * agree. The AI never talks for the user.
 */

export interface PublicConfig {
  telephonyConfigured: boolean;
  /** OpenAI is set up (translation needs it). */
  voiceConfigured: boolean;
  allowlistActive: boolean;
  /** Calls can go through the app (Twilio Voice SDK keys are set). */
  inAppCalling: boolean;
}

// ── translated calls ─────────────────────────────────────────────────────────

/**
 * A call the user makes themselves, with live translation: captions on their screen, and an AI
 * interpreter that joins (when both sides agree) and speaks each side's words in the other's
 * language. The AI never talks for the user.
 */
export interface TranslatedCallRequest {
  /** E.164. */
  to: string;
  /** Who they're calling, for the screen. */
  contactName?: string;
  /** The other side's language. */
  theirLanguage: string;
  /** How the user is on the call: the app (Twilio Voice SDK) or their phone rings first. */
  join: 'app' | 'phone';
  /** Captions from the start (they can be turned on and off during the call). */
  captions?: boolean;
}

export type TranslatedCallStatus = 'connecting_you' | 'dialing' | 'live' | 'ended' | 'failed';

/** What one person said, with its translation; both grow while they talk. */
export interface CaptionLine {
  id: string;
  speaker: 'you' | 'them';
  original: string;
  translation: string;
  at: number;
  /** Both texts are complete. */
  final: boolean;
}

export interface TranslatedCallRecord {
  id: string;
  userId?: string;
  request: TranslatedCallRequest;
  /** The user's language (from their profile). */
  userLanguage: string;
  status: TranslatedCallStatus;
  createdAt: number;
  answeredAt?: number;
  endedAt?: number;
  failureReason?: string;
  captions: boolean;
  /** The AI interpreter speaking into the call. */
  interpreter: 'off' | 'joining' | 'on';
  /** The interpreter joined at some point in the call. */
  interpreterUsed?: boolean;
  /** Something the user should know (a translation direction failed, the interpreter can't speak a language). */
  notice?: string;
  lines: CaptionLine[];
}

// ── accounts and profiles ─────────────────────────────────────────────────────

/** A finished call in the history list. */
export interface TranslatedCallSummary {
  id: string;
  createdAt: number;
  status: TranslatedCallStatus;
  to: string;
  contactName?: string;
  theirLanguage: string;
  /** Seconds they talked, when it connected. */
  durationSeconds?: number;
  interpreterUsed: boolean;
  /** The first thing they said, in the user's language. */
  preview?: string;
}

/** Someone the user calls: added by hand, from the phone's contacts, or by a call. */
export interface Contact {
  id: string;
  name: string;
  /** E.164 */
  phone: string;
  /** e.g. "dentist", "restaurant", "personal" */
  kind?: string;
  /** Who they are to the user, e.g. "girlfriend", "mom", "dentist". */
  relationship?: string;
  /** Street address, for businesses (tells same-name places apart). */
  address?: string;
  /** The language they speak, e.g. "Tagalog". */
  language?: string;
  notes: string[];
  lastCalledAt?: number;
  callCount: number;
}

/** What CallBridge knows about the user. They can view and delete all of it. */
export interface UserProfile {
  name: string;
  pronouns?: string;
  preferredLanguage: string;
  otherLanguages: string[];
  timezone: string;
  /** The language most of their calls are in (preselected when dialing). */
  defaultCallLanguage?: string;
  /** Calls show the user's own number (once verified with the phone company, see callerIdVerifiedAt). */
  useOwnCallerId?: boolean;
  /** When the user's number was verified as a caller ID (set by the server only). */
  callerIdVerifiedAt?: number;
  contacts: Contact[];
  /** Finished (or skipped) setting up their profile. */
  onboarded: boolean;
}

export interface Me {
  id: string;
  phone: string;
  profile: UserProfile;
}

export interface AuthResult {
  token: string;
  isNew: boolean;
  me: Me;
}
