import { useEffect, useRef, useState } from 'react';
import type { CallRecord, CallRequest, PublicConfig } from '../../shared/types';
import { getConfig, startCall, watchCall } from './api';
import { CallScreen } from './CallScreen';
import { simulateCall } from './demo';
import { NewCall } from './NewCall';
import { effectiveDemo, isStaticHost, loadSettings, saveSettings, type Settings } from './settings';
import { SettingsSheet } from './SettingsSheet';

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [call, setCall] = useState<CallRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const demo = effectiveDemo(settings);

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
      stopRef.current = watchCall(settings, created.id, setCall, setError);
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
          <CallScreen call={call} demo={call.id.startsWith('demo-')} error={error} onDone={reset} />
        ) : (
          <NewCall demo={demo} blockedReason={blockedReason} submitting={submitting} error={error} onSubmit={onSubmit} />
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
