/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** Google OAuth client ID. Absent means the Google button is hidden and
   *  guest sign-in is the only option. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Injected by Vite's `define` at build time — see vite.config.js. */
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
