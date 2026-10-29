import { useEffect, useRef, useState } from 'react';
import { LANGUAGES, languageFromLocale } from '../../shared/languages';
import type { AuthResult, Contact, Me, PublicConfig, TranslatedCallRecord } from '../../shared/types';
import { getConfig, getMe, setSignedOutHandler, signOut, startTranslatedCall, watchTranslatedCall } from './api';
import { PhoneBook } from './PhoneBook';
import { ProfileScreen } from './ProfileScreen';
import { loadSettings, saveSettings, type Settings } from './settings';
import { SettingsSheet } from './SettingsSheet';
import { SignIn } from './SignIn';
import { DialScreen, TranslatedCallScreen } from './Translator';

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  /** Signed-in user; undefined while checking the saved session, null when signed out. */
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  /** The language picked on the sign-in screen (the browser's, if the app offers it). */
  const [language, setLanguage] = useState(() => languageFromLocale(navigator.language || 'en'));
  const [screen, setScreen] = useState<'home' | 'profile' | 'contacts'>('home');
  const [call, setCall] = useState<TranslatedCallRecord | null>(null);
  const [dialContact, setDialContact] = useState<Contact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  useEffect(() => {
    setConfig(null);
    setConfigError(null);
    getConfig(settings).then(setConfig, (e: Error) => setConfigError(e.message));
  }, [settings]);

  useEffect(() => () => stopRef.current?.(), []);

  // Sign-in: restore the saved session; any 401 later signs the app out.
  const signedOut = () => {
    setSettings((s) => {
      const next = { ...s, sessionToken: '' };
      saveSettings(next);
      return next;
    });
    setMe(null);
    setScreen('home');
  };
  useEffect(() => setSignedOutHandler(signedOut), []);
  useEffect(() => {
    if (!settings.sessionToken) return setMe(null);
    getMe(settings).then(setMe, () => setMe((current) => current ?? null));
    // Only on start and when the session changes, not on every settings edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sessionToken]);

  const onSignedIn = (r: AuthResult) => {
    updateSettings({ ...settings, sessionToken: r.token });
    setMe(r.me);
  };

  const blockedReason = configError ?? (config && !(config.telephonyConfigured && config.voiceConfigured) ? 'The server is missing Twilio or OpenAI configuration.' : null);

  /** Shows a call and follows it until it ends. */
  const openCall = (r: TranslatedCallRecord) => {
    stopRef.current?.();
    setCall(r);
    stopRef.current = watchTranslatedCall(
      settings,
      r.id,
      (next) => {
        setCall(next);
        setError(null);
      },
      setError,
    );
  };

  const reset = () => {
    stopRef.current?.();
    stopRef.current = null;
    setCall(null);
    setError(null);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg className="brand-mark" width="28" height="28" viewBox="0 0 30 30" aria-hidden="true">
            <rect x="1" y="5" width="18" height="14" rx="7" fill="#3346D3" />
            <rect x="11" y="11" width="18" height="14" rx="7" fill="#0B6E63" />
            <rect x="11" y="11" width="8" height="8" fill="#ffffff" opacity="0.35" />
          </svg>
          CallBridge
        </div>
        <div className="topbar-right">
          {me?.profile.onboarded && (
            <>
              <button type="button" className="icon-btn" aria-label="Phone book" onClick={() => setScreen('contacts')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="3" width="15" height="18" rx="2" />
                  <circle cx="12.5" cy="10" r="2.5" />
                  <path d="M8.5 16.5c.8-1.8 2.2-2.7 4-2.7s3.2.9 4 2.7M3 7h3M3 12h3M3 17h3" />
                </svg>
              </button>
              <button type="button" className="icon-btn" aria-label="Profile" onClick={() => setScreen('profile')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1.5-4 4.4-6 8-6s6.5 2 8 6" />
                </svg>
              </button>
            </>
          )}
          <button type="button" className={`mode-pill ${config ? 'live' : ''}`} onClick={() => setShowSettings(true)}>
            {config ? 'Live' : configError ? 'Not connected' : '…'}
          </button>
          <button type="button" className="icon-btn" aria-label="Settings" onClick={() => setShowSettings(true)}>
            ⚙︎
          </button>
        </div>
      </header>

      <main className="content">
        {!call && configError && (
          <div className="notice">
            <b>Can't reach the call server.</b> {configError}
            <div className="notice-actions">
              <button type="button" className="secondary-btn small" onClick={() => setShowSettings(true)}>
                Settings
              </button>
            </div>
          </div>
        )}

        {me === undefined ? (
          <div className="muted">Loading…</div>
        ) : me === null ? (
          <SignIn settings={settings} languages={LANGUAGES} language={language} onLanguageChange={setLanguage} onSignedIn={onSignedIn} />
        ) : !me.profile.onboarded ? (
          <ProfileScreen settings={settings} me={me} onChange={setMe} setup onClose={() => setScreen('home')} onSignOut={() => {}} onDeleted={signedOut} />
        ) : call ? (
          <TranslatedCallScreen
            settings={settings}
            call={call}
            error={error}
            onDone={() => {
              reset();
              setDialContact(null);
              void getMe(settings).then(setMe, () => {}); // the call updated the phone book
            }}
            onCallAgain={(request) => {
              reset();
              startTranslatedCall(settings, request).then(({ record }) => openCall(record), (e: Error) => setError(e.message));
            }}
          />
        ) : screen === 'contacts' ? (
          <PhoneBook
            settings={settings}
            me={me}
            languages={LANGUAGES}
            onChange={setMe}
            onClose={() => setScreen('home')}
            onCall={(c) => {
              setDialContact(c);
              setScreen('home');
            }}
          />
        ) : screen === 'profile' ? (
          <ProfileScreen
            settings={settings}
            me={me}
            onChange={setMe}
            onClose={() => setScreen('home')}
            onSignOut={() => {
              void signOut(settings).catch(() => {});
              signedOut();
            }}
            onDeleted={signedOut}
          />
        ) : (
          <DialScreen key={dialContact?.id ?? 'new'} settings={settings} me={me} contact={dialContact} blockedReason={blockedReason} onStarted={openCall} />
        )}
      </main>

      {showSettings && <SettingsSheet settings={settings} onClose={() => setShowSettings(false)} onSave={updateSettings} />}
    </div>
  );
}
