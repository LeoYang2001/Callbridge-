import { useEffect, useState } from 'react';
import type { CallRecord, CallRequest, PublicConfig } from '../../shared/types';
import { getConfig, startCall, watchCall } from './api';
import { CallForm } from './CallForm';
import { CallView } from './CallView';

export function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [call, setCall] = useState<CallRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConfig().then(setConfig, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!call?.id) return;
    return watchCall(call.id, setCall, setError);
  }, [call?.id]);

  const onSubmit = async (req: CallRequest) => {
    setSubmitting(true);
    setError(null);
    try {
      setCall(await startCall(req));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const ready = config?.telephonyConfigured && config.voiceConfigured;

  return (
    <main>
      <header>
        <h1>CallBridge</h1>
        <p className="muted">An AI language assistant that phones a business for you and reports back.</p>
      </header>

      {config && !ready && (
        <div className="banner">
          The server is not fully configured
          {!config.telephonyConfigured && ' — Twilio credentials or PUBLIC_BASE_URL are missing'}
          {!config.voiceConfigured && ' — OPENAI_API_KEY is missing'}. See the README to set up <code>.env</code>.
        </div>
      )}

      {call && error && <div className="error">{error}</div>}

      {call ? (
        <CallView
          call={call}
          onReset={() => {
            setCall(null);
            setError(null);
          }}
        />
      ) : (
        <CallForm disabled={!ready} submitting={submitting} error={error} onSubmit={onSubmit} />
      )}

      <footer className="muted small">
        Phase 0 prototype · voice model {config?.realtimeModel ?? '…'}
        {config?.allowlistActive && ' · allowlist on'}
      </footer>
    </main>
  );
}
