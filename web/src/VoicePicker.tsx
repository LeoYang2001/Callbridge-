import { REALTIME_VOICES, type RealtimeVoice } from '../../shared/types';

const VOICE_KEY = 'callbridge.voice';

export function loadVoice(): RealtimeVoice | null {
  try {
    const v = localStorage.getItem(VOICE_KEY);
    return REALTIME_VOICES.includes(v as RealtimeVoice) ? (v as RealtimeVoice) : null;
  } catch {
    return null;
  }
}

export function saveVoice(v: RealtimeVoice) {
  try {
    localStorage.setItem(VOICE_KEY, v);
  } catch {
    /* storage unavailable */
  }
}

/** Voice for both the intake assistant and the phone call. */
export function VoicePicker({ value, onChange, disabled }: { value: RealtimeVoice; onChange: (v: RealtimeVoice) => void; disabled?: boolean }) {
  return (
    <label className="field compact">
      <span className="field-label">Voice</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as RealtimeVoice)}>
        {REALTIME_VOICES.map((v) => (
          <option key={v} value={v}>
            {v[0]!.toUpperCase() + v.slice(1)}
            {v === 'marin' || v === 'cedar' ? ' ★' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
