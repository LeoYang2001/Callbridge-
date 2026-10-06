import { useEffect, useRef, useState } from 'react';
import type { CallRecord, CallStatus } from '../../shared/types';

const STEPS: { status: CallStatus; label: string }[] = [
  { status: 'preparing', label: 'Preparing' },
  { status: 'dialing', label: 'Dialing' },
  { status: 'connected', label: 'Connected' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'analyzing', label: 'Wrapping up' },
  { status: 'completed', label: 'Completed' },
];
const ORDER = STEPS.map((s) => s.status);

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

const fmtDate = (date: string, time?: string) => {
  const d = new Date(`${date}T${time ?? '00:00'}:00`);
  if (Number.isNaN(d.getTime())) return `${date} ${time ?? ''}`;
  return d.toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(time ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
};

export function CallView({ call, onReset }: { call: CallRecord; onReset: () => void }) {
  const done = call.status === 'completed' || call.status === 'failed';
  const now = useNow(!done);
  const started = call.metrics.answeredAt;
  const ended = call.metrics.endedAt;

  return (
    <div className="stack">
      <div className="card">
        <div className="call-head">
          <div>
            <div className="muted small">Calling</div>
            <div className="number">{call.request.to}</div>
          </div>
          {started && <div className="timer">{fmtDuration((ended ?? now) - started)}</div>}
        </div>
        <Stepper status={call.status} />
        {call.status === 'failed' && <div className="error">{call.failureReason ?? 'The call failed.'}</div>}
      </div>

      {call.result && <ResultCard call={call} />}

      <Transcript call={call} live={!done} />

      {done && (
        <button className="primary" onClick={onReset}>
          New call
        </button>
      )}

      <DebugPanel call={call} />
    </div>
  );
}

function Stepper({ status }: { status: CallStatus }) {
  const failed = status === 'failed';
  const idx = ORDER.indexOf(status);
  return (
    <ol className="stepper">
      {STEPS.map((s, i) => {
        const state = failed ? 'idle' : i < idx || status === 'completed' ? 'done' : i === idx ? 'active' : 'idle';
        return (
          <li key={s.status} className={state}>
            <span className="dot" />
            {s.label}
          </li>
        );
      })}
      {failed && (
        <li className="failed">
          <span className="dot" />
          Failed
        </li>
      )}
    </ol>
  );
}

function Transcript({ call, live }: { call: CallRecord; live: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  const entries = call.transcript.filter((t) => t.text || t.pending);
  useEffect(() => {
    if (live) end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [entries.length, live]);

  if (entries.length === 0 && !live) return null;
  return (
    <div className="card">
      <h2>Transcript {live && <span className="tag live">live</span>}</h2>
      {entries.length === 0 && <p className="muted">Waiting for the conversation to start…</p>}
      <div className="transcript">
        {entries.map((t) => (
          <div key={t.id} className={`line ${t.speaker}`}>
            <div className="who">{t.speaker === 'assistant' ? 'AI assistant' : 'Business'}</div>
            <div className="bubble">
              {t.text || <span className="muted">…</span>}
              {t.interrupted && <span className="muted small"> (interrupted)</span>}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone?: 'warn' }) {
  if (items.length === 0) return null;
  return (
    <div className={`result-block ${tone ?? ''}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function ResultCard({ call }: { call: CallRecord }) {
  const r = call.result!;
  return (
    <div className="card">
      <div className="result-head">
        <span className={`badge ${r.success ? 'ok' : 'bad'}`}>{r.success ? 'Success' : 'Not completed'}</span>
        <span className="muted small">{r.objective.replace(/_/g, ' ')}</span>
      </div>

      {r.appointment && (
        <div className="appointment">
          <div className="muted small">Confirmed appointment</div>
          <div className="big">{fmtDate(r.appointment.date, r.appointment.time)}</div>
          {r.appointment.notes && <div className="muted">{r.appointment.notes}</div>}
        </div>
      )}

      <p className="summary-native">{r.summaryInUserLanguage}</p>
      {r.summaryInUserLanguage !== r.summary && <p className="muted">{r.summary}</p>}

      <List title="Needs your decision or information" items={r.unresolvedQuestions} />
      <List title="Decisions the assistant declined to make" items={r.refusedDecisions.map((d) => `${d.request}: ${d.reason}`)} />
      <List title="Next steps" items={r.followUpsForUser} />
      <List title="Please verify" items={r.policyWarnings} tone="warn" />

      <div className="facts">
        <span>Extra charges authorized: <b>{r.additionalChargesAuthorized ? 'yes' : 'no'}</b></span>
        <span>Validated commitments: <b>{r.commitments.length}</b></span>
      </div>

      <details>
        <summary>Structured result (JSON)</summary>
        <pre>{JSON.stringify(r, null, 2)}</pre>
      </details>
    </div>
  );
}

function DebugPanel({ call }: { call: CallRecord }) {
  const m = call.metrics;
  const lat = [...m.turnLatenciesMs].sort((a, b) => a - b);
  const median = lat.length ? lat[Math.floor(lat.length / 2)] : undefined;
  return (
    <details className="card debug">
      <summary>Developer details</summary>
      <div className="facts">
        <span>Call ID: <code>{call.id}</code></span>
        {call.providerCallId && <span>Provider SID: <code>{call.providerCallId}</code></span>}
        {m.dialedAt && m.answeredAt && <span>Ring time: {fmtDuration(m.answeredAt - m.dialedAt)}</span>}
        {m.answeredAt && m.firstAssistantAudioAt && <span>Answer → first AI audio: {m.firstAssistantAudioAt - m.answeredAt} ms</span>}
        {median !== undefined && <span>Turn latency (median / max): {median} / {lat.at(-1)} ms</span>}
        <span>Interruptions: {m.interruptions}</span>
        <span>Tool calls: {m.toolCalls}</span>
        {call.endReason && <span>End reason: {call.endReason}</span>}
      </div>
      {call.decisions.length > 0 && (
        <>
          <h3>Policy decisions</h3>
          <table>
            <tbody>
              {call.decisions.map((d) => (
                <tr key={d.id}>
                  <td>{d.tool}</td>
                  <td>{d.request}</td>
                  <td><b>{d.outcome}</b></td>
                  <td className="muted">{d.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h3>Event log</h3>
      <pre className="log">
        {call.events.map((e) => `${new Date(e.at).toLocaleTimeString()}  ${e.type}${e.detail ? `  ${e.detail}` : ''}`).join('\n')}
      </pre>
    </details>
  );
}
