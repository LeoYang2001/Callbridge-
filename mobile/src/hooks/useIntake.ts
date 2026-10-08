import { useCallback, useEffect, useRef, useState } from 'react';
import type { IntakeContext } from '@shared/intake';
import type { IntakeCheckResult, IntakeDraft, Me, ResearchResult } from '@shared/types';
import { useSignedIn } from '@/lib/session';
import { startIntake, type IntakeLine, type IntakeSessionControls, type IntakeStatus } from '@/lib/voiceIntake';

export interface UseIntakeOptions {
  context: IntakeContext;
  /** "profile": the profile interview (it saves as it goes) instead of setting up a call. */
  mode?: 'call' | 'profile';
  /** Coming back after a call: the assistant reports on it first, with its request loaded. */
  followUp?: { callId: string; draft: IntakeDraft };
  /** Calling someone from the phone book: their details are filled in and this is said first. */
  seed?: { draft: IntakeDraft; text: string };
  /** How many transcript lines to keep on screen. */
  keepLines?: number;
}

/**
 * The intake conversation for a screen: one session for the whole conversation, started by the
 * mic or by the first typed message, with the transcript, the draft and the server's ruling as
 * state. Stops when the screen unmounts.
 */
export function useIntake({ context, mode = 'call', followUp, seed, keepLines = 12 }: UseIntakeOptions) {
  const { conn, setMe } = useSignedIn();
  const [status, setStatus] = useState<IntakeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<IntakeLine[]>([]);
  const [draft, setDraft] = useState<IntakeDraft>(() => followUp?.draft ?? seed?.draft ?? {});
  const [check, setCheck] = useState<IntakeCheckResult | null>(null);
  /** The assistant has everything and the server accepted it: show the review. */
  const [ready, setReady] = useState(false);
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const sessionRef = useRef<IntakeSessionControls | null>(null);
  const seededRef = useRef(false);
  const live = status !== null && status !== 'ended' && status !== 'error';

  useEffect(() => () => sessionRef.current?.stop(), []);

  const connect = useCallback(
    async (withMic: boolean) => {
      setError(null);
      setReady(false);
      try {
        const session = await startIntake(
          conn,
          context,
          {
            onStatus: (s, detail) => {
              setStatus(s);
              if (detail) setError(detail);
              if (s === 'ended' || s === 'error') setMicOn(false);
            },
            onLine: (line) =>
              setLines((prev) => {
                const i = prev.findIndex((l) => l.id === line.id);
                return i === -1 ? [...prev, line].slice(-keepLines) : prev.map((l, j) => (j === i ? line : l));
              }),
            onDraft: (d) => {
              setDraft(d);
              setReady(false);
            },
            onCheck: setCheck,
            onReady: () => setReady(true),
            onProfile: (me: Me) => setMe(me),
            onResearch: setResearch,
          },
          { mic: withMic, mode, followUpOf: followUp?.callId, initialDraft: followUp?.draft ?? seed?.draft },
        );
        // From the phone book: say who to call first (once), so the assistant only asks what for.
        if (seed && !seededRef.current) {
          seededRef.current = true;
          session.sendText(seed.text);
        }
        session.setSpeaker(speakerOn);
        sessionRef.current = session;
        setMicOn(withMic);
        return session;
      } catch (e) {
        setStatus('error');
        setError((e as Error).message);
        return null;
      }
    },
    [conn, context, mode, followUp, seed, speakerOn, keepLines, setMe],
  );

  /** Starts talking, or turns the mic on/off in a live conversation. */
  const toggleMic = useCallback(async () => {
    if (!live) return void (await connect(true));
    try {
      await sessionRef.current?.setMic(!micOn);
      setMicOn(!micOn);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [live, micOn, connect]);

  /** Sends a typed message, connecting first if needed. */
  const say = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      const session = live ? sessionRef.current : await connect(false);
      session?.sendText(t);
    },
    [live, connect],
  );

  const toggleSpeaker = useCallback(() => {
    sessionRef.current?.setSpeaker(!speakerOn);
    setSpeakerOn(!speakerOn);
  }, [speakerOn]);

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  const hasDraft = Object.values(draft).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ''));

  return {
    status,
    live,
    error,
    lines,
    draft,
    hasDraft,
    /** Enough to open the review (who and what); the server decides the rest. */
    canReview: Boolean(draft.phoneNumber && draft.task),
    check,
    ready,
    research,
    micOn,
    speakerOn,
    toggleMic,
    say,
    toggleSpeaker,
    stop,
  };
}
