import { useEffect, useRef, useState } from 'react';
import type { AuthResult, CallRecord, CallRequest, Me, PublicConfig } from '../../shared/types';
import { answerQuestion, endCall, getConfig, getMe, sendCallMessage, setSignedOutHandler, signOut, startCall, updateProfile, watchCall } from './api';
import { primeAlerts } from './alerts';
import { draftToRequest, requestToDraft } from '../../shared/intake';
import type { IntakeDraft, RealtimeVoice } from '../../shared/types';
import { CallScreen } from './CallScreen';
import { simulateCall } from './demo';
import { Intake } from './Intake';
import { LANGUAGES, loadSaved, NewCall, type Involvement } from './NewCall';
import { PhoneBook } from './PhoneBook';
import { ProfileScreen } from './ProfileScreen';
import { SignIn } from './SignIn';
import { effectiveDemo, isStaticHost, loadSettings, saveSettings, type Settings } from './settings';
import { SettingsSheet } from './SettingsSheet';
import { loadVoice, saveVoice } from './VoicePicker';

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [call, setCall] = useState<CallRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [mode, setMode] = useState<'talk' | 'type'>('talk');
  const [userLanguage, setUserLanguage] = useState(() => loadSaved().user.preferredLanguage);
  /** Signed-in user; undefined while checking the saved session, null when signed out. */
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [screen, setScreen] = useState<'home' | 'profile' | 'profileTalk' | 'contacts'>('home');
  /** Calling someone from the phone book. */
  const [callSeed, setCallSeed] = useState<{ draft: IntakeDraft; text: string; key: number } | null>(null);
  const [pickedVoice, setPickedVoice] = useState<RealtimeVoice | null>(loadVoice);
  /** Stay in the loop or hand the call off; the last choice is the default. */
  const [involvement, setInvolvement] = useState<Involvement>(() => {
    try {
      return localStorage.getItem('callbridge.involvement') === 'handoff' ? 'handoff' : 'supervised';
    } catch {
      return 'supervised';
    }
  });
  const changeInvolvement = (v: Involvement) => {
    setInvolvement(v);
    try {
      localStorage.setItem('callbridge.involvement', v);
    } catch {
      /* storage unavailable */
    }
  };
  const voice = pickedVoice ?? me?.profile.voice ?? ((config?.defaultVoice as RealtimeVoice | undefined) || 'marin');
  const changeVoice = (v: RealtimeVoice) => {
    setPickedVoice(v);
    saveVoice(v);
  };
  /** The form prefilled from the voice intake, opened at the review step. */
  /** The finished call the voice assistant reports on and can follow up. */
  const [followUp, setFollowUp] = useState<{ callId: string; draft: IntakeDraft; headline?: string } | null>(null);
  const [fromIntake, setFromIntake] = useState<{ request: CallRequest; step: number; key: number } | null>(null);

  const demo = effectiveDemo(settings);
  // The voice intake needs the live server (it mints the OpenAI session key).
  const canTalk = !demo && Boolean(config?.voiceConfigured);
  const saved = loadSaved();
  const profile = me?.profile;
  const intakeContext = {
    userName: profile?.name || saved.user.name || '',
    userLanguage,
    timezone: profile?.timezone ?? saved.timezone,
    voice,
  };
  /** The user section of a call request comes from the profile when signed in. */
  const userFromProfile = (u: CallRequest['user']): CallRequest['user'] =>
    profile ? { ...u, name: profile.name || u.name, pronouns: profile.pronouns ?? u.pronouns, preferredLanguage: userLanguage } : u;

  /** Opens the form prefilled from the intake: at the review step, or at the start to keep editing. */
  const openForm = (draft: IntakeDraft, step: number) => {
    const request = draftToRequest(draft, intakeContext);
    setFromIntake({ request: { ...request, user: userFromProfile({ ...saved.user, ...request.user }) }, step, key: Date.now() });
    setMode('type');
  };
  const reviewDraft = (draft: IntakeDraft) => openForm(draft, 2);

  useEffect(() => {
    setConfig(null);
    setConfigError(null);
    if (demo) return;
    getConfig(settings).then(setConfig, (e: Error) => setConfigError(e.message));
  }, [demo, settings]);

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
    if (demo) return;
    if (!settings.sessionToken) return setMe(null);
    getMe(settings).then(
      (m) => {
        setMe(m);
        setUserLanguage(m.profile.preferredLanguage);
      },
      () => setMe((current) => current ?? null),
    );
    // Only on start and when the session changes, not on every settings edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, settings.sessionToken]);

  const onSignedIn = (r: AuthResult) => {
    updateSettings({ ...settings, sessionToken: r.token, serverUrl: settings.serverUrl, demo: false });
    setMe(r.me);
    setUserLanguage(r.me.profile.preferredLanguage);
  };

  const finishOnboarding = async () => {
    if (me && !me.profile.onboarded) setMe(await updateProfile(settings, { onboarded: true }).catch(() => me));
    setScreen('home');
  };

  const blockedReason = demo
    ? null
    : configError
      ? configError
      : config && !(config.telephonyConfigured && config.voiceConfigured)
        ? 'The server is missing Twilio or OpenAI configuration.'
        : null;

  const onSubmit = async (req: CallRequest) => {
    setError(null);
    primeAlerts(); // this tap is the gesture browsers require before the hold chime can play
    if (demo) {
      stopRef.current = simulateCall(req, setCall);
      return;
    }
    setSubmitting(true);
    try {
      const created = await startCall(settings, req);
      setCall(created);
      stopRef.current = watchCall(
        settings,
        created.id,
        (r) => {
          setCall(r);
          setError(null);
        },
        setError,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  const reset = () => {
    stopRef.current?.();
    stopRef.current = null;
    setCall(null);
    setError(null);
    setFollowUp(null);
    setFromIntake(null);
    setCallSeed(null);
  };

  const followUpOn = (finished: CallRecord) => {
    reset();
    setFollowUp({ callId: finished.id, draft: requestToDraft(finished.request), headline: finished.result?.headlineInUserLanguage });
    setMode('talk');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            📞
          </span>
          CallBridge
        </div>
        <div className="topbar-right">
          {me && (
            <>
              <button type="button" className="icon-btn" aria-label="Phone book" onClick={() => setScreen('contacts')}>
                📒
              </button>
              <button type="button" className="icon-btn" aria-label="Profile" onClick={() => setScreen('profile')}>
                👤
              </button>
            </>
          )}
          <button type="button" className={`mode-pill ${demo ? 'demo' : config ? 'live' : ''}`} onClick={() => setShowSettings(true)}>
            {demo ? 'Demo' : config ? 'Live' : configError ? 'Not connected' : '…'}
          </button>
          <button type="button" className="icon-btn" aria-label="Settings" onClick={() => setShowSettings(true)}>
            ⚙︎
          </button>
        </div>
      </header>

      <main className="content">
        {!call && demo && isStaticHost() && !settings.serverUrl && (
          <div className="notice">
            You're in <b>demo mode</b>: calls are simulated so you can try the app. To place real calls, run the server and add its URL in{' '}
            <button type="button" className="inline-link" onClick={() => setShowSettings(true)}>
              Settings
            </button>
            .
          </div>
        )}

        {!call && !demo && configError && (
          <div className="notice">
            <b>Can't use the call server.</b> {configError}
            <div className="notice-actions">
              <button type="button" className="secondary-btn small" onClick={() => setShowSettings(true)}>
                Settings
              </button>
              <button type="button" className="secondary-btn small" onClick={() => updateSettings({ ...settings, demo: true })}>
                Try demo instead
              </button>
            </div>
          </div>
        )}

        {!demo && me === undefined ? (
          <div className="muted">Loading…</div>
        ) : !demo && me === null ? (
          <SignIn settings={settings} languages={LANGUAGES} language={userLanguage} onLanguageChange={setUserLanguage} onSignedIn={onSignedIn} />
        ) : me && screen === 'contacts' && !call ? (
          <PhoneBook
            settings={settings}
            me={me}
            languages={LANGUAGES}
            onChange={setMe}
            onClose={() => setScreen('home')}
            onCall={(c) => {
              reset();
              const who = c.relationship ? `${c.name} (my ${c.relationship})` : c.name;
              setCallSeed({
                draft: {
                  counterpartName: c.name,
                  counterpartRelationship: c.relationship,
                  phoneNumber: c.phone.replace(/^\+1(?=\d{10}$)/, ''),
                  callLanguage: c.language,
                },
                text: `(Call ${who} at ${c.phone}${c.language ? `, in ${c.language}` : ''}.)`,
                key: Date.now(),
              });
              setScreen('home');
              setMode('talk');
            }}
          />
        ) : me && screen === 'profile' && !call ? (
          <ProfileScreen
            settings={settings}
            me={me}
            onChange={setMe}
            onTalk={() => setScreen('profileTalk')}
            onClose={() => setScreen('home')}
            onSignOut={() => {
              void signOut(settings).catch(() => {});
              signedOut();
            }}
            onDeleted={signedOut}
          />
        ) : me && !call && canTalk && (screen === 'profileTalk' || !me.profile.onboarded) ? (
          <Intake
            key="profile"
            profile={{ me, onSaved: setMe, onDone: () => void finishOnboarding(), onSkip: () => void finishOnboarding() }}
            settings={settings}
            context={intakeContext}
            languages={LANGUAGES}
            onLanguageChange={setUserLanguage}
            voice={voice}
            onVoiceChange={changeVoice}
            onReview={() => {}}
            onType={() => {}}
          />
        ) : call ? (
          <CallScreen
            call={call}
            demo={call.id.startsWith('demo-')}
            error={error}
            onDone={reset}
            onFollowUp={canTalk && !call.id.startsWith('demo-') ? () => followUpOn(call) : undefined}
            settings={settings}
            onMessage={async (text) => {
              await sendCallMessage(settings, call.id, text);
            }}
            onAnswer={async (questionId, answer) => {
              await answerQuestion(settings, call.id, questionId, answer);
            }}
            onEnd={async () => {
              try {
                await endCall(settings, call.id);
              } catch (e) {
                setError((e as Error).message);
                throw e;
              }
            }}
          />
        ) : (
          canTalk && mode === 'talk' ? (
            <Intake
              key={followUp?.callId ?? (callSeed ? `seed-${callSeed.key}` : 'new')}
              followUp={followUp ?? undefined}
              seed={callSeed ?? undefined}
              settings={settings}
              context={intakeContext}
              languages={LANGUAGES}
              onLanguageChange={setUserLanguage}
              voice={voice}
              onVoiceChange={changeVoice}
              onReview={reviewDraft}
              onType={(draft) => {
                const hasDraft = Object.values(draft).some((v) => v !== undefined && v !== '');
                if (hasDraft) openForm(draft, 0);
                else {
                  setFromIntake(null);
                  setMode('type');
                }
              }}
            />
          ) : (
            <NewCall
              key={fromIntake?.key ?? 'saved'}
              demo={demo}
              blockedReason={blockedReason}
              submitting={submitting}
              error={error}
              onSubmit={onSubmit}
              initial={fromIntake?.request}
              initialStep={fromIntake?.step ?? 0}
              onTalk={canTalk ? () => setMode('talk') : undefined}
              userDefaults={me ? userFromProfile : undefined}
              involvement={involvement}
              onInvolvementChange={changeInvolvement}
              voice={voice}
              onVoiceChange={changeVoice}
            />
          )
        )}
      </main>

      {showSettings && (
        <SettingsSheet
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={updateSettings}
        />
      )}
    </div>
  );
}
