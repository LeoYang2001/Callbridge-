import { useState } from 'react';
import type { PublicConfig } from '../../shared/types';
import { getConfig } from './api';
import { DEFAULT_SERVER_URL, isStaticHost, type Settings } from './settings';

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}

export function SettingsSheet({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(settings);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const staticHost = isStaticHost();

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const c: PublicConfig = await getConfig(draft);
      const missing = [!c.telephonyConfigured && 'Twilio', !c.voiceConfigured && 'OpenAI'].filter(Boolean);
      setTest(
        missing.length
          ? { ok: false, text: `Connected, but the server is missing ${missing.join(' and ')} configuration.` }
          : { ok: true, text: `Connected. Voice model ${c.realtimeModel}${c.allowlistActive ? ', allowlist on' : ''}.` },
      );
    } catch (e) {
      setTest({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">Settings</h2>

        <label className="toggle">
          <span>
            <b>Demo mode</b>
            <span className="field-help">Simulates a call in your browser. Nothing is dialed.</span>
          </span>
          <input type="checkbox" checked={draft.demo} onChange={(e) => setDraft({ ...draft, demo: e.target.checked })} />
        </label>

        <label className="field">
          <span className="field-label">Server URL</span>
          <input
            type="url"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={staticHost ? DEFAULT_SERVER_URL || 'https://callbridge-api.example.com' : 'Same as this page'}
            value={draft.serverUrl}
            onChange={(e) => setDraft({ ...draft, serverUrl: e.target.value.trim() })}
          />
          <span className="field-help">Where the CallBridge server runs (see README). Needed for real calls.</span>
        </label>

        <label className="field">
          <span className="field-label">Access key</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="APP_PASSWORD on the server"
            value={draft.accessKey}
            onChange={(e) => setDraft({ ...draft, accessKey: e.target.value })}
          />
        </label>

        <button type="button" className="ghost-btn" disabled={testing || (staticHost && !draft.serverUrl)} onClick={runTest}>
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {test && <div className={`test-result ${test.ok ? 'ok' : 'bad'}`}>{test.text}</div>}

        <div className="bar-row sheet-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
