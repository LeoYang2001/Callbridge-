import { useState } from 'react';
import { displayPhone } from '../../shared/phone';
import type { Me } from '../../shared/types';
import { deleteAccount, updateProfile } from './api';
import type { Settings } from './settings';

interface Props {
  settings: Settings;
  me: Me;
  onChange: (me: Me) => void;
  onTalk: () => void;
  onClose: () => void;
  onSignOut: () => void;
  onDeleted: () => void;
}

/** Everything CallBridge has saved about the user, with a way to delete each piece. */
export function ProfileScreen({ settings, me, onChange, onTalk, onClose, onSignOut, onDeleted }: Props) {
  const p = me.profile;
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async (patch: Record<string, unknown>) => {
    setError(null);
    try {
      onChange(await updateProfile(settings, patch));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const removeAt = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i);

  return (
    <>
      <div className="screen profile">
        <h1 className="title">{p.name || 'Your profile'}</h1>
        <p className="lede">
          +1 {displayPhone(me.phone).replace(/^\+1 /, '')} · {[p.preferredLanguage, ...p.otherLanguages].join(', ')} · {p.timezone}
        </p>
        <button type="button" className="ghost-btn" onClick={onTalk}>
          🎙 Update by talking
        </button>
        {error && <div className="alert">{error}</div>}

        <Group title="Usually free" empty="Not set">
          {p.usualAvailability.map((w, i) => (
            <Item key={i} onDelete={() => void save({ usualAvailability: removeAt(p.usualAvailability, i) })}>
              {w.days.join('/')} {w.start}–{w.end}
            </Item>
          ))}
        </Group>

        <Group title="May be shared on calls (you confirm per call)" empty="Nothing">
          {p.shareable.map((f, i) => (
            <Item key={i} onDelete={() => void save({ shareable: removeAt(p.shareable, i) })}>
              <b>{f.label}:</b> {f.value}
            </Item>
          ))}
        </Group>

        <Group title="Preferences" empty="None">
          {p.preferences.map((x, i) => (
            <Item key={i} onDelete={() => void save({ preferences: removeAt(p.preferences, i) })}>
              {x}
            </Item>
          ))}
        </Group>

        <Group title="Upcoming appointments" empty="None">
          {p.appointments.map((a, i) => (
            <Item key={a.id} onDelete={() => void save({ appointments: removeAt(p.appointments, i).map(({ id }) => ({ id })) })}>
              <b>
                {a.date} {a.time}
              </b>{' '}
              · {a.with}
              {a.needsConfirmation && <span className="muted"> · needs confirming</span>}
            </Item>
          ))}
        </Group>

        <Group title="Contacts from your calls" empty="None yet">
          {p.contacts.map((c, i) => (
            <Item key={c.id} onDelete={() => void save({ contacts: removeAt(p.contacts, i).map(({ id }) => ({ id })) })}>
              <b>{c.name}</b> · {displayPhone(c.phone)}
              {c.lastOutcome && <div className="muted">{c.lastOutcome}</div>}
              {c.notes.length > 0 && <div className="muted">{c.notes.join(' ')}</div>}
            </Item>
          ))}
        </Group>

        <Group title="Decisions from calls" empty="None yet">
          {[...p.history].reverse().map((h, i) => (
            <Item
              key={`${h.callId}:${h.at}`}
              onDelete={() =>
                void save({
                  history: p.history.filter((_, j) => j !== p.history.length - 1 - i).map(({ callId, at }) => ({ callId, at })),
                })
              }
            >
              {h.text}
            </Item>
          ))}
        </Group>

        <div className="profile-danger">
          <button type="button" className="text-btn" onClick={onSignOut}>
            Sign out
          </button>
          {confirmDelete ? (
            <span>
              Delete your account, profile, and call history?{' '}
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
      </div>

      <div className="bottom-bar">
        <div className="bar-row">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Back
          </button>
        </div>
      </div>
    </>
  );
}

function Group({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="rsection">
      <div className="rsection-title">{title}</div>
      {children.length ? <ul className="profile-list">{children}</ul> : <div className="muted">{empty}</div>}
    </div>
  );
}

function Item({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return (
    <li className="profile-item">
      <div>{children}</div>
      <button type="button" className="icon-btn" aria-label="Delete" onClick={onDelete}>
        ×
      </button>
    </li>
  );
}
