import { useEffect, useRef, useState } from 'react';
import type { CallRecord, CallStatus } from '../../shared/types';

const STATUS_TEXT: Record<CallStatus, string> = {
  preparing: 'Preparing…',
  dialing: 'Dialing…',
  connected: 'Connected',
  in_progress: 'In progress',
  analyzing: 'Wrapping up…',
  completed: 'Call ended',
  failed: 'Call failed',
};
const STEPS: CallStatus[] = ['preparing', 'dialing', 'connected', 'in_progress', 'completed'];

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const fmtAppointment = (date: string, time: string) => {
  const d = new Date(`${date}T${time}:00`);
  if (Number.isNaN(d.getTime())) return { day: date, time };
  return {
    day: d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
};

interface Props {
  call: CallRecord;
  demo: boolean;
  error: string | null;
  onDone: () => void;
}

export function CallScreen({ call, demo, error, onDone }: Props) {
  const finished = call.status === 'completed' || call.status === 'failed';
  return finished && call.result ? <ResultScreen call={call} demo={demo} onDone={onDone} /> : <LiveCall call={call} demo={demo} error={error} onDone={onDone} />;
}

function LiveCall({ call, demo, error, onDone }: Props) {
  const now = useNow(true);
  const live = call.status === 'connected' || call.status === 'in_progress';
  const idx = STEPS.indexOf(call.status === 'analyzing' ? 'completed' : call.status);
  const elapsed = call.metrics.answeredAt ? fmtDuration((call.metrics.endedAt ?? now) - call.metrics.answeredAt) : null;

  return (
    <>
      <div className="call-hero">
        {demo && <div className="demo-pill">Demo — simulated call</div>}
        <div className={`avatar ${live ? 'live' : ''} ${call.status === 'failed' ? 'failed' : ''}`} aria-hidden>
          <span>🤖</span>
        </div>
        <div className="hero-number">{call.request.to}</div>
        <div className="hero-status" aria-live="polite">
          {STATUS_TEXT[call.status]}
          {elapsed && <span className="hero-timer"> · {elapsed}</span>}
        </div>
        <div className="progress-dots" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={i < idx ? 'done' : i === idx ? 'current' : ''} />
          ))}
        </div>
      </div>

      {(error || call.status === 'failed') && <div className="alert">{error ?? call.failureReason ?? 'The call failed.'}</div>}

      <Transcript call={call} live />

      <div className="bottom-bar">
        <div className="bar-row">
          <button type="button" className="secondary-btn" onClick={onDone}>
            {call.status === 'failed' || error ? 'Back' : demo ? 'End demo' : 'Leave (call keeps going)'}
          </button>
        </div>
      </div>
    </>
  );
}

function Transcript({ call, live }: { call: CallRecord; live: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  const entries = call.transcript.filter((t) => t.text || t.pending);
  const last = entries.at(-1);
  useEffect(() => {
    if (live) end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [entries.length, last?.text, live]);

  return (
    <div className="chat" aria-live={live ? 'polite' : undefined}>
      {entries.length === 0 && <div className="chat-empty">The conversation will appear here.</div>}
      {entries.map((t) => (
        <div key={t.id} className={`msg ${t.speaker}`}>
          <div className="msg-who">{t.speaker === 'assistant' ? 'Your assistant' : 'Business'}</div>
          <div className="msg-bubble">
            {t.text || (
              <span className="typing" aria-label="speaking">
                <i />
                <i />
                <i />
              </span>
            )}
            {t.interrupted && <span className="msg-note"> · interrupted</span>}
          </div>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

function Section({ title, items, tone }: { title: string; items: string[]; tone?: 'ask' | 'warn' | 'no' }) {
  if (items.length === 0) return null;
  return (
    <div className={`rsection ${tone ?? ''}`}>
      <div className="rsection-title">{title}</div>
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function ResultScreen({ call, demo, onDone }: { call: CallRecord; demo: boolean; onDone: () => void }) {
  const r = call.result!;
  const [showTranscript, setShowTranscript] = useState(false);
  const appt = r.appointment ? fmtAppointment(r.appointment.date, r.appointment.time) : null;
  const duration = call.metrics.answeredAt && call.metrics.endedAt ? fmtDuration(call.metrics.endedAt - call.metrics.answeredAt) : null;

  return (
    <>
      <div className={`result-hero ${r.success ? 'ok' : 'bad'}`}>
        {demo && <div className="demo-pill">Demo result</div>}
        <div className="result-icon" aria-hidden>
          {r.success ? '✓' : '!'}
        </div>
        <div className="result-title">{r.success ? 'Done' : call.status === 'failed' ? 'Call failed' : 'Not completed'}</div>
        <div className="result-sub">
          {call.request.to}
          {duration && ` · ${duration}`}
        </div>
      </div>

      {appt && (
        <div className="appt-card">
          <div className="appt-label">Appointment confirmed</div>
          <div className="appt-day">{appt.day}</div>
          <div className="appt-time">{appt.time}</div>
          {r.appointment?.notes && <div className="appt-notes">{r.appointment.notes}</div>}
        </div>
      )}

      <div className="summary-card">
        <p className="summary-main">{r.summaryInUserLanguage}</p>
        {r.summaryInUserLanguage !== r.summary && <p className="summary-alt">{r.summary}</p>}
      </div>

      <Section title="Needs your answer" items={r.unresolvedQuestions} tone="ask" />
      <Section title="The assistant declined" items={r.refusedDecisions.map((d) => d.request)} tone="no" />
      <Section title="Next steps" items={r.followUpsForUser} />
      <Section title="Please double-check" items={r.policyWarnings} tone="warn" />

      <div className="facts-row">
        <div>
          <span>Extra charges</span>
          <b>{r.additionalChargesAuthorized ? 'Authorized' : 'None agreed'}</b>
        </div>
        <div>
          <span>Commitments</span>
          <b>{r.commitments.length}</b>
        </div>
      </div>

      {call.transcript.length > 0 && (
        <>
          <button type="button" className="ghost-btn" onClick={() => setShowTranscript((v) => !v)} aria-expanded={showTranscript}>
            {showTranscript ? 'Hide transcript' : `Show transcript (${call.transcript.length})`}
          </button>
          {showTranscript && <Transcript call={call} live={false} />}
        </>
      )}

      <details className="more dev">
        <summary>Developer details</summary>
        <DevDetails call={call} />
      </details>

      <div className="bottom-bar">
        <div className="bar-row">
          <button type="button" className="primary-btn" onClick={onDone}>
            New call
          </button>
        </div>
      </div>
    </>
  );
}

function DevDetails({ call }: { call: CallRecord }) {
  const m = call.metrics;
  const lat = [...m.turnLatenciesMs].sort((a, b) => a - b);
  const median = lat.length ? lat[Math.floor(lat.length / 2)] : undefined;
  return (
    <div className="dev-body">
      <dl>
        <dt>Call ID</dt>
        <dd>{call.id}</dd>
        {call.providerCallId && (
          <>
            <dt>Provider SID</dt>
            <dd>{call.providerCallId}</dd>
          </>
        )}
        {m.answeredAt && m.firstAssistantAudioAt && (
          <>
            <dt>Answer → first AI audio</dt>
            <dd>{m.firstAssistantAudioAt - m.answeredAt} ms</dd>
          </>
        )}
        {median !== undefined && (
          <>
            <dt>Turn latency median / max</dt>
            <dd>
              {median} / {lat.at(-1)} ms
            </dd>
          </>
        )}
        <dt>Interruptions · tool calls</dt>
        <dd>
          {m.interruptions} · {m.toolCalls}
        </dd>
        {call.endReason && (
          <>
            <dt>End reason</dt>
            <dd>{call.endReason}</dd>
          </>
        )}
      </dl>
      {call.decisions.length > 0 && (
        <>
          <div className="dev-title">Policy decisions</div>
          {call.decisions.map((d) => (
            <div key={d.id} className="decision">
              <b>{d.outcome}</b> <code>{d.tool}</code> {d.request}
              <div className="muted">{d.reason}</div>
            </div>
          ))}
        </>
      )}
      <div className="dev-title">Structured result</div>
      <pre>{JSON.stringify(call.result, null, 2)}</pre>
      <div className="dev-title">Event log</div>
      <pre>{call.events.map((e) => `${new Date(e.at).toLocaleTimeString()} ${e.type}${e.detail ? ` ${e.detail}` : ''}`).join('\n')}</pre>
    </div>
  );
}
