/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MULTIPLAYER_URL?: string;
  readonly VITE_MULTIPLAYER_WORKER_URL?: string;
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly PUBLIC_APP_URL?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_APP_ENV?: 'development' | 'staging' | 'production' | string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
