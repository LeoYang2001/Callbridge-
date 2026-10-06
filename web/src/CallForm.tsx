import { useEffect, useState } from 'react';
import type { AuthorizedFact, AvailabilityWindow, CallRequest, Weekday } from '../../shared/types';
import { WEEKDAYS } from '../../shared/types';

const DAY_LABEL: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const LANGUAGES = ['Chinese (Mandarin)', 'Chinese (Cantonese)', 'Spanish', 'Vietnamese', 'Korean', 'Tagalog', 'Russian', 'Arabic', 'Hindi', 'Japanese', 'English'];
const STORAGE_KEY = 'callbridge.form.v1';

export const defaultRequest = (): CallRequest => ({
  to: '',
  user: { name: 'Leo', pronouns: '', preferredLanguage: 'Chinese (Mandarin)' },
  callLanguage: 'English',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles',
  authorizedInfo: [{ label: 'Callback phone number', value: '' }],
  instructions:
    "Call my dentist and schedule a teeth cleaning for Leo. Leo is available Wednesday or Thursday after 2 PM. Do not agree to additional procedures or charges. If asked something you don't know, say you need to confirm rather than guessing.",
  constraints: {
    availability: [{ days: ['wed', 'thu'], start: '14:00', end: '18:00' }],
    maxAdditionalCostUsd: 0,
  },
});

function loadSaved(): CallRequest {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultRequest(), ...(JSON.parse(raw) as CallRequest) };
  } catch {
    /* storage unavailable */
  }
  return defaultRequest();
}

interface Props {
  disabled: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (req: CallRequest) => void;
}

export function CallForm({ disabled, submitting, error, onSubmit }: Props) {
  const [req, setReq] = useState<CallRequest>(loadSaved);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(req));
    } catch {
      /* storage unavailable */
    }
  }, [req]);

  const set = <K extends keyof CallRequest>(key: K, value: CallRequest[K]) => setReq((r) => ({ ...r, [key]: value }));
  const setUser = (patch: Partial<CallRequest['user']>) => setReq((r) => ({ ...r, user: { ...r.user, ...patch } }));
  const setConstraints = (patch: Partial<CallRequest['constraints']>) =>
    setReq((r) => ({ ...r, constraints: { ...r.constraints, ...patch } }));

  const windows = req.constraints.availability;
  const setWindow = (i: number, patch: Partial<AvailabilityWindow>) =>
    setConstraints({ availability: windows.map((w, j) => (j === i ? { ...w, ...patch } : w)) });
  const toggleDay = (i: number, day: Weekday) => {
    const days = windows[i]!.days;
    setWindow(i, { days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] });
  };

  const facts = req.authorizedInfo;
  const setFact = (i: number, patch: Partial<AuthorizedFact>) =>
    set('authorizedInfo', facts.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...req,
      constraints: {
        ...req.constraints,
        availability: windows.filter((w) => w.days.length > 0),
        earliestDate: req.constraints.earliestDate || undefined,
        latestDate: req.constraints.latestDate || undefined,
      },
    });
  };

  return (
    <form className="card form" onSubmit={submit}>
      <section>
        <h2>Who to call</h2>
        <label>
          Phone number
          <input
            required
            type="tel"
            inputMode="tel"
            placeholder="+1 415 555 0123"
            value={req.to}
            onChange={(e) => set('to', e.target.value)}
          />
        </label>
        <div className="row">
          <label>
            Language for the call
            <input list="languages" value={req.callLanguage} onChange={(e) => set('callLanguage', e.target.value)} />
          </label>
          <label>
            Time zone
            <input value={req.timezone} onChange={(e) => set('timezone', e.target.value)} />
          </label>
        </div>
      </section>

      <section>
        <h2>About you</h2>
        <div className="row">
          <label>
            Name
            <input required value={req.user.name} onChange={(e) => setUser({ name: e.target.value })} />
          </label>
          <label>
            <span>Pronouns <span className="muted">(optional)</span></span>
            <input placeholder="e.g. he/him" value={req.user.pronouns ?? ''} onChange={(e) => setUser({ pronouns: e.target.value })} />
          </label>
        </div>
        <label>
          Your preferred language
          <input list="languages" value={req.user.preferredLanguage} onChange={(e) => setUser({ preferredLanguage: e.target.value })} />
        </label>
        <datalist id="languages">
          {LANGUAGES.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </section>

      <section>
        <h2>Task</h2>
        <label>
          Instructions
          <textarea required rows={5} value={req.instructions} onChange={(e) => set('instructions', e.target.value)} />
        </label>
      </section>

      <section>
        <h2>
          Availability <span className="tag">assistant may choose</span>
        </h2>
        <p className="hint">The assistant may only book a time inside these windows. The server checks every time it proposes.</p>
        {windows.map((w, i) => (
          <div className="window" key={i}>
            <div className="days">
              {WEEKDAYS.map((d) => (
                <button type="button" key={d} className={`day ${w.days.includes(d) ? 'on' : ''}`} onClick={() => toggleDay(i, d)} aria-pressed={w.days.includes(d)}>
                  {DAY_LABEL[d]}
                </button>
              ))}
            </div>
            <div className="row tight">
              <label>
                Start after
                <input type="time" value={w.start} onChange={(e) => setWindow(i, { start: e.target.value })} />
              </label>
              <label>
                Start before
                <input type="time" value={w.end} onChange={(e) => setWindow(i, { end: e.target.value })} />
              </label>
              <button type="button" className="link" onClick={() => setConstraints({ availability: windows.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="link"
          onClick={() => setConstraints({ availability: [...windows, { days: [], start: '09:00', end: '17:00' }] })}
        >
          + Add time window
        </button>
        <div className="row">
          <label>
            <span>Not before <span className="muted">(optional)</span></span>
            <input type="date" value={req.constraints.earliestDate ?? ''} onChange={(e) => setConstraints({ earliestDate: e.target.value })} />
          </label>
          <label>
            <span>Not after <span className="muted">(optional)</span></span>
            <input type="date" value={req.constraints.latestDate ?? ''} onChange={(e) => setConstraints({ latestDate: e.target.value })} />
          </label>
        </div>
        <label>
          Extra charges the assistant may accept without asking (USD)
          <input
            type="number"
            min={0}
            step={1}
            value={req.constraints.maxAdditionalCostUsd}
            onChange={(e) => setConstraints({ maxAdditionalCostUsd: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
      </section>

      <section>
        <h2>
          Information the assistant may share <span className="tag">answers automatically</span>
        </h2>
        <p className="hint">
          Only what you list here is given to the assistant. Never enter passwords, card numbers or Social Security numbers. The server rejects them.
        </p>
        {facts.map((f, i) => (
          <div className="row tight" key={i}>
            <input aria-label="Label" placeholder="e.g. Date of birth" value={f.label} onChange={(e) => setFact(i, { label: e.target.value })} />
            <input aria-label="Value" placeholder="Value" value={f.value} onChange={(e) => setFact(i, { value: e.target.value })} />
            <button type="button" className="link" onClick={() => set('authorizedInfo', facts.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="link" onClick={() => set('authorizedInfo', [...facts, { label: '', value: '' }])}>
          + Add information
        </button>
      </section>

      <section className="submit">
        <label className="check">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>
            I'm asking for this call to a specific business on my own behalf. I understand the other person will be told they are talking to an AI assistant.
          </span>
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={disabled || submitting || !confirmed}>
          {submitting ? 'Starting…' : 'Start call'}
        </button>
      </section>
    </form>
  );
}
