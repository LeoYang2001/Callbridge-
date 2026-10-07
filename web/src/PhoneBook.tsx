import { useState, type FormEvent } from 'react';
import { displayPhone, formatUsPhone, usNationalDigits } from '../../shared/phone';
import type { Contact, Me } from '../../shared/types';
import { deleteContact, saveContact } from './api';
import type { Settings } from './settings';

interface Props {
  settings: Settings;
  me: Me;
  languages: string[];
  onChange: (me: Me) => void;
  /** Start a call to this contact (opens the assistant with them filled in). */
  onCall: (contact: Contact) => void;
  onClose: () => void;
}

type Editing = { id?: string; name: string; relationship: string; digits: string; language: string };

/** People and businesses the user calls. Calls add to it; the user can add, edit, and delete. */
export function PhoneBook({ settings, me, languages, onChange, onCall, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const contacts = [...me.profile.contacts]
    .filter((c) => !q || [c.name, c.relationship, c.kind, c.phone].some((x) => x?.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const startEdit = (c?: Contact) =>
    setEditing(
      c
        ? { id: c.id, name: c.name, relationship: c.relationship ?? '', digits: usNationalDigits(c.phone), language: c.language ?? '' }
        : { name: '', relationship: '', digits: '', language: '' },
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      onChange(
        await saveContact(
          settings,
          { name: editing.name.trim(), phone: `+1${editing.digits}`, relationship: editing.relationship.trim() || undefined, language: editing.language || undefined },
          editing.id,
        ),
      );
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <form className="screen" onSubmit={submit}>
        <h1 className="title">{editing.id ? 'Edit contact' : 'New contact'}</h1>
        <label className="field">
          <span className="field-label">Name</span>
          <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Maria" autoFocus />
        </label>
        <label className="field">
          <span className="field-label">
            Who they are to you <span className="muted">optional</span>
          </span>
          <input
            value={editing.relationship}
            onChange={(e) => setEditing({ ...editing, relationship: e.target.value })}
            placeholder="girlfriend, mom, dentist…"
          />
          <span className="field-help">Then you can just say "call my girlfriend".</span>
        </label>
        <label className="field">
          <span className="field-label">Phone number</span>
          <span className="phone-input">
            <span className="phone-prefix" aria-hidden="true">
              +1
            </span>
            <input
              className="input-xl"
              type="tel"
              inputMode="tel"
              value={formatUsPhone(editing.digits)}
              onChange={(e) => setEditing({ ...editing, digits: usNationalDigits(e.target.value) })}
              placeholder="(415)-555-0123"
            />
          </span>
        </label>
        <label className="field">
          <span className="field-label">Call them in</span>
          <select value={editing.language} onChange={(e) => setEditing({ ...editing, language: e.target.value })}>
            <option value="">Your usual call language</option>
            {languages.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        {error && <div className="field-error">{error}</div>}
        <div className="bottom-bar">
          <div className="bar-row">
            <button type="button" className="secondary-btn" onClick={() => (setEditing(null), setError(null))}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={busy || !editing.name.trim() || editing.digits.length !== 10}>
              Save
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="screen phonebook">
        <h1 className="title">Phone book</h1>
        <p className="lede">Everyone you've called is saved here. Say "call my girlfriend" or tap Call.</p>
        <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or relationship" />
        {error && <div className="alert">{error}</div>}
        {contacts.length === 0 && <p className="muted">{q ? 'No matches.' : 'No contacts yet. They appear after your first call, or add one.'}</p>}
        <ul className="profile-list contact-list">
          {contacts.map((c) => (
            <li key={c.id} className="contact">
              <div className="contact-main">
                <b>{c.name}</b>
                {(c.relationship || c.kind) && <span className="contact-rel">{c.relationship || c.kind}</span>}
                <div className="muted">
                  {displayPhone(c.phone)}
                  {c.language ? ` · ${c.language}` : ''}
                  {c.callCount ? ` · ${c.callCount} call${c.callCount > 1 ? 's' : ''}` : ''}
                </div>
                {c.lastOutcome && <div className="muted contact-last">{c.lastOutcome}</div>}
                {confirmDelete === c.id && (
                  <div className="contact-confirm">
                    Delete {c.name}?{' '}
                    <button
                      type="button"
                      className="text-btn danger"
                      onClick={async () => {
                        try {
                          onChange(await deleteContact(settings, c.id));
                        } catch (err) {
                          setError((err as Error).message);
                        }
                        setConfirmDelete(null);
                      }}
                    >
                      Delete
                    </button>
                    <button type="button" className="text-btn" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </button>
                  </div>
                )}
              </div>
              <div className="contact-actions">
                <button type="button" className="primary-btn call small-call" onClick={() => onCall(c)}>
                  Call
                </button>
                <button type="button" className="text-btn" onClick={() => startEdit(c)}>
                  Edit
                </button>
                <button type="button" className="text-btn danger" onClick={() => setConfirmDelete(c.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="bottom-bar">
        <div className="bar-row">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Back
          </button>
          <button type="button" className="primary-btn" onClick={() => startEdit()}>
            + Add contact
          </button>
        </div>
      </div>
    </>
  );
}
