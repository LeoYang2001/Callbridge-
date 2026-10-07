import { useEffect, useRef, useState } from 'react';
import { draftToRequest, type IntakeContext } from '../../shared/intake';
import { displayPhone } from '../../shared/phone';
import type { IntakeCheckResult, IntakeDraft } from '../../shared/types';
import { startIntake, type IntakeLine, type IntakeStatus } from './voiceIntake';
import type { Settings } from './settings';

interface Props {
  settings: Settings;
  context: IntakeContext;
  languages: string[];
  onLanguageChange: (language: string) => void;
  onReview: (draft: IntakeDraft) => void;
  onType: () => void;
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

export function Intake({ settings, context, languages, onLanguageChange, onReview, onType }: Props) {
  const [status, setStatus] = useState<IntakeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<IntakeLine[]>([]);
  const [draft, setDraft] = useState<IntakeDraft>({});
  const [check, setCheck] = useState<IntakeCheckResult | null>(null);
  const [ready, setReady] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const live = status !== null && status !== 'ended' && status !== 'error';

  useEffect(() => () => stopRef.current?.(), []);

  const start = async () => {
    setError(null);
    setReady(false);
    try {
      stopRef.current = await startIntake(settings, context, {
        onStatus: (s, detail) => {
          setStatus(s);
          if (detail) setError(detail);
        },
        onLine: (line) =>
          setLines((prev) => {
            const i = prev.findIndex((l) => l.id === line.id);
            return i === -1 ? [...prev, line].slice(-8) : prev.map((l, j) => (j === i ? line : l));
          }),
        onDraft: (d) => {
          setDraft(d);
          setReady(false);
        },
        onCheck: setCheck,
        onReady: () => setReady(true),
      });
    } catch (e) {
      setStatus('error');
      setError((e as Error).message);
    }
  };

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
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
        <h1 className="title">Who should I call?</h1>
        <p className="lede">Tell me in your language: who to call, what you need, and when you're free. I'll ask about anything missing.</p>

        <label className="field compact intake-lang">
          <span className="field-label">I'll speak</span>
          <select value={context.userLanguage} disabled={live} onChange={(e) => onLanguageChange(e.target.value)}>
            {languages.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>

        <div className="mic-wrap">
          <button
            type="button"
            className={`mic-btn ${live ? `live ${status}` : ''}`}
            onClick={live ? stop : start}
            disabled={status === 'connecting'}
            aria-label={live ? 'Stop talking' : 'Start talking'}
          >
            <span aria-hidden>{live ? '■' : '🎙'}</span>
          </button>
          <div className="mic-status" aria-live="polite">
            {status && live ? STATUS_TEXT[status] : hasDraft ? 'Tap to keep talking' : 'Tap to talk'}
          </div>
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

        {hasDraft && (
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
        <div className="bar-row">
          <button type="button" className="secondary-btn" onClick={() => (stop(), onType())}>
            Type instead
          </button>
          <button type="button" className={`primary-btn ${ready ? 'call' : ''}`} disabled={!canReview} onClick={review}>
            Review &amp; call
          </button>
        </div>
      </div>
    </>
  );
}
