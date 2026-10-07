import { useEffect, useRef, useState } from 'react';
import type { CallRecord, CallRequest, PublicConfig } from '../../shared/types';
import { endCall, getConfig, startCall, watchCall } from './api';
import { draftToRequest, requestToDraft } from '../../shared/intake';
import type { IntakeDraft, RealtimeVoice } from '../../shared/types';
import { CallScreen } from './CallScreen';
import { simulateCall } from './demo';
import { Intake } from './Intake';
import { LANGUAGES, loadSaved, NewCall } from './NewCall';
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
  const [pickedVoice, setPickedVoice] = useState<RealtimeVoice | null>(loadVoice);
  const voice = pickedVoice ?? ((config?.defaultVoice as RealtimeVoice | undefined) || 'marin');
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
  const intakeContext = { userName: saved.user.name || 'me', userLanguage, timezone: saved.timezone, voice };

  /** Opens the form prefilled from the intake: at the review step, or at the start to keep editing. */
  const openForm = (draft: IntakeDraft, step: number) => {
    const request = draftToRequest(draft, intakeContext);
    setFromIntake({ request: { ...request, user: { ...saved.user, ...request.user } }, step, key: Date.now() });
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

  const blockedReason = demo
    ? null
    : configError
      ? configError
      : config && !(config.telephonyConfigured && config.voiceConfigured)
        ? 'The server is missing Twilio or OpenAI configuration.'
        : null;

  const onSubmit = async (req: CallRequest) => {
    setError(null);
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

        {call ? (
          <CallScreen
            call={call}
            demo={call.id.startsWith('demo-')}
            error={error}
            onDone={reset}
            onFollowUp={canTalk && !call.id.startsWith('demo-') ? () => followUpOn(call) : undefined}
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
              key={followUp?.callId ?? 'new'}
              followUp={followUp ?? undefined}
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
