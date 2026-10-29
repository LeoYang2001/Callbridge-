import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { displayPhone, formatUsPhone, usNationalDigits } from '../../shared/phone';
import { languageCode, LANGUAGES } from '../../shared/languages';
import type { Contact, Me, TranslatedCallRecord, TranslatedCallRequest } from '../../shared/types';
import { askConsent, hangUpTranslatedCall, setCaptions, setInterpreter, startTranslatedCall } from './api';
import type { Settings } from './settings';

/**
 * Calling someone with translation: the user talks to them directly. Captions translate both
 * sides on screen; once the other side agrees, the user can add an AI interpreter that speaks
 * each side's words in the other's language. Indigo is the user, teal the person they call.
 */

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '#';

/** Short label for a language in the header pill. */
const SHORT: Record<string, string> = { en: 'EN', zh: '中文', ja: '日本語', ko: '한국어', es: 'ES', vi: 'VI', tl: 'TL', ru: 'RU', ar: 'AR', hi: 'HI', fr: 'FR', de: 'DE', pt: 'PT', it: 'IT' };
const short = (language: string) => SHORT[languageCode(language) ?? ''] ?? language.slice(0, 3).toUpperCase();

interface DialProps {
  settings: Settings;
  me: Me;
  /** Prefilled from the phone book or "Call again". */
  contact?: Contact | null;
  blockedReason: string | null;
  onStarted: (record: TranslatedCallRecord) => void;
}

export function DialScreen({ settings, me, contact, blockedReason, onStarted }: DialProps) {
  const [query, setQuery] = useState(contact ? contact.name : '');
  const [picked, setPicked] = useState<Contact | null>(contact ?? null);
  const [language, setLanguage] = useState(contact?.language || me.profile.defaultCallLanguage || 'English');
  const [captions, setCaptionsOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typedDigits = /^[\d\s()+\-.]+$/.test(query.trim()) ? usNationalDigits(query) : '';
  const digits = picked ? usNationalDigits(picked.phone) : typedDigits;
  const q = query.trim().toLowerCase();
  const people = useMemo(() => {
    const all = [...me.profile.contacts].sort((a, b) => (b.lastCalledAt ?? 0) - (a.lastCalledAt ?? 0));
    const matches = q && !picked && !typedDigits ? all.filter((c) => [c.name, c.relationship, c.phone].some((x) => x?.toLowerCase().includes(q))) : all;
    return matches.slice(0, 5);
  }, [me.profile.contacts, q, picked, typedDigits]);

  const own = languageCode(me.profile.preferredLanguage);
  const choices = [...new Set([language, 'English', 'Spanish', 'Japanese', 'Korean'])].filter((l) => languageCode(l) !== own).slice(0, 3);

  const pick = (c: Contact) => {
    setPicked(c);
    setQuery(c.name);
    if (c.language) setLanguage(c.language);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The web app has no calling of its own: the server rings the user's phone first.
      const { record } = await startTranslatedCall(settings, { to: `+1${digits}`, contactName: picked?.name, theirLanguage: language, join: 'phone', captions });
      onStarted(record);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const who = picked?.name ?? (digits.length === 10 ? formatUsPhone(digits) : '');

  return (
    <form className="screen dial" onSubmit={submit}>
      <h1 className="title">Who are you calling?</h1>
      <p className="lede">You talk to them yourself. Captions translate both sides.</p>

      <label className="search-field">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={typedDigits && !picked ? formatUsPhone(typedDigits) : query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
          }}
          placeholder="Name or phone number"
          aria-label="Name or phone number"
          inputMode="text"
          autoComplete="off"
        />
      </label>

      {people.length > 0 && (
        <section>
          <h2 className="section-label">{q && !picked ? 'Contacts' : 'Recent'}</h2>
          <div className="people">
            {people.map((c) => {
              const on = picked?.id === c.id;
              return (
                <button key={c.id} type="button" className={`person ${on ? 'on' : ''}`} onClick={() => pick(c)} aria-pressed={on}>
                  <span className="avatar">{initials(c.name)}</span>
                  <span className="person-text">
                    <b>{c.name}</b>
                    <span>{[c.language, c.relationship ?? displayPhone(c.phone)].filter(Boolean).join(' · ')}</span>
                  </span>
                  {on && (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-label">They speak</h2>
        <div className="lang-chips">
          {choices.map((l) => (
            <button key={l} type="button" className={`lang-chip ${l === language ? 'on' : ''}`} aria-pressed={l === language} onClick={() => setLanguage(l)}>
              {l}
            </button>
          ))}
          <label className={`lang-chip more ${choices.includes(language) ? '' : 'on'}`}>
            <span>{choices.includes(language) ? 'More' : language}</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Another language">
              {LANGUAGES.filter((l) => languageCode(l) !== own).map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <label className="toggle">
        <span>
          <b>Captions from the start</b>
          <span className="muted">Turn them on or off any time.</span>
        </span>
        <input type="checkbox" checked={captions} onChange={(e) => setCaptionsOn(e.target.checked)} />
      </label>

      {(error || blockedReason) && <div className="alert">{error ?? blockedReason}</div>}

      <div className="bottom-bar">
        <button type="submit" className="primary-btn call wide-call" disabled={busy || digits.length !== 10 || Boolean(blockedReason)}>
          <PhoneIcon />
          {busy ? 'Calling…' : who ? `Call ${who}` : 'Call'}
        </button>
        <p className="bar-note">
          {captions ? 'Captions on · ' : ''}we ring your phone ({displayPhone(me.phone)}) first
        </p>
      </div>
    </form>
  );
}

function PhoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  );
}

/** What to ask before adding the interpreter, by language code. */
const ASK: Record<string, string> = {
  en: 'Is it OK if an AI interpreter joins to translate for us?',
  es: '¿Le parece bien si se une un intérprete de IA para traducir?',
  ja: 'AI通訳に入ってもらって通訳してもらってもいいですか？',
  ko: 'AI 통역사가 들어와서 통역해도 괜찮을까요?',
  zh: '可以让 AI 翻译加入，帮我们翻译吗？',
  vi: 'Có phiền không nếu một phiên dịch viên AI tham gia để dịch giúp chúng ta?',
  ru: 'Вы не против, если к разговору подключится ИИ-переводчик?',
  hi: 'क्या एक AI दुभाषिया अनुवाद के लिए जुड़ सकता है?',
  fr: 'Est-ce que je peux ajouter un interprète IA pour traduire ?',
  pt: 'Tudo bem se um intérprete de IA entrar para traduzir?',
};

interface LiveProps {
  settings: Settings;
  call: TranslatedCallRecord;
  error: string | null;
  onDone: () => void;
  onCallAgain: (request: TranslatedCallRequest) => void;
}

export function TranslatedCallScreen({ settings, call, error, onDone, onCallAgain }: LiveProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
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
  useEffect(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), [call.lines.length, call.lines.at(-1)?.translation, call.lines.at(-1)?.original]);
  useEffect(() => {
    if (call.interpreter !== 'off' || over) setAsking(false);
  }, [call.interpreter, over]);

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setActionError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setActionError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const seconds = call.answeredAt ? Math.floor(((call.endedAt ?? now) - call.answeredAt) / 1000) : 0;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  if (call.status === 'connecting_you' || call.status === 'dialing') {
    const you = call.status === 'dialing';
    return (
      <div className="connecting">
        <div className="rings">
          <span className="avatar big">{initials(who)}</span>
        </div>
        <h1>{who}</h1>
        <p className="connecting-sub">{you ? 'Calling…' : 'Answer your phone'}</p>
        <ol className="steps">
          <li className={you ? 'done' : 'now'}>
            <span className="step-dot" aria-hidden="true" />
            <span>
              <b>{you ? "You're connected" : 'Your phone is ringing'}</b>
              <span>{you ? 'Your phone answered' : 'Pick up to start the call'}</span>
            </span>
          </li>
          <li className={you ? 'now' : 'next'}>
            <span className="step-dot" aria-hidden="true" />
            <span>
              <b>Ringing {who}</b>
              <span>They speak {call.request.theirLanguage}</span>
            </span>
          </li>
        </ol>
        <div className="connecting-tip">
          <b>When they answer</b>
          <span>Say hello in your own words. Captions show what they say in {call.userLanguage}.</span>
        </div>
        {(error || actionError) && <div className="alert">{actionError ?? error}</div>}
        <button type="button" className="end-round" aria-label="End call" disabled={busy !== null} onClick={() => void act('end', () => hangUpTranslatedCall(settings, call.id))}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 14.5c5-4.7 13-4.7 18 0l-2.4 2.6-3.3-1.4v-2.6a10 10 0 0 0-6.6 0v2.6l-3.3 1.4z" />
          </svg>
        </button>
      </div>
    );
  }

  const theirCode = languageCode(call.request.theirLanguage) ?? 'en';
  const yourCode = languageCode(call.userLanguage) ?? 'en';
  const lines = (
    <div className="captions">
      {call.lines.length === 0 && !over && <p className="muted center">{call.captions ? 'Captions appear here as you talk.' : 'Captions are off.'}</p>}
      {call.lines.map((l) => (
        <div key={l.id} className={`cap-line ${l.speaker} ${l.final || over ? '' : 'speaking'}`}>
          <span className="cap-who">
            {l.speaker === 'you' ? 'You' : who}
            {l.final || over ? '' : ' · speaking'}
          </span>
          {/* Their words in the user's language first; the user's own words with the translation. */}
          <span className="cap-main">{l.speaker === 'them' ? l.translation || l.original : l.original}</span>
          <span className="cap-sub">{l.speaker === 'them' ? (l.translation ? l.original : '') : l.translation}</span>
        </div>
      ))}
      <div ref={end} />
    </div>
  );

  if (over) {
    return (
      <div className="screen summary">
        <p className="section-label">{call.status === 'failed' ? 'Call didn’t connect' : `Call ended · ${clock}`}</p>
        <h1 className="title">{who}</h1>
        {call.status === 'failed' && call.failureReason && <div className="notice">{call.failureReason}</div>}
        {call.lines.length > 0 && (
          <details className="transcript-card" open={call.lines.length <= 6}>
            <summary>Captions ({call.lines.length} lines)</summary>
            {lines}
          </details>
        )}
        <div className="bottom-bar">
          <div className="bar-row">
            <button type="button" className="secondary-btn" onClick={onDone}>
              Done
            </button>
            <button type="button" className="primary-btn call" onClick={() => onCallAgain(call.request)}>
              Call again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="live">
      <header className="live-head">
        <span className="avatar">{initials(who)}</span>
        <span className="live-who">
          <b>{who}</b>
          <span>
            <span className="live-dot" aria-hidden="true" />
            {clock}
            {call.captions ? ' · Captions on' : ''}
          </span>
        </span>
        <span className="pair-pill">
          {short(call.request.theirLanguage)} ⇄ {short(call.userLanguage)}
        </span>
      </header>

      {call.interpreter !== 'off' && (
        <div className="interp-banner" role="status">
          <span className="bars" aria-hidden="true">
            <i /> <i /> <i /> <i /> <i />
          </span>
          <span>
            <b>{call.interpreter === 'joining' ? 'Interpreter joining…' : 'Interpreter on'}</b>
            <span>{call.interpreter === 'joining' ? 'Telling both sides it’s an AI' : `Speaking for both of you`}</span>
          </span>
        </div>
      )}
      {call.notice && <div className="notice">{call.notice}</div>}
      {(error || actionError) && <div className="alert">{actionError ?? error}</div>}
      {call.interpreter === 'on' && <p className="sys-chip">Interpreter joined · both sides were told</p>}

      {lines}

      {asking && (
        <div className="sheet-backdrop" onClick={() => setAsking(false)}>
          <div className="sheet ask-sheet" role="dialog" aria-modal="true" aria-labelledby="ask-title" onClick={(e) => e.stopPropagation()}>
            <span className="sheet-handle" />
            <h2 id="ask-title">Ask them first</h2>
            <p className="muted">The interpreter joins only if they agree. Say this, or let the app ask for you.</p>
            <div className="ask-phrase">
              <span className="section-label">In {call.request.theirLanguage}</span>
              <b>“{ASK[theirCode] ?? ASK.en}”</b>
              {yourCode !== theirCode && ASK[yourCode] && <span>{ASK[yourCode]}</span>}
            </div>
            <button type="button" className="outline-btn them" disabled={busy !== null} onClick={() => void act('ask', () => askConsent(settings, call.id))}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 10v4h4l5 4V6L8 10z" />
                <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />
              </svg>
              {busy === 'ask' ? 'Asking…' : 'Ask for me'}
            </button>
            <div className="bar-row">
              <button type="button" className="secondary-btn" onClick={() => setAsking(false)}>
                Not now
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={busy !== null}
                onClick={() => void act('add', () => setInterpreter(settings, call.id, true)).then((ok) => ok && setAsking(false))}
              >
                {busy === 'add' ? 'Adding…' : 'They agreed: add it'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bottom-bar">
        <div className="bar-row" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className={`secondary-btn toggle-btn ${call.captions ? 'on' : ''}`}
            aria-pressed={call.captions}
            disabled={busy !== null || !live}
            onClick={() => void act('captions', () => setCaptions(settings, call.id, !call.captions))}
          >
            Captions
          </button>
          {call.interpreter === 'off' ? (
            <button type="button" className="primary-btn" disabled={busy !== null || !live} onClick={() => setAsking(true)}>
              Add interpreter
            </button>
          ) : (
            <button
              type="button"
              className="outline-btn"
              disabled={busy !== null || call.interpreter === 'joining'}
              onClick={() => void act('remove', () => setInterpreter(settings, call.id, false))}
            >
              Remove interpreter
            </button>
          )}
        </div>
        <button type="button" className="primary-btn end-call wide" disabled={busy !== null} onClick={() => void act('end', () => hangUpTranslatedCall(settings, call.id))}>
          End call
        </button>
      </div>
    </div>
  );
}
