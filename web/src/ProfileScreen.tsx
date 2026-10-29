import { useState, type FormEvent } from 'react';
import { languageCode, LANGUAGES } from '../../shared/languages';
import { displayPhone } from '../../shared/phone';
import type { Me } from '../../shared/types';
import { deleteAccount, updateProfile } from './api';
import type { Settings } from './settings';

interface Props {
  settings: Settings;
  me: Me;
  onChange: (me: Me) => void;
  /** First-time setup: one Continue button, no Back, no account actions. */
  setup?: boolean;
  onClose: () => void;
  onSignOut: () => void;
  onDeleted: () => void;
}

/** Who the user is and which languages they speak; also the first screen after signing up. */
export function ProfileScreen({ settings, me, onChange, setup, onClose, onSignOut, onDeleted }: Props) {
  const p = me.profile;
  const [name, setName] = useState(p.name);
  const [language, setLanguage] = useState(p.preferredLanguage);
  const [usual, setUsual] = useState(p.defaultCallLanguage ?? 'English');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const changed = name.trim() !== p.name || language !== p.preferredLanguage || usual !== (p.defaultCallLanguage ?? 'English');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onChange(await updateProfile(settings, { name: name.trim(), preferredLanguage: language, defaultCallLanguage: usual, onboarded: true }));
      if (setup) onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="screen profile" onSubmit={submit}>
      <h1 className="title">{setup ? 'Welcome to CallBridge' : 'Your profile'}</h1>
      <p className="lede">{setup ? 'Tell us your name and languages. Captions show up in your language.' : `${displayPhone(me.phone)}`}</p>

      <label className="field">
        <span className="field-label">Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="So the interpreter can introduce you" autoComplete="given-name" />
      </label>
      <label className="field">
        <span className="field-label">You speak</span>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">People you call usually speak</span>
        <select value={usual} onChange={(e) => setUsual(e.target.value)}>
          {LANGUAGES.filter((l) => languageCode(l) !== languageCode(language)).map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      {error && <div className="alert">{error}</div>}

      {!setup && (
        <div className="profile-danger">
          <button type="button" className="text-btn" onClick={onSignOut}>
            Sign out
          </button>
          {confirmDelete ? (
            <span>
              Delete your account, phone book, and call history?{' '}
              <button
                type="button"
                className="text-btn danger"
                onClick={async () => {
                  await deleteAccount(settings).catch(() => {});
                  onDeleted();
                }}
              >
                Yes, delete
              </button>
              <button type="button" className="text-btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="text-btn danger" onClick={() => setConfirmDelete(true)}>
              Delete account
            </button>
          )}
        </div>
      )}

      <div className="bottom-bar">
        <div className="bar-row">
          {!setup && (
            <button type="button" className="secondary-btn" onClick={onClose}>
              Back
            </button>
          )}
          <button type="submit" className="primary-btn" disabled={busy || !name.trim() || (!setup && !changed)}>
            {setup ? 'Continue' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}
