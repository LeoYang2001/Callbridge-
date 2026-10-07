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

/** Server URL must be empty (same origin) or an absolute http(s) URL. Anything else (e.g. browser
 * autofill putting a username in the field) would silently send requests to the wrong place. */
export const isValidServerUrl = (url: string) => url.trim() === '' || /^https?:\/\/[^\s/]+/i.test(url.trim());

export function loadSettings(): Settings {
  const fallback: Settings = { serverUrl: DEFAULT_SERVER_URL, accessKey: '', demo: isStaticHost() && !DEFAULT_SERVER_URL };
  let settings = fallback;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) settings = { ...fallback, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable */
  }
  if (!isValidServerUrl(settings.serverUrl)) settings = { ...settings, serverUrl: fallback.serverUrl };

  // `npm run laptop` puts the access key in the QR code as #key=…; the fragment never reaches the
  // server. Use it to connect to this same server, then remove it from the address bar.
  const key = new URLSearchParams(location.hash.slice(1)).get('key');
  if (key) {
    settings = { ...settings, accessKey: key, serverUrl: '', demo: false };
    saveSettings(settings);
    history.replaceState(null, '', location.pathname + location.search);
  }
  return settings;
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
