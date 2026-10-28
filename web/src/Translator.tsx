import { useEffect, useRef, useState, type FormEvent } from 'react';
import { displayPhone, formatUsPhone, usNationalDigits } from '../../shared/phone';
import { LANGUAGES } from '../../shared/languages';
import type { Contact, Me, TranslatedCallRecord } from '../../shared/types';
import { hangUpTranslatedCall, setCaptions, setInterpreter, startTranslatedCall } from './api';
import type { Settings } from './settings';

/**
 * Calling someone with translation: the user talks to them directly. Captions translate both
 * sides on screen; once the other side agrees, the user can add an AI interpreter that speaks
 * each side's words in the other's language.
 */

interface DialProps {
  settings: Settings;
  me: Me;
  /** Prefilled from the phone book. */
  contact?: Contact | null;
  blockedReason: string | null;
  onStarted: (record: TranslatedCallRecord) => void;
}

export function DialScreen({ settings, me, contact, blockedReason, onStarted }: DialProps) {
  const [digits, setDigits] = useState(contact ? usNationalDigits(contact.phone) : '');
  const [name, setName] = useState(contact?.name ?? '');
  const [language, setLanguage] = useState(contact?.language || me.profile.defaultCallLanguage || 'English');
  const [captions, setCaptionsOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recent = [...me.profile.contacts].sort((a, b) => (b.lastCalledAt ?? 0) - (a.lastCalledAt ?? 0)).slice(0, 8);
  const pick = (c: Contact) => {
    setDigits(usNationalDigits(c.phone));
    setName(c.name);
    if (c.language) setLanguage(c.language);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The web app has no calling of its own: the server rings the user's phone first.
      const { record } = await startTranslatedCall(settings, { to: `+1${digits}`, contactName: name.trim() || undefined, theirLanguage: language, join: 'phone', captions });
      onStarted(record);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="screen" onSubmit={submit}>
      <h1 className="title">Call with a translator</h1>
      <p className="lede">You talk to them yourself. Captions translate both sides, and an AI interpreter can join if they agree.</p>

      {recent.length > 0 && (
        <div className="chips" style={{ marginBottom: 16 }}>
          {recent.map((c) => (
            <button key={c.id} type="button" className={`chip ${usNationalDigits(c.phone) === digits ? 'on' : ''}`} onClick={() => pick(c)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

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
            value={formatUsPhone(digits)}
            onChange={(e) => {
              setDigits(usNationalDigits(e.target.value));
              setName('');
            }}
            placeholder="(415)-555-0123"
          />
        </span>
      </label>

      <label className="field">
        <span className="field-label">They speak</span>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>

      <label className="toggle">
        <span>
          <b>Captions from the start</b>
          <span className="muted">You can turn them on or off during the call.</span>
        </span>
        <input type="checkbox" checked={captions} onChange={(e) => setCaptionsOn(e.target.checked)} />
      </label>

      <p className="muted">We'll ring your phone ({displayPhone(me.phone)}) first, then call them.</p>
      {(error || blockedReason) && <div className="alert">{error ?? blockedReason}</div>}

      <div className="bottom-bar">
        <div className="bar-row">
          <button type="submit" className="primary-btn call" disabled={busy || digits.length !== 10 || Boolean(blockedReason)}>
            {busy ? 'Calling…' : `📞 Call${name ? ` ${name}` : ''}`}
          </button>
        </div>
      </div>
    </form>
  );
}

/** What to ask before adding the interpreter, in the other side's language. */
const ASK: Record<string, string> = {
  English: 'Is it OK if an AI interpreter joins to translate for us?',
  Spanish: '¿Le parece bien si se une un intérprete de IA para traducir?',
  Japanese: 'AI通訳に入ってもらって通訳してもらってもいいですか？',
  Korean: 'AI 통역사가 들어와서 통역해도 괜찮을까요?',
  'Chinese (Mandarin)': '可以让 AI 翻译加入通话帮我们翻译吗？',
  Vietnamese: 'Có phiền không nếu một phiên dịch viên AI tham gia để dịch giúp chúng ta?',
  Russian: 'Вы не против, если к разговору подключится ИИ-переводчик?',
  Hindi: 'क्या एक AI दुभाषिया अनुवाद के लिए जुड़ सकता है?',
};

interface LiveProps {
  settings: Settings;
  call: TranslatedCallRecord;
  error: string | null;
  onDone: () => void;
}

export function TranslatedCallScreen({ settings, call, error, onDone }: LiveProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const end = useRef<HTMLDivElement>(null);
  const live = call.status === 'live';
  const over = call.status === 'ended' || call.status === 'failed';
  const who = call.request.contactName || displayPhone(call.request.to);

  useEffect(() => {
    if (over) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [over]);
  useEffect(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), [call.lines.length, call.lines.at(-1)?.translation]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const elapsed = call.answeredAt ? Math.floor(((call.endedAt ?? now) - call.answeredAt) / 1000) : 0;
  const status =
    call.status === 'connecting_you'
      ? 'Answer your phone: it’s ringing'
      : call.status === 'dialing'
        ? `Calling ${who}…`
        : live
          ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
          : call.status === 'failed'
            ? call.failureReason ?? 'The call didn’t connect.'
            : 'Call ended';

  return (
    <div className="screen">
      <h1 className="title" style={{ marginBottom: 4 }}>
        {who}
      </h1>
      <p className="lede" style={{ margin: '0 0 12px' }}>
        {status}
        {call.interpreter === 'on' ? ' · 🗣 Interpreter on' : call.interpreter === 'joining' ? ' · Interpreter joining…' : ''}
      </p>
      {call.notice && <div className="notice">{call.notice}</div>}
      {(error || actionError) && <div className="alert">{actionError ?? error}</div>}

      <div className="captions">
        {call.lines.length === 0 && (
          <p className="muted">{call.captions ? 'Captions appear here as you talk.' : 'Captions are off.'}</p>
        )}
        {call.lines.map((l) => (
          <div key={l.id} className={`cap-line ${l.speaker}`}>
            <span className="cap-who">{l.speaker === 'you' ? 'You' : who}</span>
            {/* Their words in the user's language first; the user's own words with what they heard. */}
            <span className="cap-main">{l.speaker === 'them' ? l.translation || l.original : l.original}</span>
            <span className="cap-sub">{l.speaker === 'them' ? (l.translation ? l.original : '') : l.translation}</span>
          </div>
        ))}
        <div ref={end} />
      </div>

      {asking && (
        <div className="notice">
          <b>Ask them first.</b> Say something like:
          <p className="cap-ask">{ASK[call.request.theirLanguage] ?? ASK.English}</p>
          {call.request.theirLanguage !== 'English' && <p className="muted">{ASK.English}</p>}
          <div className="notice-actions">
            <button type="button" className="secondary-btn small" onClick={() => setAsking(false)}>
              Not now
            </button>
            <button
              type="button"
              className="secondary-btn small"
              disabled={busy}
              onClick={() => void act(() => setInterpreter(settings, call.id, true)).then(() => setAsking(false))}
            >
              They agreed: add interpreter
            </button>
          </div>
        </div>
      )}

      <div className="bottom-bar">
        {over ? (
          <div className="bar-row">
            <button type="button" className="primary-btn" onClick={onDone}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="bar-row" style={{ marginBottom: 8 }}>
              <button type="button" className="secondary-btn" disabled={busy || !live} onClick={() => void act(() => setCaptions(settings, call.id, !call.captions))}>
                {call.captions ? 'Turn off captions' : 'Turn on captions'}
              </button>
              <button
                type="button"
                className="secondary-btn"
                style={{ flex: 1 }}
                disabled={busy || !live || call.interpreter === 'joining'}
                onClick={() => (call.interpreter === 'off' ? setAsking(true) : void act(() => setInterpreter(settings, call.id, false)))}
              >
                {call.interpreter === 'off' ? '🗣 Add interpreter' : 'Remove interpreter'}
              </button>
            </div>
            <div className="bar-row">
              <button type="button" className="primary-btn end-call" disabled={busy} onClick={() => void act(() => hangUpTranslatedCall(settings, call.id))}>
                End call
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
