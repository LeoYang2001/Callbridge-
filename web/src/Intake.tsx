import { useEffect, useRef, useState, type FormEvent } from 'react';
import { draftToRequest, type IntakeContext } from '../../shared/intake';
import { displayPhone } from '../../shared/phone';
import type { IntakeCheckResult, IntakeDraft, Me, PlaceResult, RealtimeVoice } from '../../shared/types';
import { startIntake, type IntakeLine, type IntakeSessionControls, type IntakeStatus } from './voiceIntake';
import type { Settings } from './settings';
import { VoicePicker } from './VoicePicker';

interface Props {
  settings: Settings;
  context: IntakeContext;
  languages: string[];
  onLanguageChange: (language: string) => void;
  voice: RealtimeVoice;
  onVoiceChange: (voice: RealtimeVoice) => void;
  onReview: (draft: IntakeDraft) => void;
  /** Open the form, carrying over what was gathered so far. */
  onType: (draft: IntakeDraft) => void;
  /** Coming back after a call: the assistant reports on it first, with its request loaded. */
  followUp?: { callId: string; draft: IntakeDraft; headline?: string };
  /** Calling someone from the phone book: their details are filled in and this is said first. */
  seed?: { draft: IntakeDraft; text: string };
  /** The profile interview instead of setting up a call. */
  profile?: { me: Me; onSaved: (me: Me) => void; onDone: () => void; onSkip: () => void };
}

const STATUS_TEXT: Record<IntakeStatus, string> = {
  connecting: 'Connecting…',
  listening: 'Listening',
  thinking: 'Thinking…',
  speaking: 'Speaking',
  ended: 'Ended',
  error: 'Disconnected',
};

const TIER_TEXT = { allowed: 'Allowed', limited: 'Allowed with limits', refused: 'Not allowed' } as const;

export function Intake({ settings, context, languages, onLanguageChange, voice, onVoiceChange, onReview, onType, followUp, profile, seed }: Props) {
  const [status, setStatus] = useState<IntakeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<IntakeLine[]>([]);
  const [draft, setDraft] = useState<IntakeDraft>(() => followUp?.draft ?? seed?.draft ?? {});
  const [check, setCheck] = useState<IntakeCheckResult | null>(null);
  const [ready, setReady] = useState(false);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [text, setText] = useState('');
  const sessionRef = useRef<IntakeSessionControls | null>(null);
  const seededRef = useRef(false);
  const live = status !== null && status !== 'ended' && status !== 'error';

  useEffect(() => () => sessionRef.current?.stop(), []);

  /** One session for the whole conversation, started by the mic or by the first typed message. */
  const connect = async (withMic: boolean) => {
    setError(null);
    setReady(false);
    try {
      const session = await startIntake(
        settings,
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
              return i === -1 ? [...prev, line].slice(-10) : prev.map((l, j) => (j === i ? line : l));
            }),
          onDraft: (d) => {
            setDraft(d);
            setReady(false);
          },
          onCheck: setCheck,
          onReady: () => setReady(true),
          onProfile: profile?.onSaved,
          onPlaces: setPlaces,
        },
        { mic: withMic, mode: profile ? 'profile' : 'call', followUpOf: followUp?.callId, initialDraft: followUp?.draft ?? seed?.draft },
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
  };

  const toggleMic = async () => {
    if (!live) {
      await connect(true);
      return;
    }
    try {
      await sessionRef.current?.setMic(!micOn);
      setMicOn(!micOn);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const say = async (t: string) => {
    const session = live ? sessionRef.current : await connect(false);
    session?.sendText(t);
  };

  const sendText = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    await say(t);
  };

  const toggleSpeaker = () => {
    sessionRef.current?.setSpeaker(!speakerOn);
    setSpeakerOn(!speakerOn);
  };

  const stop = () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
  };

  const review = () => {
    stop();
    onReview(draft);
  };

  const hasDraft = Object.values(draft).some((v) => (Array.isArray(v) ? v.length : v !== undefined && v !== ''));
  const canReview = Boolean(draft.phoneNumber && draft.task);
  const ruling = check?.review;

  return (
    <>
      <div className="screen intake">
        <h1 className="title">{profile ? (profile.me.profile.onboarded ? 'Update your profile' : "Let's get to know you") : followUp ? 'How did it go?' : 'Who should I call?'}</h1>
        <p className="lede">
          {profile
            ? 'A few quick questions so future calls need fewer. Every question is optional; tap the mic or type.'
            : followUp
              ? "Tap the mic and I'll tell you the result. Ask me anything about the call, or have me call again."
              : "Tell me in your language: who to call, what you need, and when you're free. I'll ask about anything missing."}
        </p>
        {followUp?.headline && <div className="summary-card"><p className="summary-headline">{followUp.headline}</p></div>}

        <div className="two intake-options">
          <label className="field compact">
            <span className="field-label">I'll speak</span>
            <select value={context.userLanguage} disabled={live} onChange={(e) => onLanguageChange(e.target.value)}>
              {languages.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <VoicePicker value={voice} onChange={onVoiceChange} disabled={live} />
        </div>
        {!live && <p className="field-help">The assistant and the call use this voice (★ most natural). Talk or type below; you can switch any time.</p>}

        <div className="mic-wrap">
          <button
            type="button"
            className={`mic-btn ${live && micOn ? `live ${status}` : live ? 'muted' : ''}`}
            onClick={toggleMic}
            disabled={status === 'connecting'}
            aria-label={live && micOn ? 'Turn the mic off' : 'Talk'}
            aria-pressed={live && micOn}
          >
            <span aria-hidden>🎙</span>
          </button>
          <div className="mic-status" aria-live="polite">
            {!live
              ? hasDraft
                ? 'Tap to keep talking'
                : 'Tap to talk'
              : micOn
                ? STATUS_TEXT[status!]
                : status === 'speaking' || status === 'thinking'
                  ? STATUS_TEXT[status]
                  : 'Mic off · type below'}
          </div>
          {live && (
            <div className="mic-tools">
              <button type="button" className="text-btn" onClick={toggleSpeaker} aria-pressed={!speakerOn}>
                {speakerOn ? '🔈 Sound on' : '🔇 Sound off'}
              </button>
              <button type="button" className="text-btn" onClick={stop}>
                End
              </button>
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="intake-lines">
            {lines.map((l) => (
              <div key={l.id} className={`bubble ${l.role}`}>
                {l.text}
              </div>
            ))}
          </div>
        )}

        {profile && <ProfileCard me={profile.me} />}

        {!profile && places.length > 0 && (
          <div className="places">
            {places.map((p) => (
              <button
                key={p.phone}
                type="button"
                className={`place ${draft.phoneNumber && p.phone?.endsWith(draft.phoneNumber.replace(/\D/g, '').slice(-10)) ? 'on' : ''}`}
                onClick={() => {
                  void say(`(Call ${p.name}${p.address ? `, ${p.address}` : ''}, at ${p.phone}.)`);
                }}
              >
                <b>{p.name}</b>
                <span>
                  {[
                    p.distanceMeters != null ? `${(p.distanceMeters / 1609).toFixed(1)} mi` : null,
                    p.openNow === true ? 'open now' : p.openNow === false ? 'closed now' : null,
                    p.rating ? `${p.rating}★${p.ratingCount ? ` (${p.ratingCount})` : ''}` : null,
                    p.inPhoneBookAs ? `in your phone book as ${p.inPhoneBookAs}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {p.address && <span>{p.address}</span>}
                <span>
                  {p.phone ? displayPhone(p.phone) : ''}
                  {!p.verified && <em className="unverified"> · from a web search, double-check</em>}
                </span>
              </button>
            ))}
          </div>
        )}

        {!profile && hasDraft && (
          <div className="review">
            {draft.counterpartName && (
              <div className="review-row">
                <span>Calling</span>
                <b>{draft.counterpartName}</b>
              </div>
            )}
            {draft.phoneNumber && (
              <div className="review-row">
                <span>Number</span>
                <b>{displayPhone(draftToRequest(draft, context).to)}</b>
              </div>
            )}
            {(draft.taskInUserLanguage || draft.task) && (
              <div className="review-row">
                <span>Task</span>
                <b>{draft.taskInUserLanguage || draft.task}</b>
              </div>
            )}
            {draft.callLanguage && (
              <div className="review-row">
                <span>Speaks</span>
                <b>{draft.callLanguage}</b>
              </div>
            )}
            {ruling && (
              <div className={`review-row tier-${ruling.tier}`}>
                <span>{TIER_TEXT[ruling.tier]}</span>
                <b>{ruling.reasonInUserLanguage || ruling.reason}</b>
              </div>
            )}
          </div>
        )}

        {check && !check.ok && check.missing.length > 0 && <p className="field-help">Still needed: {check.missing.join(', ')}</p>}
      </div>

      <div className="bottom-bar">
        {error && <div className="bar-error">{error}</div>}
        {live && lines.length > 0 && (
          <div className="chips skip-chips">
            <button type="button" className="chip" onClick={() => void say('(Skip this question.)')}>
              Skip this question
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => void say(profile ? "(That's all. Skip the remaining questions.)" : "(That's all. Skip the remaining questions and check the request.)")}
            >
              That's all
            </button>
          </div>
        )}
        <form className="composer" onSubmit={sendText}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={live ? 'Type a reply…' : 'Or type here…'}
            enterKeyHint="send"
            aria-label="Type a message to the assistant"
          />
          <button type="submit" className="send-btn" disabled={!text.trim() || status === 'connecting'} aria-label="Send">
            ↑
          </button>
        </form>
        {profile ? (
          <div className="bar-row">
            <button type="button" className="secondary-btn" onClick={() => (stop(), profile.onSkip())}>
              {profile.me.profile.onboarded ? 'Close' : 'Skip for now'}
            </button>
            <button type="button" className={`primary-btn ${ready ? 'call' : ''}`} onClick={() => (stop(), profile.onDone())}>
              Done
            </button>
          </div>
        ) : (
          <div className="bar-row">
            <button type="button" className="secondary-btn" onClick={() => (stop(), onType(draft))}>
              Use the form
            </button>
            <button type="button" className={`primary-btn ${ready ? 'call' : ''}`} disabled={!canReview} onClick={review}>
              Review &amp; call
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** What the profile interview has saved so far. */
function ProfileCard({ me }: { me: Me }) {
  const p = me.profile;
  const rows: [string, string][] = [
    ['Name', p.name],
    ['Pronouns', p.pronouns ?? ''],
    ['Languages', [p.preferredLanguage, ...p.otherLanguages].join(', ')],
    ['Calls in', p.defaultCallLanguage ?? ''],
    ['Time zone', p.timezone],
    ['Usually free', p.usualAvailability.map((w) => `${w.days.join('/')} ${w.start}–${w.end}`).join('; ')],
    ['May share', p.shareable.map((f) => f.label).join(', ')],
    ['Preferences', p.preferences.join('; ')],
  ];
  return (
    <div className="review">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="review-row">
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
    </div>
  );
}
