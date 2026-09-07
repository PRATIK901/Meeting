/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional public origin the QR codes should point at, e.g.
   * http://192.168.1.50:3000. Unset, each code encodes whatever origin the app
   * is served from. This is the only environment variable the frontend has.
   */
  readonly VITE_PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
