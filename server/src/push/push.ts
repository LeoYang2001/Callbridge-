import type { CallRecord, PushData, UserQuestion } from '../../../shared/types';

/**
 * Push notifications to the mobile app through Expo's push service, which forwards to APNs and
 * FCM (free, no key needed for a project using Expo push tokens). They only point the user back
 * to the app: the notification carries the call id, and the app fetches the call itself.
 */

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: PushData;
}

export interface PushSender {
  /** Sends the messages; resolves to the tokens the push service says are no longer valid. */
  send(messages: PushMessage[]): Promise<string[]>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
const BATCH = 100;

export const isExpoPushToken = (token: string) => /^Expo(nent)?PushToken\[[\w-]+\]$/.test(token);

export class ExpoPush implements PushSender {
  constructor(private readonly log: (message: string) => void = () => {}) {}

  async send(messages: PushMessage[]): Promise<string[]> {
    const dead: string[] = [];
    for (let i = 0; i < messages.length; i += BATCH) {
      const batch = messages.slice(i, i + BATCH);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        // High priority and a sound: a question means someone is on hold, waiting.
        body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default', priority: 'high', channelId: 'calls' }))),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.log(`Expo push error ${res.status}: ${(await res.text()).slice(0, 200)}`);
        continue;
      }
      const body = (await res.json()) as { data?: { status: string; message?: string; details?: { error?: string } }[] };
      body.data?.forEach((ticket, j) => {
        if (ticket.status === 'ok') return;
        if (ticket.details?.error === 'DeviceNotRegistered') dead.push(batch[j]!.to);
        else this.log(`Expo push refused: ${ticket.message ?? ticket.details?.error ?? 'unknown'}`);
      });
    }
    return dead;
  }
}

const who = (r: CallRecord) => r.request.counterpartName?.trim() || r.request.to;

/** "The other party is on hold": the question, in the user's language when it's been translated. */
export function questionNotification(record: CallRecord, q: UserQuestion): Omit<PushMessage, 'to'> {
  return {
    title: `${who(record)} is on hold`,
    body: q.questionInUserLanguage || q.question,
    data: { kind: 'question', callId: record.id, questionId: q.id },
  };
}

/** The call is over: its one-line outcome, or why it didn't happen. */
export function finishedNotification(record: CallRecord): Omit<PushMessage, 'to'> {
  const failed = record.status === 'failed' || (record.result && !['completed', 'voicemail'].includes(record.result.status));
  const headline = record.result?.headlineInUserLanguage || record.result?.summaryInUserLanguage;
  return {
    title: failed ? `Call to ${who(record)} didn't go through` : `Call to ${who(record)} finished`,
    body: headline || record.failureReason || (failed ? 'Open the app for details.' : 'Open the app for the summary.'),
    data: { kind: failed ? 'failed' : 'finished', callId: record.id },
  };
}
