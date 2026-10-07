import { useState, type FormEvent } from 'react';
import { formatUsPhone, usNationalDigits } from '../../shared/phone';
import type { AuthResult } from '../../shared/types';
import { startSignIn, verifySignIn } from './api';
import type { Settings } from './settings';

interface Props {
  settings: Settings;
  languages: string[];
  language: string;
  onLanguageChange: (language: string) => void;
  onSignedIn: (result: AuthResult) => void;
}

/** Phone number is the only sign-in: a 6-digit code by text message. */
export function SignIn({ settings, languages, language, onLanguageChange, onSignedIn }: Props) {
  const [digits, setDigits] = useState('');
  const [sent, setSent] = useState<null | 'sms' | 'log'>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phone = digits ? `+1${digits}` : '';

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (digits.length !== 10) return setError('Enter your 10-digit mobile number.');
    setBusy(true);
    setError(null);
    try {
      const r = await startSignIn(settings, phone);
      setSent(r.channel);
      setCode('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
      onSignedIn(await verifySignIn(settings, { phone, code, language, timezone }));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="screen signin">
      <h1 className="title">Sign in</h1>
      <p className="lede">Your phone number is your account. We'll text you a code.</p>

      {!sent ? (
        <form onSubmit={send}>
          <label className="field">
            <span className="field-label">Mobile number</span>
            <span className="phone-input">
              <span className="phone-prefix" aria-hidden="true">
                +1
              </span>
              <input
                className="input-xl"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(415)-555-0123"
                value={formatUsPhone(digits)}
                onChange={(e) => setDigits(usNationalDigits(e.target.value))}
                autoFocus
              />
            </span>
          </label>
          <label className="field">
            <span className="field-label">I'll speak</span>
            <select value={language} onChange={(e) => onLanguageChange(e.target.value)}>
              {languages.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          {error && <div className="field-error">{error}</div>}
          <button type="submit" className="primary-btn wide" disabled={busy || digits.length !== 10}>
            {busy ? 'Sending…' : 'Text me a code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <label className="field">
            <span className="field-label">Code sent to +1 {formatUsPhone(digits)}</span>
            <input
              className="input-xl code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            {sent === 'log' && <span className="field-help">Test mode: the code is printed in the server's terminal, not texted.</span>}
          </label>
          {error && <div className="field-error">{error}</div>}
          <button type="submit" className="primary-btn wide" disabled={busy || code.length < 4}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <div className="signin-links">
            <button type="button" className="text-btn" onClick={() => void send()} disabled={busy}>
              Send a new code
            </button>
            <button type="button" className="text-btn" onClick={() => (setSent(null), setError(null))}>
              Change number
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
