/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Call server the hosted UI talks to by default, e.g. https://callbridge-api.byte2bite.tech */
  readonly VITE_DEFAULT_SERVER_URL?: string;
}
