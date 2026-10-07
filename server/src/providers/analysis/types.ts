import type { CallRequest, PolicyDecision, TranscriptEntry, ValidatedCommitment } from '../../../../shared/types';

export interface AnalysisInput {
  request: CallRequest;
  transcript: TranscriptEntry[];
  decisions: PolicyDecision[];
  commitments: ValidatedCommitment[];
  endReason?: string;
}

/** What the model extracts from the transcript. The backend merges it with its own ledger. */
export interface TranscriptAnalysis {
  objective: string;
  objectiveAchieved: boolean;
  appointmentMentioned: { date: string | null; time: string | null; notes: string | null } | null;
  /** Things the assistant agreed to out loud, according to the transcript. */
  verbalCommitments: string[];
  unresolvedQuestions: string[];
  refusedRequests: { request: string; reason: string }[];
  followUpsForUser: string[];
  /** Any statement by the assistant that is not supported by the user's information. */
  possibleFabrications: string[];
  summary: string;
  summaryInUserLanguage: string;
  /**
   * Whether the other party explicitly offered or agreed to the validated appointment's date and
   * time; null when no appointment was validated. Only ever downgrades a booking.
   */
  counterpartAgreedToAppointment: boolean | null;
  /** Facts the other party stated that would help on a future call (English). */
  notesAboutCounterpart: string[];
  /** One line for the top of the result, in the user's language. */
  headlineInUserLanguage: string;
  /** followUpsForUser, in the user's language. */
  nextStepsInUserLanguage: string[];
}

export interface CallAnalyzer {
  analyze(input: AnalysisInput): Promise<TranscriptAnalysis>;
}
