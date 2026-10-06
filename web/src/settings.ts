const KEY = 'callbridge.settings.v1';

export interface Settings {
  /** Base URL of the CallBridge server, e.g. https://abc.ngrok.app. Empty = same origin. */
  serverUrl: string;
  /** Matches the server's APP_PASSWORD. */
  accessKey: string;
  /** Simulate calls in the browser instead of dialing. */
  demo: boolean;
}

/** On GitHub Pages there is no server at the same origin. */
export const isStaticHost = () => location.hostname.endsWith('github.io');

export function loadSettings(): Settings {
  const fallback: Settings = { serverUrl: '', accessKey: '', demo: isStaticHost() };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fallback, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** Demo mode is forced when hosted statically without a server configured. */
export const effectiveDemo = (s: Settings) => s.demo || (isStaticHost() && !s.serverUrl.trim());
