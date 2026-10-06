const KEY = 'callbridge.settings.v1';

export interface Settings {
  /** Base URL of the CallBridge server, e.g. https://abc.ngrok.app. Empty = same origin. */
  serverUrl: string;
  /** Matches the server's APP_PASSWORD. */
  accessKey: string;
  /** Simulate calls in the browser instead of dialing. */
  demo: boolean;
}

/** Set at build time for hosted deployments (Cloudflare Pages, GitHub Pages). */
export const DEFAULT_SERVER_URL = (import.meta.env.VITE_DEFAULT_SERVER_URL ?? '').trim().replace(/\/+$/, '');

/** True when the UI is hosted separately from the call server (no API at the same origin). */
export const isStaticHost = () => DEFAULT_SERVER_URL !== '' || /\.(github\.io|pages\.dev)$/.test(location.hostname);

export function loadSettings(): Settings {
  const fallback: Settings = { serverUrl: DEFAULT_SERVER_URL, accessKey: '', demo: isStaticHost() && !DEFAULT_SERVER_URL };
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
