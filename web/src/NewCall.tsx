import { useEffect, useState } from 'react';
import type { AuthorizedFact, AvailabilityWindow, CallRequest, Weekday } from '../../shared/types';
import { WEEKDAYS } from '../../shared/types';

const DAY_SHORT: Record<Weekday, string> = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' };
const DAY_LONG: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const LANGUAGES = ['Chinese (Mandarin)', 'Chinese (Cantonese)', 'Spanish', 'Vietnamese', 'Korean', 'Tagalog', 'Russian', 'Arabic', 'Hindi', 'Japanese', 'English'];
const STORAGE_KEY = 'callbridge.form.v1';

const TEMPLATES: { label: string; text: string }[] = [
  {
    label: '🦷 Dentist',
    text: "Schedule a teeth cleaning. Do not agree to additional procedures or charges. If asked something you don't know, say you need to confirm rather than guessing.",
  },
  {
    label: '🍽 Restaurant',
    text: 'Book a dinner table for 2 people. Ask if they have a quiet table. Do not give any credit card details.',
  },
  {
    label: '❓ Question',
    text: "Ask whether they are open this Saturday and until what time. Don't make any booking or commitment.",
  },
];

export const defaultRequest = (): CallRequest => ({
  to: '',
  user: { name: 'Leo', pronouns: '', preferredLanguage: 'Chinese (Mandarin)' },
  callLanguage: 'English',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles',
  authorizedInfo: [{ label: 'Callback phone number', value: '' }],
  instructions: TEMPLATES[0]!.text,
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

const fmt12 = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h! % 12 === 0 ? 12 : h! % 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h! >= 12 ? 'pm' : 'am'}`;
};
const describeWindow = (w: AvailabilityWindow) =>
  `${WEEKDAYS.filter((d) => w.days.includes(d)).map((d) => DAY_LONG[d]).join(', ') || 'No days'} · ${fmt12(w.start)}–${fmt12(w.end)}`;

interface Props {
  demo: boolean;
  blockedReason: string | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (req: CallRequest) => void;
}

const STEPS = ['Call', 'Limits', 'You'] as const;

export function NewCall({ demo, blockedReason, submitting, error, onSubmit }: Props) {
  const [req, setReq] = useState<CallRequest>(loadSaved);
  const [step, setStep] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(req));
    } catch {
      /* storage unavailable */
    }
  }, [req]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    setStepError(null);
  }, [step]);

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

  const validate = (s: number): string | null => {
    if (s === 0) {
      if (!demo && req.to.replace(/\D/g, '').length < 10) return 'Enter the full phone number, including area code.';
      if (req.instructions.trim().length < 10) return 'Describe the task in a sentence or two.';
    }
    if (s === 1 && windows.some((w) => w.start >= w.end)) return 'Each time window must end after it starts.';
    if (s === 2 && !req.user.name.trim()) return 'Enter your name.';
    return null;
  };

  const next = () => {
    const err = validate(step);
    if (err) return setStepError(err);
    if (step < STEPS.length - 1) return setStep(step + 1);
    onSubmit({
      ...req,
      to: req.to || (demo ? '+1 555 010 0000' : req.to),
      constraints: {
        ...req.constraints,
        availability: windows.filter((w) => w.days.length > 0),
        earliestDate: req.constraints.earliestDate || undefined,
        latestDate: req.constraints.latestDate || undefined,
      },
    });
  };

  const isLast = step === STEPS.length - 1;
  const canSubmit = !isLast || (confirmed && !blockedReason && !submitting);

  return (
    <>
      <div className="wizard-progress" role="tablist" aria-label="Steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={i === step}
            className={`wp-step ${i === step ? 'current' : i < step ? 'done' : ''}`}
            onClick={() => i < step && setStep(i)}
          >
            <span className="wp-bar" />
            <span className="wp-label">
              {i + 1}. {s}
            </span>
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="screen">
          <h1 className="title">Who should I call?</h1>
          <label className="field">
            <span className="field-label">Phone number</span>
            <input
              className="input-xl"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={demo ? 'Optional in demo mode' : '+1 415 555 0123'}
              value={req.to}
              onChange={(e) => set('to', e.target.value)}
            />
          </label>

          <div className="field">
            <span className="field-label">What should the assistant do?</span>
            <div className="chips">
              {TEMPLATES.map((t) => (
                <button key={t.label} type="button" className={`chip ${req.instructions === t.text ? 'on' : ''}`} onClick={() => set('instructions', t.text)}>
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              rows={6}
              value={req.instructions}
              onChange={(e) => set('instructions', e.target.value)}
              placeholder="e.g. Schedule a teeth cleaning. Don't agree to extra charges."
            />
          </div>

          <label className="field">
            <span className="field-label">Language to speak on the call</span>
            <input list="languages" value={req.callLanguage} onChange={(e) => set('callLanguage', e.target.value)} />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="screen">
          <h1 className="title">What can it agree to?</h1>
          <p className="lede">The assistant can pick any time inside these windows. Every time it proposes is checked by the server.</p>

          {windows.map((w, i) => (
            <div className="panel" key={i}>
              <div className="panel-head">
                <span className="panel-title">{describeWindow(w)}</span>
                {windows.length > 1 && (
                  <button type="button" className="text-btn danger" onClick={() => setConstraints({ availability: windows.filter((_, j) => j !== i) })}>
                    Remove
                  </button>
                )}
              </div>
              <div className="daypicker">
                {WEEKDAYS.map((d) => (
                  <button
                    type="button"
                    key={d}
                    className={`daybtn ${w.days.includes(d) ? 'on' : ''}`}
                    onClick={() => toggleDay(i, d)}
                    aria-pressed={w.days.includes(d)}
                    aria-label={DAY_LONG[d]}
                  >
                    {DAY_SHORT[d]}
                  </button>
                ))}
              </div>
              <div className="two">
                <label className="field compact">
                  <span className="field-label">From</span>
                  <input type="time" value={w.start} onChange={(e) => setWindow(i, { start: e.target.value })} />
                </label>
                <label className="field compact">
                  <span className="field-label">Until</span>
                  <input type="time" value={w.end} onChange={(e) => setWindow(i, { end: e.target.value })} />
                </label>
              </div>
            </div>
          ))}
          <button type="button" className="ghost-btn" onClick={() => setConstraints({ availability: [...windows, { days: [], start: '09:00', end: '17:00' }] })}>
            + Add another time window
          </button>

          <div className="field">
            <span className="field-label">Extra charges it may accept without asking</span>
            <div className="stepper-input">
              <button type="button" aria-label="Less" onClick={() => setConstraints({ maxAdditionalCostUsd: Math.max(0, req.constraints.maxAdditionalCostUsd - 10) })}>
                −
              </button>
              <div className="stepper-value">
                {req.constraints.maxAdditionalCostUsd === 0 ? 'None' : `Up to $${req.constraints.maxAdditionalCostUsd}`}
              </div>
              <button type="button" aria-label="More" onClick={() => setConstraints({ maxAdditionalCostUsd: req.constraints.maxAdditionalCostUsd + 10 })}>
                +
              </button>
            </div>
            <span className="field-help">Anything above this, it will say it needs to check with you.</span>
          </div>

          <details className="more">
            <summary>Date range (optional)</summary>
            <div className="two">
              <label className="field compact">
                <span className="field-label">Not before</span>
                <input type="date" value={req.constraints.earliestDate ?? ''} onChange={(e) => setConstraints({ earliestDate: e.target.value })} />
              </label>
              <label className="field compact">
                <span className="field-label">Not after</span>
                <input type="date" value={req.constraints.latestDate ?? ''} onChange={(e) => setConstraints({ latestDate: e.target.value })} />
              </label>
            </div>
          </details>

          <div className="never">
            <div className="never-title">Never agreed to, no matter what</div>
            <div className="never-list">Medical consent · Contracts · Payment details · Passwords · ID numbers</div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="screen">
          <h1 className="title">About you</h1>
          <div className="two">
            <label className="field">
              <span className="field-label">Your name</span>
              <input autoComplete="given-name" value={req.user.name} onChange={(e) => setUser({ name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">
                Pronouns <span className="muted">optional</span>
              </span>
              <input placeholder="e.g. he/him" value={req.user.pronouns ?? ''} onChange={(e) => setUser({ pronouns: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Results in your language</span>
            <input list="languages" value={req.user.preferredLanguage} onChange={(e) => setUser({ preferredLanguage: e.target.value })} />
          </label>

          <div className="field">
            <span className="field-label">Information it may share</span>
            <span className="field-help">Only what's listed here is given to the assistant. No passwords, card or ID numbers.</span>
            {facts.map((f, i) => (
              <div className="fact" key={i}>
                <input aria-label="What" placeholder="What (e.g. Date of birth)" value={f.label} onChange={(e) => setFact(i, { label: e.target.value })} />
                <input aria-label="Value" placeholder="Value" value={f.value} onChange={(e) => setFact(i, { value: e.target.value })} />
                <button type="button" className="icon-btn" aria-label="Remove" onClick={() => set('authorizedInfo', facts.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="ghost-btn" onClick={() => set('authorizedInfo', [...facts, { label: '', value: '' }])}>
              + Add information
            </button>
          </div>

          <details className="more">
            <summary>Time zone: {req.timezone}</summary>
            <label className="field compact">
              <span className="field-label">Time zone</span>
              <input value={req.timezone} onChange={(e) => set('timezone', e.target.value)} />
            </label>
          </details>

          <div className="review">
            <div className="review-row">
              <span>Calling</span>
              <b>{req.to || (demo ? 'Demo number' : '—')}</b>
            </div>
            <div className="review-row">
              <span>Speaks</span>
              <b>{req.callLanguage}</b>
            </div>
            <div className="review-row">
              <span>Available</span>
              <b>{windows.filter((w) => w.days.length).map(describeWindow).join('; ') || 'Not set'}</b>
            </div>
            <div className="review-row">
              <span>Extra charges</span>
              <b>{req.constraints.maxAdditionalCostUsd ? `Up to $${req.constraints.maxAdditionalCostUsd}` : 'None'}</b>
            </div>
          </div>

          <label className="consent">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I'm asking for this call to a specific business, for myself. The assistant will say it's an AI.</span>
          </label>
        </div>
      )}

      <datalist id="languages">
        {LANGUAGES.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      <div className="bottom-bar">
        {(stepError || error || (isLast && blockedReason)) && <div className="bar-error">{stepError ?? error ?? blockedReason}</div>}
        <div className="bar-row">
          {step > 0 && (
            <button type="button" className="secondary-btn" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button type="button" className={`primary-btn ${isLast ? 'call' : ''}`} disabled={!canSubmit} onClick={next}>
            {isLast ? (submitting ? 'Starting…' : demo ? '▶ Start demo call' : '📞 Start call') : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
