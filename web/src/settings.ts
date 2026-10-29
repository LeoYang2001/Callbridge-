const KEY = 'callbridge.settings.v1';

export interface Settings {
  /** Base URL of the CallBridge server, e.g. https://abc.ngrok.app. Empty = same origin. */
  serverUrl: string;
  /** Sign-in session from verifying a code sent to the user's phone. Empty when signed out. */
  sessionToken: string;
}

/** Set at build time for hosted deployments (Cloudflare Pages, GitHub Pages). */
export const DEFAULT_SERVER_URL = (import.meta.env.VITE_DEFAULT_SERVER_URL ?? '').trim().replace(/\/+$/, '');

/** True when the UI is hosted separately from the call server (no API at the same origin). */
export const isStaticHost = () => DEFAULT_SERVER_URL !== '' || /\.(github\.io|pages\.dev)$/.test(location.hostname);

/** Server URL must be empty (same origin) or an absolute http(s) URL. Anything else (e.g. browser
 * autofill putting a username in the field) would silently send requests to the wrong place. */
export const isValidServerUrl = (url: string) => url.trim() === '' || /^https?:\/\/[^\s/]+/i.test(url.trim());

export function loadSettings(): Settings {
  const fallback: Settings = { serverUrl: DEFAULT_SERVER_URL, sessionToken: '' };
  let settings = fallback;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const { serverUrl, sessionToken } = JSON.parse(raw) as Partial<Settings>;
      settings = { serverUrl: serverUrl ?? fallback.serverUrl, sessionToken: sessionToken ?? '' };
    }
  } catch {
    /* storage unavailable */
  }
  if (!isValidServerUrl(settings.serverUrl)) settings = { ...settings, serverUrl: fallback.serverUrl };

  // Old links carried an access key as #key=…; sign-in replaced it. Connect to this same server.
  if (new URLSearchParams(location.hash.slice(1)).has('key')) {
    settings = { ...settings, serverUrl: '' };
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

