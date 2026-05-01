/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SUPABASE_PROJECT_ID: string;
  /**
   * Phase P0 — Base URL of the platform-owner backoffice (e.g. https://admin.seudominio.com).
   * The SPA mounts AdminApp instead of App when window.location.hostname matches this URL,
   * starts with `admin.`, or when the dev override `?admin=1` is set.
   */
  readonly VITE_ADMIN_APP_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
