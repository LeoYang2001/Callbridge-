import { useCallback, useEffect, useRef, useState } from 'react';
import type { IntakeContext } from '@shared/intake';
import type { IntakeCheckResult, IntakeDraft, Me, ResearchResult } from '@shared/types';
import { useSignedIn } from '@/lib/session';
import type { IntakeChoices } from '@shared/client/intake';
import { dictationLocale, startDictation, type Dictation } from '@/lib/speech';
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
  /** Push-to-talk turns with answer chips (the designed app); off = open mic. */
  pushToTalk?: boolean;
}

/**
 * The intake conversation for a screen: one session for the whole conversation, started by the
 * mic or by the first typed message, with the transcript, the draft and the server's ruling as
 * state. Stops when the screen unmounts.
 */
export function useIntake({ context, mode = 'call', followUp, seed, keepLines = 12, pushToTalk = false }: UseIntakeOptions) {
  const { conn, setMe, me } = useSignedIn();
  const [status, setStatus] = useState<IntakeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<IntakeLine[]>([]);
  const [draft, setDraft] = useState<IntakeDraft>(() => followUp?.draft ?? seed?.draft ?? {});
  const [check, setCheck] = useState<IntakeCheckResult | null>(null);
  /** The assistant has everything and the server accepted it: show the review. */
  const [ready, setReady] = useState(false);
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [micOn, setMicOn] = useState(false);
  /** The question just asked and its answer chips (push-to-talk). */
  const [choices, setChoices] = useState<IntakeChoices | null>(null);
  /** The talk button is held. */
  const [holding, setHolding] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const sessionRef = useRef<IntakeSessionControls | null>(null);
  const seededRef = useRef(false);
  const live = status !== null && status !== 'ended' && status !== 'error';

  useEffect(() => () => sessionRef.current?.stop(), []);

  /** first: the user's opening message, or 'user' when they're already holding the talk button. */
  const connect = useCallback(
    async (withMic: boolean, first?: { text: string } | 'user') => {
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
            onChoices: setChoices,
          },
          {
            mic: withMic,
            mode,
            followUpOf: followUp?.callId,
            initialDraft: followUp?.draft ?? seed?.draft,
            pushToTalk,
            // From the phone book: say who to call first (once), so the assistant only asks what for.
            firstText: typeof first === 'object' ? first.text : seed && !seededRef.current ? seed.text : undefined,
            waitForUser: first === 'user',
          },
        );
        if (seed) seededRef.current = true;
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
    [conn, context, mode, followUp, seed, speakerOn, keepLines, setMe, pushToTalk],
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
      if (live) sessionRef.current?.sendText(t);
      else await connect(false, { text: t });
    },
    [live, connect],
  );

  /** Connects without the mic: the assistant speaks first (push-to-talk screens start this way). */
  const start = useCallback(async () => {
    if (!live && !sessionRef.current) await connect(false);
  }, [live, connect]);

  /**
   * Push-to-talk. Where the phone can transcribe the user's language, it does, live, and on
   * release that exact text is what the assistant gets: what you see is what it understood.
   * Otherwise the voice itself is sent (the transcript then appears after release).
   */
  const dictationRef = useRef<Dictation | null>(null);
  const dictationStart = useRef<Promise<Dictation | null> | null>(null);
  const heardCount = useRef(0);

  const showHeard = useCallback((id: string, text: string | null) => {
    setLines((prev) => {
      const rest = prev.filter((l) => l.id !== id);
      return text ? [...rest, { id, role: 'user' as const, text, partial: true }].slice(-keepLines) : rest;
    });
  }, [keepLines]);

  const pressTalk = useCallback(async () => {
    setHolding(true);
    setChoices(null);
    setError(null);
    const locale = await dictationLocale(context.userLanguage);
    if (locale) {
      const id = `heard-${++heardCount.current}`;
      const names = me.profile.contacts.map((c) => c.name);
      dictationStart.current = startDictation(locale, names, (t) => showHeard(id, t)).then(
        (d) => (dictationRef.current = Object.assign(d, { lineId: id })),
        (e: Error) => {
          setError(e.message);
          return null;
        },
      );
      // Stop the assistant if it's talking; connect in the meantime if this is the first turn.
      if (live) sessionRef.current?.interrupt?.();
      else await connect(false, 'user');
      return;
    }
    try {
      const session = live ? sessionRef.current : await connect(true, 'user');
      await session?.startTurn?.();
    } catch (e) {
      setHolding(false);
      setError((e as Error).message);
    }
  }, [live, connect, context.userLanguage, me.profile.contacts, showHeard]);

  /** Push-to-talk: released; sends what was said, or drops a tap too short to be speech. */
  const releaseTalk = useCallback(
    async (tooShort = false) => {
      setHolding(false);
      if (dictationStart.current) {
        const d = await dictationStart.current;
        dictationStart.current = null;
        dictationRef.current = null;
        if (!d) return;
        const id = (d as Dictation & { lineId: string }).lineId;
        if (tooShort) {
          d.cancel();
          showHeard(id, null);
          return;
        }
        const text = await d.finish();
        showHeard(id, null);
        if (!text) return setError("I didn't catch that. Hold the button and try again.");
        sessionRef.current?.sendText(text);
        return;
      }
      if (tooShort) sessionRef.current?.cancelTurn?.();
      else sessionRef.current?.endTurn?.();
    },
    [showHeard],
  );

  /** Taps an answer chip: sent as the user's answer. */
  const choose = useCallback(
    async (answer: string) => {
      setChoices(null);
      if (live) sessionRef.current?.sendText(answer);
      else await connect(false, { text: answer });
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
    choices,
    holding,
    start,
    pressTalk,
    releaseTalk,
    choose,
    toggleMic,
    say,
    toggleSpeaker,
    stop,
  };
}
